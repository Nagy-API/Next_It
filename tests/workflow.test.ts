import { afterAll, describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { activityLog, comments, contentItems, itemPlatforms, stageCompletions, stages } from "@/db/schema";
import { createItems, bulkStageAction, updateItem } from "@/server/items";
import {
  assignStage,
  completeStage,
  returnToStage,
  setLateException,
  setPlatformState,
  setStageDeadline,
} from "@/server/workflow";
import { createProject, findOrCreateClient } from "@/server/admin";
import { stageHealth } from "@/domain/workflow";
import { cairoNoon, makeBrand, makePlatform, makeUser, uid } from "./helpers";

afterAll(async () => {
  await closeDb();
});

async function stagesOf(itemId: string) {
  return db.select().from(stages).where(eq(stages.itemId, itemId)).orderBy(asc(stages.position));
}
async function logOf(itemId: string) {
  return db.select().from(activityLog).where(eq(activityLog.itemId, itemId)).orderBy(asc(activityLog.id));
}
const byKind = (all: Awaited<ReturnType<typeof stagesOf>>, k: string) => all.find((s) => s.kind === k)!;

describe("Scenario 1 — The Ampoule (Reel) end to end", () => {
  it("hands off automatically from Content → Media → Social → Published", async () => {
    const king = await makeUser("King", ["content"]);
    const ayman = await makeUser("Ayman", ["media"]);
    const esraa = await makeUser("Esraa", ["social"]);
    const brand = await makeBrand("Vanilla Roza", king.id);
    const ig = await makePlatform("Instagram");
    const tt = await makePlatform("TikTok");

    const [id] = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 10 }, [
      { title: "The Ampoule", type: "reel", postingDate: "2026-10-11", canvaUrl: "https://canva.link/fxgdr0zjw5uxt3m" },
    ]);
    let all = await stagesOf(id);
    expect(all.map((s) => s.kind)).toEqual(["content", "media", "social"]);
    expect(byKind(all, "content").status).toBe("active");
    expect(byKind(all, "content").assigneeId).toBe(king.id); // brand default creator

    // King completes Content: who + when are recorded, Media becomes current.
    const t1 = cairoNoon("2026-09-22");
    await completeStage(king, byKind(all, "content").id, { now: t1 });
    all = await stagesOf(id);
    expect(byKind(all, "content")).toMatchObject({ status: "done", completedById: king.id });
    expect(byKind(all, "content").completedAt?.toISOString()).toBe(t1.toISOString());
    expect(byKind(all, "media").status).toBe("active");
    expect(byKind(all, "media").activatedAt?.toISOString()).toBe(t1.toISOString());

    // Ayman takes it; can't submit without a Drive link.
    await assignStage(ayman, byKind(all, "media").id, ayman.id);
    await expect(completeStage(ayman, byKind(all, "media").id)).rejects.toThrow(/Drive link/);

    const t2 = cairoNoon("2026-09-29");
    await completeStage(ayman, byKind(all, "media").id, { driveUrl: "https://drive.google.com/file/d/ampoule-final", now: t2 });
    all = await stagesOf(id);
    expect(byKind(all, "media")).toMatchObject({ status: "done", completedById: ayman.id });
    expect(byKind(all, "social").status).toBe("active");
    const [item] = await db.select().from(contentItems).where(eq(contentItems.id, id));
    expect(item.driveUrl).toBe("https://drive.google.com/file/d/ampoule-final");
    expect(item.completedAt).toBeNull();

    // Social publishes per platform. Scheduling one doesn't finish the item.
    await setPlatformState(esraa, id, ig.id, { status: "published", liveUrl: "https://instagram.com/p/ampoule" }, { now: cairoNoon("2026-10-11") });
    await setPlatformState(esraa, id, tt.id, { status: "scheduled", date: "2026-10-12", time: "19:00" });
    all = await stagesOf(id);
    expect(byKind(all, "social").status).toBe("active");

    await setPlatformState(esraa, id, tt.id, { status: "published", liveUrl: "https://tiktok.com/@vr/video/1" }, { now: cairoNoon("2026-10-12") });
    all = await stagesOf(id);
    expect(byKind(all, "social")).toMatchObject({ status: "done", completedById: esraa.id });
    const [done] = await db.select().from(contentItems).where(eq(contentItems.id, id));
    expect(done.completedAt).not.toBeNull();

    const plats = await db.select().from(itemPlatforms).where(eq(itemPlatforms.itemId, id));
    expect(plats.find((p) => p.platformId === ig.id)).toMatchObject({ status: "published", liveUrl: "https://instagram.com/p/ampoule", date: "2026-10-11" });

    // Credited to the assignee, one completion per stage.
    const comps = await db.select().from(stageCompletions).where(eq(stageCompletions.itemId, id));
    expect(comps.map((c) => [c.kind, c.creditedUserId])).toEqual(
      expect.arrayContaining([
        ["content", king.id],
        ["media", ayman.id],
        ["social", esraa.id],
      ]),
    );

    const log = await logOf(id);
    const actions = log.map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(["item_created", "stage_completed", "stage_assigned", "drive_link_changed", "platform_updated"]));
    expect(log.find((l) => l.action === "stage_assigned")?.summary).toContain("assigned Media Production to Ayman");

    // Un-publishing a platform re-opens Social.
    await setPlatformState(esraa, id, tt.id, { status: "scheduled" });
    all = await stagesOf(id);
    expect(byKind(all, "social").status).toBe("active");
  });

  it("does not let Social publish before production delivered", async () => {
    const king = await makeUser("King", ["content"]);
    const brand = await makeBrand("VR", king.id);
    const ig = await makePlatform("Instagram");
    const esraa = await makeUser("Esraa", ["social"]);
    const [id] = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 10 }, [{ title: "Early", type: "reel" }], {
      platformIds: [ig.id],
    });
    await expect(setPlatformState(esraa, id, ig.id, { status: "published" })).rejects.toThrow(/isn't ready/);
    await expect(setPlatformState(king, id, ig.id, { status: "pending" })).rejects.toThrow(/Social Media team/);
  });
});

