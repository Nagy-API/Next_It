import { afterAll, describe, expect, it } from "vitest";
import { and, asc, eq, isNull } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { notifications, spaceStatuses, workTaskComments, workTaskSessions, workTasks } from "@/db/schema";
import { dashboardData } from "@/server/dashboards";
import {
  createSpace,
  createWorkTask,
  fireDueAutomations,
  getSpacePage,
  mySpaceTasks,
  saveAutomation,
  saveField,
  saveStatus,
  setFieldValue,
  setSpaceMember,
  toggleTaskClock,
  updateWorkTask,
  visibleSpaces,
} from "@/server/spaces";
import { makeManager, makeUser } from "./helpers";

afterAll(async () => {
  await closeDb();
});

const statusOf = async (spaceId: string, name: string) => (await db.select().from(spaceStatuses).where(and(eq(spaceStatuses.spaceId, spaceId), eq(spaceStatuses.name, name))))[0];
const taskRow = async (id: string) => (await db.select().from(workTasks).where(eq(workTasks.id, id)))[0];

describe("Spaces: build a workflow without code", () => {
  it("creates a space from a template with its statuses, columns, lists and automations", async () => {
    const boss = await makeManager("Shahenda", ["leadership"]);
    const s = await createSpace(boss, { name: "Hiring", template: "hiring" });
    const page = await getSpacePage(boss, s.id);
    expect(page.statuses.map((x) => x.name)).toEqual(["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"]);
    expect(page.fields.map((f) => f.name)).toContain("Phone");
    expect(page.lists.map((l) => l.name)).toEqual(["Candidates"]);
    expect(page.automations.length).toBe(2);
    expect(page.members).toEqual([expect.objectContaining({ userId: boss.id, role: "admin" })]);
  });

  it("private spaces are only for members; viewers can't change; regular people can't create spaces", async () => {
    const boss = await makeManager("Boss", ["leadership"]);
    const member = await makeUser("Member", ["content"]);
    const viewer = await makeUser("Viewer", ["content"]);
    const outsider = await makeUser("Outsider", ["social"]);
    await expect(createSpace(member, { name: "Mine" })).rejects.toThrow(/create spaces/);
    const s = await createSpace(boss, { name: "Secret", isPrivate: true, memberIds: [member.id] });
    await setSpaceMember(boss, s.id, viewer.id, "viewer");
    expect((await visibleSpaces(outsider)).some((x) => x.id === s.id)).toBe(false);
    expect((await visibleSpaces(member)).some((x) => x.id === s.id)).toBe(true);
    await expect(getSpacePage(outsider, s.id)).rejects.toThrow(/can't see it/);
    const list = (await getSpacePage(boss, s.id)).lists[0];
    await expect(createWorkTask(viewer, { listId: list.id, title: "No" })).rejects.toThrow(/viewer/);
    const t = await createWorkTask(member, { listId: list.id, title: "Yes" });
    expect(t.title).toBe("Yes");
    // Assigning someone outside a private space adds them as a member.
    await updateWorkTask(boss, t.id, { assigneeIds: [outsider.id] });
    expect((await visibleSpaces(outsider)).some((x) => x.id === s.id)).toBe(true);
  });

  it("statuses drive done time and the clock; subtasks finishing fire the parent's automation", async () => {
    const boss = await makeManager("Boss", ["leadership"]);
    const worker = await makeUser("Worker", ["design"]);
    const s = await createSpace(boss, { name: "Board", template: "blank", memberIds: [worker.id] });
    const page = await getSpacePage(boss, s.id);
    const list = page.lists[0];
    const inProgress = await statusOf(s.id, "In progress");
    const review = await statusOf(s.id, "Review");
    const done = await statusOf(s.id, "Done");

    const parent = await createWorkTask(boss, { listId: list.id, title: "Launch", assigneeIds: [worker.id] });
    expect((await db.select().from(notifications).where(and(eq(notifications.userId, worker.id), eq(notifications.kind, "task")))).length).toBeGreaterThan(0);
    const a = await createWorkTask(worker, { listId: list.id, title: "A", parentId: parent.id });
    const b = await createWorkTask(worker, { listId: list.id, title: "B", parentId: parent.id });

    // In progress → the clock runs for the person; Done → stops and records completion.
    await updateWorkTask(worker, a.id, { statusId: inProgress.id }, new Date("2026-10-05T08:00:00Z"));
    let sess = await db.select().from(workTaskSessions).where(eq(workTaskSessions.taskId, a.id));
    expect(sess).toEqual([expect.objectContaining({ userId: worker.id, endedAt: null })]);
    await updateWorkTask(worker, a.id, { statusId: done.id }, new Date("2026-10-05T09:30:00Z"));
    sess = await db.select().from(workTaskSessions).where(eq(workTaskSessions.taskId, a.id));
    expect(sess[0].endReason).toBe("done");
    expect((await taskRow(a.id)).completedAt).not.toBeNull();

    // The blank template's automation: all subtasks done → parent goes to Review.
    await updateWorkTask(worker, b.id, { statusId: done.id });
    expect((await taskRow(parent.id)).statusId).toBe(review.id);
    const notes = await db.select().from(workTaskComments).where(eq(workTaskComments.taskId, parent.id)).orderBy(asc(workTaskComments.createdAt));
    expect(notes.some((n) => n.body.startsWith("Automation “"))).toBe(true);
  });

  it("automations: on a status, add a checklist, set the due date and notify; time-based ones run once", async () => {
    const boss = await makeManager("Boss", ["leadership"]);
    const hr = await makeUser("HR", ["account"]);
    const s = await createSpace(boss, { name: "Pipeline", template: "blank" });
    const page = await getSpacePage(boss, s.id);
    const review = await statusOf(s.id, "Review");
    const done = await statusOf(s.id, "Done");
    await saveAutomation(boss, s.id, {
      name: "Review checklist",
      trigger: { type: "status_changed", statusId: review.id },
      actions: [
        { type: "add_subtasks", titles: ["Check spelling", "Check links"] },
        { type: "set_due_in_days", days: 2 },
        { type: "notify", to: "people", userIds: [hr.id], message: "Please check" },
      ],
    });
    await saveAutomation(boss, s.id, { name: "Overdue goes urgent", trigger: { type: "due_date_passed" }, actions: [{ type: "set_priority", priority: "urgent" }] });
    await expect(saveAutomation(boss, s.id, { name: "Bad", trigger: { type: "status_changed" }, actions: [{ type: "unassign_all" }] })).rejects.toThrow(/status it waits for/);

    const t = await createWorkTask(boss, { listId: page.lists[0].id, title: "Article" });
    await updateWorkTask(boss, t.id, { statusId: review.id });
    const subs = await db.select().from(workTasks).where(and(eq(workTasks.parentId, t.id), isNull(workTasks.archivedAt)));
    expect(subs.map((x) => x.title).sort()).toEqual(["Check links", "Check spelling"]);
    expect((await taskRow(t.id)).dueDate).not.toBeNull();
    expect((await db.select().from(notifications).where(and(eq(notifications.userId, hr.id), eq(notifications.title, "Please check: Article")))).length).toBe(1);
    // Moving back and forth doesn't duplicate the checklist.
    await updateWorkTask(boss, t.id, { statusId: done.id });
    await updateWorkTask(boss, t.id, { statusId: review.id });
    expect((await db.select().from(workTasks).where(and(eq(workTasks.parentId, t.id), isNull(workTasks.archivedAt)))).length).toBe(2);

    const late = await createWorkTask(boss, { listId: page.lists[0].id, title: "Old", dueDate: "2026-10-01" });
    await fireDueAutomations(new Date("2026-10-03T10:00:00Z"));
    expect((await taskRow(late.id)).priority).toBe("urgent");
    await updateWorkTask(boss, late.id, { priority: "low" });
    await fireDueAutomations(new Date("2026-10-04T10:00:00Z"));
    expect((await taskRow(late.id)).priority).toBe("low");
  });

  it("custom columns are validated; statuses can be added; My tasks and dashboards count the work", async () => {
    const boss = await makeManager("Boss", ["leadership"]);
    const worker = await makeUser("Worker", ["content"]);
    const s = await createSpace(boss, { name: "Sales", template: "sales", memberIds: [worker.id] });
    await saveField(boss, s.id, { name: "Stage size", type: "dropdown", options: ["S", "M", "L"] });
    await saveStatus(boss, s.id, { name: "On hold", color: "#94a3b8", kind: "open" });
    const page = await getSpacePage(boss, s.id);
    expect(page.statuses.some((x) => x.name === "On hold")).toBe(true);
    const value = page.fields.find((f) => f.name === "Deal value")!;
    const email = page.fields.find((f) => f.name === "Contact email")!;
    const size = page.fields.find((f) => f.name === "Stage size")!;
    const t = await createWorkTask(boss, { listId: page.lists[0].id, title: "Acme", assigneeIds: [worker.id], dueDate: "2026-10-02" });
    await setFieldValue(worker, t.id, value.id, "12,500");
    await expect(setFieldValue(worker, t.id, email.id, "not-an-email")).rejects.toThrow(/email/);
    await expect(setFieldValue(worker, t.id, size.id, "XL")).rejects.toThrow(/options/);
    const opt = (size.options as { id: string }[])[1];
    await setFieldValue(worker, t.id, size.id, opt.id);
    const fresh = (await getSpacePage(boss, s.id)).tasks.find((x) => x.id === t.id)!;
    expect(fresh.values[value.id]).toBe(12500);
    expect(fresh.values[size.id]).toBe(opt.id);

    const mine = await mySpaceTasks(worker);
    expect(mine.some((x) => x.id === t.id)).toBe(true);
    const data = await dashboardData(boss, { spaceId: s.id }, new Date("2026-10-05T10:00:00Z"));
    expect(data!.summary).toMatchObject({ total: 1, open: 1, overdue: 1 });
    expect(data!.byPerson[0]).toMatchObject({ id: worker.id, open: 1, overdue: 1 });
  });

  it("the clock button starts and pauses my own clock", async () => {
    const boss = await makeManager("Boss", ["leadership"]);
    const s = await createSpace(boss, { name: "Clock", template: "blank" });
    const page = await getSpacePage(boss, s.id);
    const t = await createWorkTask(boss, { listId: page.lists[0].id, title: "Timed" });
    expect(await toggleTaskClock(boss, t.id, new Date("2026-10-05T08:00:00Z"))).toBe(true);
    expect((await taskRow(t.id)).statusId).toBe((await statusOf(s.id, "In progress")).id);
    expect(await toggleTaskClock(boss, t.id, new Date("2026-10-05T08:45:00Z"))).toBe(false);
    const view = (await getSpacePage(boss, s.id)).tasks.find((x) => x.id === t.id)!;
    expect(view.time).toEqual({ ms: 45 * 60_000, running: false });
  });
});
