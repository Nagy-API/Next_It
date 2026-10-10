import { afterAll, describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { activityLog, contentItems, stages, workSessions } from "@/db/schema";
import { allowed, can } from "@/domain/permissions";
import { setPermission, resetAccess } from "@/server/access";
import { autoPauseClocks, pauseInstant } from "@/server/auto-pause";
import { createItems } from "@/server/items";
import { forgetWorkspaceCache, getWorkspace, setWorkspaceImage, updateWorkspace } from "@/server/settings";
import { permsOf } from "@/server/sessions";
import { addWorkSession, deleteWorkSession, editWorkSession } from "@/server/time";
import { setShootDetails, setStageProgress } from "@/server/workflow";
import { makeBrand, makeManager, makeUser } from "./helpers";

afterAll(async () => {
  await closeDb();
});

const stagesOf = (itemId: string) => db.select().from(stages).where(eq(stages.itemId, itemId)).orderBy(asc(stages.position));
const sessionsOf = (itemId: string) => db.select().from(workSessions).where(eq(workSessions.itemId, itemId)).orderBy(asc(workSessions.startedAt));
const withPerms = async <T extends { id: string }>(u: T) => ({ ...u, perms: await permsOf(u.id) });

describe("Access: per-person permissions on top of the defaults", () => {
  it("an admin turns a permission on for one person and off for another; the server follows it", async () => {
    const owner = await makeUser("Owner", ["leadership"], true, true);
    const assem = await makeManager("Assem", ["account"]);
    const esraa = await makeUser("Esraa", ["social"]);
    expect(can.editTime(assem)).toBe(false);
    expect(can.seeDashboard(esraa)).toBe(false);

    await setPermission(owner, assem.id, "time.edit", "allow");
    await setPermission(owner, esraa.id, "dashboard.see", "allow");
    await setPermission(owner, assem.id, "reports.see", "deny");
    const a = await withPerms(assem);
    const e = await withPerms(esraa);
    expect(can.editTime(a)).toBe(true);
    expect(can.seeReports(a)).toBe(false);
    expect(can.seeDashboard(e)).toBe(true);

    // Back to the defaults.
    await setPermission(owner, assem.id, "reports.see", "default");
    expect(allowed(await withPerms(assem), "reports.see")).toBe(true);
    await resetAccess(owner, esraa.id);
    expect(can.seeDashboard(await withPerms(esraa))).toBe(false);

    // Logged.
    const log = await db.select().from(activityLog).where(and(eq(activityLog.action, "access_changed"), eq(activityLog.subjectUserId, assem.id)));
    expect(log.some((l) => l.summary.includes("Edit worked time"))).toBe(true);
  });

  it("only people who manage access can change it, and someone always keeps it", async () => {
    const owner = await makeUser("Owner", ["leadership"], true, true);
    const ammar = await makeManager("Ammar", ["content"]);
    await expect(setPermission(ammar, owner.id, "people.manage", "deny")).rejects.toThrow(/manage access/);
    // A manager given "Manage access" can manage it…
    await setPermission(owner, ammar.id, "access.manage", "allow");
    await setPermission(await withPerms(ammar), owner.id, "reports.see", "deny");
    expect(can.seeReports(await withPerms(owner))).toBe(false);
    // …and the workspace refuses to leave nobody with it (other admins exist in the test database, so this passes).
    await setPermission(owner, ammar.id, "access.manage", "default");
    expect(can.manageAccess(await withPerms(ammar))).toBe(false);
  });
});

describe("Workspace settings (white label, modules, auto pause)", () => {
  it("only allowed people change them; values are validated; unchanged ones keep the built-in brand", async () => {
    const owner = await makeUser("Owner", ["leadership"], true, true);
    const member = await makeUser("Member", ["content"]);
    await expect(updateWorkspace(member, { name: "X" })).rejects.toThrow(/customize/);
    await expect(updateWorkspace(owner, { primary: "red" })).rejects.toThrow(/hex/);
    await expect(updateWorkspace(owner, { autoPauseAt: "25:00" })).rejects.toThrow(/21:00/);
    await expect(setWorkspaceImage(owner, "mark", "data:image/svg+xml;base64,AAAA")).rejects.toThrow(/PNG/);
    const before = await getWorkspace();
    await updateWorkspace(owner, { tagline: "Ops for everyone", modules: { ...before.modules, chat: false } });
    forgetWorkspaceCache();
    const ws = await getWorkspace();
    expect(ws.tagline).toBe("Ops for everyone");
    expect(ws.modules.chat).toBe(false);
    expect(ws.name).toBe(before.name);
    await setWorkspaceImage(owner, "mark", "data:image/png;base64,iVBORw0KGgo=");
    forgetWorkspaceCache();
    expect((await getWorkspace()).logos.mark).toMatch(/^\/api\/workspace-asset\/mark\?v=/);
    // Put things back for the other tests.
    await setWorkspaceImage(owner, "mark", null);
    await updateWorkspace(owner, { tagline: before.tagline, modules: before.modules, autoPauseAt: "21:00" });
    forgetWorkspaceCache();
  });
});

describe("Pause and automatic pause", () => {
  it("Paused stops the clock; In progress starts it again", async () => {
    const king = await makeUser("King", ["content"]);
    const jana = await makeUser("Jana", ["design"]);
    const brand = await makeBrand("VR", king.id);
    const [id] = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 10 }, [{ title: "Post", type: "static" }], { contentReady: true });
    const design = (await stagesOf(id))[1];
    await setStageProgress(jana, design.id, "processing", { now: new Date("2026-10-05T08:00:00Z") });
    await setStageProgress(jana, design.id, "paused", { now: new Date("2026-10-05T09:00:00Z") });
    let s = await sessionsOf(id);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ endReason: "paused" });
    await setStageProgress(jana, design.id, "processing", { now: new Date("2026-10-05T10:00:00Z") });
    s = await sessionsOf(id);
    expect(s).toHaveLength(2);
    expect(s[1].endedAt).toBeNull();
  });

  it("a clock still running at the pause time stops there and the step reads Paused", async () => {
    const king = await makeUser("King", ["content"]);
    const gannah = await makeUser("Gannah", ["design"]);
    const brand = await makeBrand("VR", king.id);
    const [id] = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 10 }, [{ title: "Late night", type: "static" }], { contentReady: true });
    const design = (await stagesOf(id))[1];
    // 15:00 Cairo (UTC+3) on 2026-10-06; the pause is 21:00 Cairo = 18:00 UTC.
    await setStageProgress(gannah, design.id, "processing", { now: new Date("2026-10-06T12:00:00Z") });
    expect(pauseInstant(new Date("2026-10-06T12:00:00Z"), "21:00").toISOString()).toBe("2026-10-06T18:00:00.000Z");
    // A clock started after 21:00 pauses at midnight.
    expect(pauseInstant(new Date("2026-10-06T19:00:00Z"), "21:00").toISOString()).toBe("2026-10-06T21:00:00.000Z");
    forgetWorkspaceCache();
    await autoPauseClocks(new Date("2026-10-06T17:59:00Z"));
    expect((await sessionsOf(id))[0].endedAt).toBeNull();
    await autoPauseClocks(new Date("2026-10-07T05:00:00Z"));
    const [w] = await sessionsOf(id);
    expect(w).toMatchObject({ endReason: "auto_paused" });
    expect(w.endedAt!.toISOString()).toBe("2026-10-06T18:00:00.000Z");
    expect((await stagesOf(id))[1]).toMatchObject({ progress: "paused" });
  });
});