describe("Scenario 2 — delay dependency", () => {
  it("shifts downstream deadlines by the upstream delay, once, and never blames the blocked stage", async () => {
    const king = await makeUser("King", ["content"]);
    const ayman = await makeUser("Ayman", ["media"]);
    const brand = await makeBrand("VR", king.id);
    const [id] = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 10 }, [{ title: "Late Reel", type: "reel" }]);
    let all = await stagesOf(id);
    await setStageDeadline(king, byKind(all, "content").id, "2026-10-05");
    await setStageDeadline(king, byKind(all, "media").id, "2026-10-07");
    await setStageDeadline(king, byKind(all, "social").id, "2026-10-09");
    await assignStage(ayman, byKind(all, "media").id, ayman.id);
    all = await stagesOf(id);

    // On Oct 8 Media's original deadline has passed, but Media never received the work: blocked, not late.
    expect(stageHealth(byKind(all, "media"), "2026-10-08")).toBe("blocked");
    expect(stageHealth(byKind(all, "content"), "2026-10-08")).toBe("overdue");

    // Content delivers 3 days late.
    const res = await completeStage(king, byKind(all, "content").id, { now: cairoNoon("2026-10-08") });
    expect(res.lateDays).toBe(3);
    all = await stagesOf(id);
    expect(byKind(all, "media")).toMatchObject({ originalDeadline: "2026-10-07", deadline: "2026-10-10", shiftDays: 3 });
    expect(byKind(all, "media").shiftReason).toMatch(/Shifted by 3 days because Content was delivered late/);
    expect(byKind(all, "social")).toMatchObject({ originalDeadline: "2026-10-09", deadline: "2026-10-12", shiftDays: 3 });
    expect(stageHealth(byKind(all, "media"), "2026-10-08")).toBe("due_soon");

    const [contentComp] = await db.select().from(stageCompletions).where(and(eq(stageCompletions.itemId, id), eq(stageCompletions.kind, "content")));
    expect(contentComp).toMatchObject({ lateDays: 3, excused: false, creditedUserId: king.id });

    const shifts = (await logOf(id)).filter((l) => l.action === "deadline_shifted");
    expect(shifts.map((s) => [s.stageKind, s.oldValue, s.newValue])).toEqual([
      ["media", "2026-10-07", "2026-10-10"],
      ["social", "2026-10-09", "2026-10-12"],
    ]);

    // Media delivers on its adjusted deadline → on time, no further shift.
    const m = await completeStage(ayman, byKind(all, "media").id, { driveUrl: "https://drive.google.com/x", now: cairoNoon("2026-10-10") });
    expect(m.lateDays).toBe(0);
    all = await stagesOf(id);
    expect(byKind(all, "social").deadline).toBe("2026-10-12");
    expect(stageHealth(byKind(all, "media"))).toBe("done_on_time");

    // Returned to Content and re-delivered the same day: the 3-day delay is NOT applied again.
    await returnToStage(ayman, id, "content", null, { now: cairoNoon("2026-10-10") });
    all = await stagesOf(id);
    await completeStage(king, byKind(all, "content").id, { now: cairoNoon("2026-10-08") });
    all = await stagesOf(id);
    expect(byKind(all, "social").deadline).toBe("2026-10-12");

    // A later re-delivery only shifts by the *additional* delay (6 total − 3 already applied).
    await returnToStage(ayman, id, "content", "Fix the hook", { now: cairoNoon("2026-10-10") });
    all = await stagesOf(id);
    await completeStage(king, byKind(all, "content").id, { now: cairoNoon("2026-10-11") });
    all = await stagesOf(id);
    expect(byKind(all, "social").deadline).toBe("2026-10-15");
    expect(byKind(all, "media").deadline).toBe("2026-10-13");
    expect(byKind(all, "media").originalDeadline).toBe("2026-10-07");

    // Rework completions are marked as rounds > 1 so insights don't count them as deadline misses.
    const comps = await db.select().from(stageCompletions).where(and(eq(stageCompletions.itemId, id), eq(stageCompletions.kind, "content")));
    expect(comps.map((c) => c.round).sort()).toEqual([1, 2, 3]);
  });

  it("an exception removes the lateness from accountability but still protects downstream", async () => {
    const king = await makeUser("King", ["content"]);
    const shahenda = await makeUser("Shahenda", ["leadership"], true);
    const brand = await makeBrand("VR", king.id);
    const [id] = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 10 }, [{ title: "Excused", type: "static" }]);
    let all = await stagesOf(id);
    await setStageDeadline(king, byKind(all, "content").id, "2026-10-05");
    await setStageDeadline(king, byKind(all, "design").id, "2026-10-07");
    all = await stagesOf(id);
    await completeStage(king, byKind(all, "content").id, { now: cairoNoon("2026-10-07") });
    await setLateException(shahenda, byKind(all, "content").id, true);
    all = await stagesOf(id);
    expect(stageHealth(byKind(all, "content"))).toBe("done_excused");
    expect(byKind(all, "design").deadline).toBe("2026-10-09");
    const [comp] = await db.select().from(stageCompletions).where(eq(stageCompletions.stageId, byKind(all, "content").id));
    expect(comp).toMatchObject({ lateDays: 2, excused: true, excusedById: shahenda.id });
    const log = await logOf(id);
    expect(log.some((l) => l.action === "deadline_exception_applied" && l.actorId === shahenda.id)).toBe(true);
  });
});

