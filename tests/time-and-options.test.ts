import { afterAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { contentItems, contentPlans, stages, workSessions } from "@/db/schema";
import { createItems, setItemExtra, updateItem } from "@/server/items";
import { getWorkItems } from "@/server/queries";
import { returnToStage, reviewVersion, setStageProgress, submitVersion } from "@/server/workflow";
import { makeBrand, makeManager, makeUser } from "./helpers";

afterAll(async () => {
  await closeDb();
});

const stagesOf = (itemId: string) => db.select().from(stages).where(eq(stages.itemId, itemId)).orderBy(asc(stages.position));
const sessionsOf = (itemId: string) => db.select().from(workSessions).where(eq(workSessions.itemId, itemId)).orderBy(asc(workSessions.startedAt));
const at = (iso: string) => new Date(iso);

describe("Time on a step follows the status", () => {
  it("runs from In progress until the version is sent; changes requested → On it (Adjusting) runs again; Scheduled stops it", async () => {
    const king = await makeUser("King", ["content"]);
    const gannah = await makeUser("Gannah", ["design"]);
    const brand = await makeBrand("VR", king.id);
    const [id] = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 10 }, [{ title: "Post", type: "static" }], { contentReady: true });
    const design = (await stagesOf(id))[1];

    await setStageProgress(gannah, design.id, "processing", { now: at("2026-10-05T08:00:00Z") });
    let s = await sessionsOf(id);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ userId: gannah.id, kind: "processing", endedAt: null });

    // Two options for the same post, with a note; sending stops the clock.
    const v1 = await submitVersion(gannah, design.id, {
      url: "https://drive.google.com/a",
      altUrls: ["https://drive.google.com/b", "", "https://drive.google.com/a"],
      note: "Two colour options",
      now: at("2026-10-05T10:30:00Z"),
    });
    expect(v1.altUrls).toEqual(["https://drive.google.com/b"]);
    s = await sessionsOf(id);
    expect(s[0]).toMatchObject({ endReason: "sent" });
    expect(s[0].endedAt!.getTime() - s[0].startedAt.getTime()).toBe(150 * 60_000);

    // The reviewer must pick one of the options to approve…
    await expect(reviewVersion(king, v1.id, { approve: true })).rejects.toThrow(/Pick the option/);
    // …or asks for changes: the step waits for the designer to read it.
    await reviewVersion(king, v1.id, { approve: false, note: "Bigger logo" });
    expect((await stagesOf(id))[1]).toMatchObject({ progress: "changes_requested" });
    expect(await sessionsOf(id)).toHaveLength(1);

    // "On it" → Adjusting, the clock runs again; then they schedule it for tomorrow → it stops.
    await setStageProgress(gannah, design.id, "adjusting", { now: at("2026-10-05T12:00:00Z") });
    expect((await sessionsOf(id)).at(-1)).toMatchObject({ kind: "adjusting", endedAt: null });
    await expect(setStageProgress(gannah, design.id, "scheduled")).rejects.toThrow(/Pick the day/);
    await setStageProgress(gannah, design.id, "scheduled", { scheduledFor: "2026-10-06", now: at("2026-10-05T12:20:00Z") });
    expect((await stagesOf(id))[1]).toMatchObject({ progress: "scheduled", scheduledFor: "2026-10-06" });
    expect((await sessionsOf(id)).at(-1)).toMatchObject({ endReason: "status" });

    const v2 = await submitVersion(gannah, design.id, { url: "https://drive.google.com/c", altUrls: ["https://drive.google.com/d"], now: at("2026-10-06T09:00:00Z") });
    await reviewVersion(king, v2.id, { approve: true, chosenUrl: "https://drive.google.com/d" });
    const [item] = await db.select().from(contentItems).where(eq(contentItems.id, id));
    expect(item.driveUrl).toBe("https://drive.google.com/d");

    // The screens get the total: 2h30 + 20 min.
    const [w] = await getWorkItems({ ids: [id], includeDone: true });
    const t = w.stages.find((x) => x.kind === "design")!.time;
    expect(t.ms).toBe(170 * 60_000);
    expect(t.running).toBe(false);
  });

  it("sent back to someone chosen (or yourself) — and they see Changes requested", async () => {
    const king = await makeUser("King", ["content"]);
    const kemo = await makeUser("Kemo", ["content"]);
    const ayman = await makeUser("Ayman", ["media"]);
    const brand = await makeBrand("VR", king.id);
    const [id] = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 10 }, [{ title: "Reel", type: "reel" }], { contentReady: true });
    await expect(returnToStage(ayman, id, "content", "Rewrite", { assigneeId: ayman.id === kemo.id ? "" : (await makeUser("Esraa", ["social"])).id })).rejects.toThrow(/Content team, or yourself/);
    await returnToStage(ayman, id, "content", "Rewrite the hook", { assigneeId: kemo.id });
    expect((await stagesOf(id))[0]).toMatchObject({ status: "active", progress: "changes_requested", assigneeId: kemo.id, returnNote: "Rewrite the hook" });
  });
});