describe("Correcting worked time", () => {
  it("allowed people edit, add and remove time; others can't; every change is logged", async () => {
    const king = await makeUser("King", ["content"]);
    const jana = await makeUser("Jana", ["media"]);
    const esraa = await makeUser("Esraa", ["social"]);
    const owner = await makeUser("Owner", ["leadership"], true, true);
    const brand = await makeBrand("VR", king.id);
    const [id] = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 10 }, [{ title: "Story", type: "story" }], { contentReady: true });
    const social = (await stagesOf(id))[1];
    await setStageProgress(esraa, social.id, "processing", { now: new Date("2026-10-05T08:00:00Z") });
    await setStageProgress(esraa, social.id, "scheduled", { scheduledFor: "2026-10-06", now: new Date("2026-10-05T09:00:00Z") });
    const [w] = await sessionsOf(id);

    await expect(editWorkSession(jana, w.id, { startedAt: new Date("2026-10-05T07:00:00Z"), endedAt: w.endedAt })).rejects.toThrow(/edit worked time/);
    await expect(editWorkSession(owner, w.id, { startedAt: new Date("2026-10-05T10:00:00Z"), endedAt: w.endedAt })).rejects.toThrow(/after the start/);
    await editWorkSession(owner, w.id, { startedAt: new Date("2026-10-05T07:30:00Z"), endedAt: w.endedAt });
    const [edited] = await sessionsOf(id);
    expect(edited.startedAt.toISOString()).toBe("2026-10-05T07:30:00.000Z");
    expect(edited.editedById).toBe(owner.id);

    await addWorkSession(owner, social.id, { userId: esraa.id, startedAt: new Date("2026-10-04T10:00:00Z"), endedAt: new Date("2026-10-04T11:15:00Z") });
    expect(await sessionsOf(id)).toHaveLength(2);
    const added = (await sessionsOf(id))[0];
    await deleteWorkSession(owner, added.id);
    expect(await sessionsOf(id)).toHaveLength(1);
    const log = await db.select().from(activityLog).where(eq(activityLog.itemId, id));
    expect(log.map((l) => l.action)).toEqual(expect.arrayContaining(["time_edited", "time_added", "time_removed"]));
  });
});

describe("Shoot extras", () => {
  it("people, rentals and purchases are optional; ready only when there is something; logged", async () => {
    const king = await makeUser("King", ["content"]);
    const ayman = await makeManager("Ayman", ["media"]);
    const brand = await makeBrand("VR", king.id);
    const [id] = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 10 }, [{ title: "Reel", type: "reel" }], { contentReady: true });
    await setShootDetails(ayman, id, { shootPeople: 3, shootRentals: "2 lights", shootPurchases: "Flowers", shootPurchasesReady: true });
    let [i] = await db.select().from(contentItems).where(eq(contentItems.id, id));
    expect(i).toMatchObject({ shootPeople: 3, shootRentals: "2 lights", shootRentalsReady: false, shootPurchases: "Flowers", shootPurchasesReady: true });
    await setShootDetails(ayman, id, { shootRentalsReady: true, shootPurchases: null });
    [i] = await db.select().from(contentItems).where(eq(contentItems.id, id));
    expect(i).toMatchObject({ shootRentalsReady: true, shootPurchases: null, shootPurchasesReady: false });
    await expect(setShootDetails(ayman, id, { shootPeople: -1 })).rejects.toThrow(/whole number/);
    const log = await db.select().from(activityLog).where(and(eq(activityLog.itemId, id), eq(activityLog.action, "shoot_needs")));
    expect(log.length).toBe(2);
  });
});
