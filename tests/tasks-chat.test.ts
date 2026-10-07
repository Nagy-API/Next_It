import { afterAll, describe, expect, it } from "vitest";
import { and, asc, eq, isNull } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { comments, notifications, stages, tasks } from "@/db/schema";
import { createTasks, deleteTask, getTasksFor, setTaskDone, setTaskStatus } from "@/server/tasks";
import { findMentions, postChatMessage, unreadChatCount, markChatRead } from "@/server/chat";
import { addComment, createItems, deleteComment } from "@/server/items";
import { createProject, findOrCreateClient, setAvatar, setProjectDeleted } from "@/server/admin";
import { getWorkItems } from "@/server/queries";
import { makeBrand, makeManager, makeUser } from "./helpers";

afterAll(async () => {
  await closeDb();
});

const notesOf = (userId: string) => db.select().from(notifications).where(eq(notifications.userId, userId));

describe("Tasks managers give", () => {
  it("only managers give tasks; the person is notified and the next one of a repeating task appears when it's done", async () => {
    const ammar = await makeManager("Ammar", ["content"]);
    const king = await makeUser("King", ["content"]);
    const esraa = await makeUser("Esraa", ["social"]);
    await expect(createTasks(king, { title: "Nope", assigneeIds: [esraa.id] })).rejects.toThrow(/Only managers/);

    const [weekly, once] = await createTasks(ammar, { title: "Weekly report", assigneeIds: [esraa.id, king.id], dueDate: "2026-10-05", recurrence: "weekly" });
    expect(weekly).toMatchObject({ assigneeId: esraa.id, recurrence: "weekly", dueDate: "2026-10-05" });
    expect(once.assigneeId).toBe(king.id);
    expect((await notesOf(esraa.id)).some((n) => n.kind === "task" && n.href === "/my-work#tasks")).toBe(true);

    await expect(setTaskDone(king, weekly.id, true)).rejects.toThrow(/isn't yours/);
    const next = await setTaskDone(esraa, weekly.id, true);
    expect(next).toMatchObject({ dueDate: "2026-10-12", assigneeId: esraa.id, seriesId: weekly.id, doneAt: null });
    // Reopening and finishing again doesn't create a duplicate.
    await setTaskDone(esraa, weekly.id, false);
    expect(await setTaskDone(esraa, weekly.id, true)).toBeNull();
    expect((await notesOf(ammar.id)).some((n) => n.kind === "finished" && n.title.includes("Weekly report"))).toBe(true);

    const mine = await getTasksFor(esraa.id, "2026-10-06");
    expect(mine.filter((t) => !t.doneAt).map((t) => t.dueDate)).toEqual(["2026-10-12"]);

    // Stop the series.
    await deleteTask(ammar, next!.id, { series: true });
    const left = await db.select().from(tasks).where(and(eq(tasks.seriesId, weekly.id), isNull(tasks.deletedAt), isNull(tasks.doneAt)));
    expect(left).toHaveLength(0);
  });

  it("monthly tasks keep the day (clamped at the month's end)", async () => {
    const shahenda = await makeManager("Shahenda", ["leadership"]);
    const assem = await makeUser("Assem", ["account"]);
    const [t] = await createTasks(shahenda, { title: "Invoice", assigneeIds: [assem.id], dueDate: "2027-01-31", recurrence: "monthly" });
    const next = await setTaskDone(assem, t.id, true);
    expect(next?.dueDate).toBe("2027-02-28");
  });
});

describe("Task status", () => {
  it("the person says what's happening: in progress, scheduled for a day, waiting; others can't", async () => {
    const ammar = await makeManager("Ammar", ["content"]);
    const esraa = await makeUser("Esraa", ["social"]);
    const other = await makeUser("Other", ["design"]);
    const [t] = await createTasks(ammar, { title: "Client report", assigneeIds: [esraa.id] });
    expect(t.status).toBe("todo");
    await setTaskStatus(esraa, t.id, "in_progress");
    await expect(setTaskStatus(esraa, t.id, "scheduled")).rejects.toThrow(/Pick the day/);
    await setTaskStatus(esraa, t.id, "scheduled", { scheduledDate: "2026-10-12" });
    await expect(setTaskStatus(other, t.id, "waiting")).rejects.toThrow(/isn't yours/);
    const [row] = (await getTasksFor(esraa.id, "2026-10-08")).filter((x) => x.id === t.id);
    expect(row).toMatchObject({ status: "scheduled", scheduledDate: "2026-10-12" });
    await setTaskStatus(esraa, t.id, "waiting");
    const [row2] = (await getTasksFor(esraa.id, "2026-10-08")).filter((x) => x.id === t.id);
    expect(row2).toMatchObject({ status: "waiting", scheduledDate: null });
    await setTaskDone(esraa, t.id, true);
    await expect(setTaskStatus(esraa, t.id, "in_progress")).rejects.toThrow(/already done/);
  });
});

describe("Team chat & mentions", () => {
  it("finds @mentions by first or full name, and @everyone", () => {
    const people = [
      { id: "1", name: "Gannah" },
      { id: "2", name: "Jana" },
      { id: "3", name: "Ahmed Ali" },
    ];
    expect(findMentions("hey @gannah and @Ahmed Ali, check this", people).sort()).toEqual(["1", "3"]);
    expect(findMentions("@Janaa is not jana", people)).toEqual([]);
    expect(findMentions("@everyone meeting at 3", people).sort()).toEqual(["1", "2", "3"]);
  });

  it("notifies mentioned people and counts unread messages", async () => {
    const gannahName = `Gannah${Date.now()}`;
    const king = await makeUser("King", ["content"]);
    const gannah = await makeUser(gannahName, ["design"]);
    await markChatRead(gannah.id);
    await postChatMessage(king, { body: `@${gannahName} can you check the carousel?` });
    const n = (await notesOf(gannah.id)).find((x) => x.kind === "mention");
    expect(n?.href).toMatch(/^\/chat#m-/);
    expect(await unreadChatCount(gannah.id)).toBeGreaterThanOrEqual(1);
    await markChatRead(gannah.id);
    expect(await unreadChatCount(gannah.id)).toBe(0);
    await expect(postChatMessage(king, { body: "   " })).rejects.toThrow(/Write a message/);
  });

  it("@Name in a comment notifies that person; people delete their own comments", async () => {
    const tag = `Jana${Date.now()}`;
    const king = await makeUser("King", ["content"]);
    const jana = await makeUser(tag, ["media"]);
    const other = await makeUser("Other", ["social"]);
    const brand = await makeBrand("VR", king.id);
    const [id] = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 11 }, [{ title: "Hook", type: "reel" }]);
    await addComment(king, id, `@${tag} please make it shorter`);
    expect((await notesOf(jana.id)).some((x) => x.kind === "mention" && x.itemId === id)).toBe(true);
    const [c] = await db.select().from(comments).where(eq(comments.itemId, id));
    await expect(deleteComment(other, c.id)).rejects.toThrow(/your own/);
    await deleteComment(king, c.id);
    const [after] = await db.select().from(comments).where(eq(comments.id, c.id));
    expect(after.deletedAt).not.toBeNull();
  });
});

describe("One-off projects: owner and delete", () => {
  it("the assigned content person gets every deliverable's content step; deleting hides the items", async () => {
    const ammar = await makeManager("Ammar", ["content"]);
    const king = await makeUser("King", ["content"]);
    const { client } = await findOrCreateClient(ammar, `Client ${Date.now()}`);
    const p = await createProject(ammar, { clientId: client.id, name: "Launch", ownerId: king.id });
    const [id] = await createItems(ammar, { kind: "project", projectId: p.id }, [{ title: "Teaser", type: "reel" }]);
    const [content] = await db.select().from(stages).where(eq(stages.itemId, id)).orderBy(asc(stages.position));
    expect(content.assigneeId).toBe(king.id);

    await expect(setProjectDeleted(king, p.id, true)).rejects.toThrow(/Only managers/);
    await setProjectDeleted(ammar, p.id, true);
    expect(await getWorkItems({ ids: [id] })).toHaveLength(0);
    await setProjectDeleted(ammar, p.id, false);
    expect(await getWorkItems({ ids: [id] })).toHaveLength(1);
  });
});

describe("Profile photos", () => {
  it("accepts small images for yourself only", async () => {
    const a = await makeUser("A", []);
    const b = await makeUser("B", []);
    const png = "data:image/png;base64,iVBORw0KGgo=";
    await setAvatar(a, a.id, png);
    await expect(setAvatar(a, b.id, png)).rejects.toThrow(/your own/);
    await expect(setAvatar(a, a.id, "data:text/html;base64,PGgxPg==")).rejects.toThrow(/photo/);
    await setAvatar(a, a.id, null);
  });
});