describe("The month follows the posting date", () => {
  it("re-dating an item to November moves it to the November plan (keeping its slide link); adding a November date to October goes to November", async () => {
    const king = await makeUser("King", ["content"]);
    const brand = await makeBrand("VR", king.id);
    const [a, b] = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 10 }, [
      { title: "Oct", type: "reel", postingDate: "2026-10-20" },
      { title: "Nov", type: "reel", postingDate: "2026-11-02" },
    ]);
    const planOf = async (id: string) => {
      const [r] = await db.select({ year: contentPlans.year, month: contentPlans.month, canva: contentItems.canvaUrl, slide: contentItems.slideNumber }).from(contentItems).innerJoin(contentPlans, eq(contentPlans.id, contentItems.planId)).where(eq(contentItems.id, id));
      return r;
    };
    expect(await planOf(a)).toMatchObject({ year: 2026, month: 10 });
    expect(await planOf(b)).toMatchObject({ year: 2026, month: 11, slide: 1 });

    const oct = (await db.select().from(contentPlans).where(eq(contentPlans.brandId, brand.id))).find((p) => p.month === 10)!;
    await db.update(contentPlans).set({ canvaUrl: "https://canva.link/october" }).where(eq(contentPlans.id, oct.id));
    await updateItem(king, a, { postingDate: "2026-11-03" });
    const moved = await planOf(a);
    expect(moved).toMatchObject({ year: 2026, month: 11 });
    expect(moved.canva).toBe("https://canva.link/october#1");
  });
});

describe("Managers decide what counts as extra", () => {
  it("toggles extra on and off; others can't", async () => {
    const king = await makeUser("King", ["content"]);
    const ammar = await makeManager("Ammar", ["content"]);
    const brand = await makeBrand("VR", king.id);
    const [id] = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 10 }, [{ title: "Replacement", type: "static" }]);
    await expect(setItemExtra(king, id, true)).rejects.toThrow(/Only managers/);
    await setItemExtra(ammar, id, true);
    expect((await db.select().from(contentItems).where(eq(contentItems.id, id)))[0].extraRequestedById).toBe(ammar.id);
    await setItemExtra(ammar, id, false);
    expect((await db.select().from(contentItems).where(eq(contentItems.id, id)))[0].extraRequestedById).toBeNull();
  });
});

describe("Worked time in reports", () => {
  it("two items in progress at the same time count once", async () => {
    const { coveredMs } = await import("@/server/reports");
    const t = (h: number) => new Date(Date.UTC(2026, 9, 5, h));
    expect(coveredMs([{ s: t(8), e: t(12) }, { s: t(10), e: t(14) }, { s: t(16), e: t(17) }])).toBe(7 * 3_600_000);
    expect(coveredMs([])).toBe(0);
  });
});

describe("Clocks for work that was already in progress", () => {
  it("pressing In progress again starts a missing clock (and never a second one)", async () => {
    const king = await makeUser("King", ["content"]);
    const jana = await makeUser("Jana", ["media"]);
    const brand = await makeBrand("VR", king.id);
    const [id] = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 10 }, [{ title: "Old", type: "story" }]);
    const content = (await stagesOf(id))[0];
    // As before clocks existed: In progress with no running session.
    await db.update(stages).set({ progress: "processing", assigneeId: king.id }).where(eq(stages.id, content.id));
    expect(await sessionsOf(id)).toHaveLength(0);
    await setStageProgress(king, content.id, "processing");
    await setStageProgress(king, content.id, "processing");
    const s = await sessionsOf(id);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ userId: king.id, kind: "processing", endedAt: null });
    void jana;
  });
});