describe("Scenario 3 — return to an earlier stage", () => {
  it("anyone can send work back with an optional note; the cycle then continues", async () => {
    const king = await makeUser("King", ["content"]);
    const ayman = await makeUser("Ayman", ["media"]);
    const assem = await makeUser("Assem", ["account"]);
    const brand = await makeBrand("VR", king.id);
    const [id] = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 10 }, [{ title: "Script Fix", type: "reel" }], {
      contentReady: true,
    });
    let all = await stagesOf(id);
    expect(byKind(all, "media").status).toBe("active");
    await assignStage(assem, byKind(all, "media").id, ayman.id);

    await returnToStage(assem, id, "content", "The script needs a stronger hook.");
    all = await stagesOf(id);
    expect(byKind(all, "content")).toMatchObject({ status: "active", round: 2, returnedById: assem.id, returnNote: "The script needs a stronger hook." });
    expect(byKind(all, "media").status).toBe("waiting");
    expect(byKind(all, "media").assigneeId).toBe(ayman.id); // assignment kept

    const cs = await db.select().from(comments).where(eq(comments.itemId, id));
    expect(cs[0]).toMatchObject({ authorId: assem.id, tag: "Returned to Content" });
    const log = await logOf(id);
    const ret = log.find((l) => l.action === "stage_returned")!;
    expect(ret.actorId).toBe(assem.id);
    expect(ret.summary).toContain("from Media Production to Content");

    // Can't "return" forward.
    await expect(returnToStage(assem, id, "social")).rejects.toThrow(/earlier stage/);

    // No note is fine too.
    await completeStage(king, byKind(all, "content").id);
    all = await stagesOf(id);
    expect(byKind(all, "media").status).toBe("active");
    expect(stageHealth(byKind(all, "content"))).toBe("done");
  });

  it("Social can send work all the way back to Content", async () => {
    const king = await makeUser("King", ["content"]);
    const brand = await makeBrand("VR", king.id);
    const [id] = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 10 }, [{ title: "Post", type: "static" }], {
      contentReady: true,
    });
    let all = await stagesOf(id);
    const gannah = await makeUser("Gannah", ["design"]);
    await completeStage(gannah, byKind(all, "design").id, { driveUrl: "drive.google.com/abc" });
    all = await stagesOf(id);
    expect(byKind(all, "social").status).toBe("active");
    await returnToStage(king, id, "content");
    all = await stagesOf(id);
    expect(all.map((s) => s.status)).toEqual(["active", "waiting", "waiting"]);
  });
});

describe("Scenario 4 — one-off client SINAI", () => {
  it("keeps one client with many projects; deliverables finish at Delivered with no Social stage", async () => {
    const ammar = await makeUser("Ammar", ["content"]);
    const ayman = await makeUser("Ayman", ["media"]);
    const name = `SINAI ${uid()}`;
    const first = await findOrCreateClient(ammar, name);
    expect(first.created).toBe(true);
    const project = await createProject(ammar, { clientId: first.client.id, name: "Summer Campaign" });
    const ids = await createItems(
      ammar,
      { kind: "project", projectId: project.id },
      [1, 2, 3, 4, 5].map((n) => ({ title: `Reel ${n}`, type: "reel" as const })),
      { contentAssigneeId: ammar.id },
    );
    expect(ids).toHaveLength(5);
    let all = await stagesOf(ids[0]);
    expect(all.map((s) => s.kind)).toEqual(["content", "media", "delivery"]);

    await completeStage(ammar, byKind(all, "content").id);
    await completeStage(ayman, byKind(all, "media").id, { driveUrl: "https://drive.google.com/sinai-1" });
    // Client asks for a revision after seeing it.
    await returnToStage(ammar, ids[0], "media", "Client wants the logo bigger");
    all = await stagesOf(ids[0]);
    await completeStage(ayman, byKind(all, "media").id);
    all = await stagesOf(ids[0]);
    await completeStage(ammar, byKind(all, "delivery").id);
    const [it1] = await db.select().from(contentItems).where(eq(contentItems.id, ids[0]));
    expect(it1.completedAt).not.toBeNull();

    // Same client comes back months later: no duplicate.
    const again = await findOrCreateClient(ammar, name.toLowerCase());
    expect(again.created).toBe(false);
    expect(again.client.id).toBe(first.client.id);
    const p2 = await createProject(ammar, { clientId: again.client.id, name: "Winter Campaign" });
    expect(p2.clientId).toBe(first.client.id);
  });
});

describe("Editing & bulk", () => {
  it("logs field changes with old → new values and restricts type changes to the Content stage", async () => {
    const king = await makeUser("King", ["content"]);
    const brand = await makeBrand("VR", king.id);
    const [id] = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 10 }, [{ title: "Dated", type: "reel", postingDate: "2026-10-12" }]);
    await updateItem(king, id, { postingDate: "2026-10-14", type: "carousel" });
    const all = await stagesOf(id);
    expect(all.map((s) => s.kind)).toEqual(["content", "design", "social"]);
    const log = await logOf(id);
    const d = log.find((l) => l.field === "postingDate")!;
    expect([d.oldValue, d.newValue]).toEqual(["2026-10-12", "2026-10-14"]);
    expect(d.summary).toContain("12 Oct → ");

    await completeStage(king, all[0].id);
    await expect(updateItem(king, id, { type: "reel" })).rejects.toThrow(/only be changed/);
  });

  it("bulk-assigns a stage across a month", async () => {
    const king = await makeUser("King", ["content"]);
    const jana = await makeUser("Gannah", ["design"]);
    const assem = await makeUser("Assem", ["account"]);
    const brand = await makeBrand("VR", king.id);
    const ids = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 11 }, [
      { title: "A", type: "static" },
      { title: "B", type: "carousel" },
      { title: "C", type: "reel" },
    ]);
    const r = await bulkStageAction(assem, ids, "design", { type: "assign", userId: jana.id });
    expect(r.applied).toBe(2);
    expect(r.skipped).toEqual(["C"]);
  });

  it("the activity log cannot be edited or deleted", async () => {
    await expect(db.update(activityLog).set({ summary: "tampered" })).rejects.toThrow();
    await expect(db.delete(activityLog)).rejects.toThrow();
  });
});
