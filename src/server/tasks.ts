/**
 * Tasks managers give to anyone — one-off or repeating (daily / weekly / monthly).
 * Finishing a repeating task creates the next one automatically.
 */
import { and, asc, desc, eq, gte, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { brands, RECURRENCES, TASK_STATUSES, tasks, users, type Recurrence, type TaskStatus } from "@/db/schema";
import { can, isManager } from "@/domain/permissions";
import { addDays, addMonthsISO, formatDay, isValidISODate, isValidTime, todayISO } from "@/lib/dates";
import { logActivity, type Actor } from "./activity";
import { assert } from "./errors";
import { notify } from "./notify";
import { TASK_PRIORITIES, cleanPriority } from "@/domain/priority";

export const RECURRENCE_LABEL: Record<Recurrence, string> = { none: "Once", daily: "Every day", weekly: "Every week", monthly: "Every month" };
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { todo: "Not started", in_progress: "In progress", scheduled: "Scheduled", waiting: "Waiting" };

export type TaskInput = {
  title: string;
  notes?: string | null;
  assigneeIds: string[];
  brandId?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  recurrence?: Recurrence;
  priority?: string | null;
};

function nextDue(due: string, r: Recurrence) {
  return r === "daily" ? addDays(due, 1) : r === "weekly" ? addDays(due, 7) : addMonthsISO(due, 1);
}

export async function createTasks(actor: Actor, input: TaskInput, opts: { now?: Date } = {}) {
  assert(can.giveTasks(actor), "Only managers can give tasks.");
  const title = input.title.trim();
  assert(title, "Write what needs to be done.");
  const ids = [...new Set(input.assigneeIds.filter(Boolean))];
  assert(ids.length, "Choose who it's for.");
  const recurrence: Recurrence = input.recurrence && RECURRENCES.includes(input.recurrence) ? input.recurrence : "none";
  const dueDate = input.dueDate || (recurrence !== "none" ? todayISO() : null);
  if (dueDate) assert(isValidISODate(dueDate), "Invalid date.");
  if (input.dueTime) assert(isValidTime(input.dueTime), "Time must look like 14:30.");
  const now = opts.now ?? new Date();
  const priority = cleanPriority(input.priority);
  return db.transaction(async (tx) => {
    const people = await tx.select({ id: users.id, name: users.name, isActive: users.isActive }).from(users);
    const created = [];
    for (const assigneeId of ids) {
      const p = people.find((x) => x.id === assigneeId);
      assert(p?.isActive, "That person is not an active team member.");
      const [t] = await tx
        .insert(tasks)
        .values({
          title,
          notes: input.notes?.trim() || null,
          assigneeId,
          createdById: actor.id,
          brandId: input.brandId || null,
          dueDate,
          dueTime: input.dueTime || null,
          recurrence,
          priority,
          createdAt: now,
        })
        .returning();
      await tx.update(tasks).set({ seriesId: t.id }).where(eq(tasks.id, t.id));
      await notify(tx, actor, [assigneeId], {
        kind: "task",
        title: `${priority ? `${TASK_PRIORITIES[priority].emoji} ${TASK_PRIORITIES[priority].label}: ` : ""}New task from ${actor.name}: ${title}`,
        body: [dueDate ? `Due ${formatDay(dueDate)}${input.dueTime ? ` ${input.dueTime}` : ""}` : null, recurrence !== "none" ? RECURRENCE_LABEL[recurrence] : null]
          .filter(Boolean)
          .join(" · ") || null,
        href: "/my-work#tasks",
        at: now,
      });
      await logActivity(tx, actor, {
        action: "task_created",
        subjectUserId: assigneeId,
        brandId: input.brandId || null,
        summary: `${actor.name} gave ${p!.name} a task: “${title}”${dueDate ? ` due ${formatDay(dueDate)}` : ""}${recurrence !== "none" ? ` (${RECURRENCE_LABEL[recurrence].toLowerCase()})` : ""}.`,
        at: now,
      });
      created.push(t);
    }
    return created;
  });
}

export async function setTaskDone(actor: Actor, taskId: string, done: boolean, opts: { now?: Date } = {}) {
  const now = opts.now ?? new Date();
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).for("update");
    assert(t && !t.deletedAt, "Task not found.");
    assert(t.assigneeId === actor.id || t.createdById === actor.id || isManager(actor), "This task isn't yours.");
    if (!!t.doneAt === done) return null;
    await tx.update(tasks).set(done ? { doneAt: now, doneById: actor.id } : { doneAt: null, doneById: null }).where(eq(tasks.id, t.id));
    let next: typeof tasks.$inferSelect | null = null;
    if (done && t.recurrence !== "none") {
      // The next occurrence, unless it already exists (task was reopened and finished again).
      const due = nextDue(t.dueDate ?? todayISO(now), t.recurrence as Recurrence);
      const [exists] = await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.seriesId, t.seriesId ?? t.id), eq(tasks.dueDate, due), isNull(tasks.deletedAt)));
      if (!exists) {
        [next] = await tx
          .insert(tasks)
          .values({
            title: t.title,
            notes: t.notes,
            assigneeId: t.assigneeId,
            createdById: t.createdById,
            brandId: t.brandId,
            dueDate: due,
            dueTime: t.dueTime,
            recurrence: t.recurrence,
            priority: t.priority,
            seriesId: t.seriesId ?? t.id,
            createdAt: now,
          })
          .returning();
      }
    }
    if (done && t.createdById !== actor.id) {
      await notify(tx, actor, [t.createdById], { kind: "finished", title: `${actor.name} finished: ${t.title}`, body: null, href: "/my-work#given", at: now });
    }
    await logActivity(tx, actor, {
      action: done ? "task_done" : "task_reopened",
      subjectUserId: t.assigneeId,
      brandId: t.brandId,
      summary: `${actor.name} ${done ? "finished" : "reopened"} the task “${t.title}”.${next ? ` Next one: ${formatDay(next.dueDate)}.` : ""}`,
      at: now,
    });
    return next;
  });
}

/**
 * The person (or whoever gave it / a manager) says what's happening with a task: not started, in progress,
 * scheduled for a day, or waiting on someone. Finishing it is setTaskDone.
 */
export async function setTaskStatus(actor: Actor, taskId: string, status: TaskStatus, opts: { scheduledDate?: string | null; now?: Date } = {}) {
  assert(TASK_STATUSES.includes(status), "Unknown status.");
  const scheduledDate = status === "scheduled" ? opts.scheduledDate || null : null;
  if (status === "scheduled") {
    assert(scheduledDate, "Pick the day you'll do it.");
    assert(isValidISODate(scheduledDate), "Invalid date.");
  }
  const now = opts.now ?? new Date();
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).for("update");
    assert(t && !t.deletedAt, "Task not found.");
    assert(t.assigneeId === actor.id || t.createdById === actor.id || isManager(actor), "This task isn't yours.");
    assert(!t.doneAt, "This task is already done — reopen it first.");
    if (t.status === status && (t.scheduledDate ?? null) === scheduledDate) return false;
    await tx.update(tasks).set({ status, scheduledDate, statusAt: now }).where(eq(tasks.id, t.id));
    await logActivity(tx, actor, {
      action: "task_status",
      subjectUserId: t.assigneeId,
      brandId: t.brandId,
      field: "status",
      oldValue: t.status,
      newValue: status,
      summary: `${actor.name} set the task “${t.title}” to ${TASK_STATUS_LABEL[status]}${scheduledDate ? ` for ${formatDay(scheduledDate)}` : ""}.`,
      at: now,
    });
    return true;
  });
}

/** Delete one task — or, for a repeating one, stop the whole series. Managers or whoever gave it. */
export async function deleteTask(actor: Actor, taskId: string, opts: { series?: boolean } = {}) {
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(tasks).where(eq(tasks.id, taskId));
    assert(t && !t.deletedAt, "Task not found.");
    assert(t.createdById === actor.id || isManager(actor), "Only managers can delete tasks.");
    const now = new Date();
    if (opts.series && t.seriesId) {
      await tx.update(tasks).set({ deletedAt: now }).where(and(eq(tasks.seriesId, t.seriesId), isNull(tasks.doneAt), isNull(tasks.deletedAt)));
    } else {
      await tx.update(tasks).set({ deletedAt: now }).where(eq(tasks.id, t.id));
    }
    await logActivity(tx, actor, {
      action: "task_deleted",
      subjectUserId: t.assigneeId,
      summary: `${actor.name} deleted the task “${t.title}”${opts.series && t.recurrence !== "none" ? " and stopped it repeating" : ""}.`,
    });
  });
}

const giver = alias(users, "giver");
const assignee = alias(users, "assignee");

const taskCols = {
  id: tasks.id,
  title: tasks.title,
  notes: tasks.notes,
  dueDate: tasks.dueDate,
  dueTime: tasks.dueTime,
  recurrence: tasks.recurrence,
  priority: tasks.priority,
  status: tasks.status,
  scheduledDate: tasks.scheduledDate,
  doneAt: tasks.doneAt,
  createdAt: tasks.createdAt,
  assigneeId: tasks.assigneeId,
  assigneeName: assignee.name,
  createdById: tasks.createdById,
  createdByName: giver.name,
  brandName: brands.name,
  brandColor: brands.color,
};

export type TaskView = Awaited<ReturnType<typeof getTasksFor>>[number];

/** Open tasks for a person, plus the ones they finished in the last 7 days. */
export async function getTasksFor(userId: string, today = todayISO()) {
  const since = new Date(`${addDays(today, -7)}T00:00:00Z`);
  return db
    .select(taskCols)
    .from(tasks)
    .innerJoin(giver, eq(giver.id, tasks.createdById))
    .innerJoin(assignee, eq(assignee.id, tasks.assigneeId))
    .leftJoin(brands, eq(brands.id, tasks.brandId))
    .where(and(eq(tasks.assigneeId, userId), isNull(tasks.deletedAt), or(isNull(tasks.doneAt), gte(tasks.doneAt, since))))
    .orderBy(asc(tasks.doneAt), asc(tasks.dueDate), asc(tasks.createdAt));
}

/** Tasks this manager gave that are still open (and the last week's finished ones). */
export async function getTasksGivenBy(userId: string, today = todayISO()) {
  const since = new Date(`${addDays(today, -7)}T00:00:00Z`);
  return db
    .select(taskCols)
    .from(tasks)
    .innerJoin(giver, eq(giver.id, tasks.createdById))
    .innerJoin(assignee, eq(assignee.id, tasks.assigneeId))
    .leftJoin(brands, eq(brands.id, tasks.brandId))
    .where(and(eq(tasks.createdById, userId), isNull(tasks.deletedAt), or(isNull(tasks.doneAt), gte(tasks.doneAt, since))))
    .orderBy(asc(tasks.doneAt), asc(tasks.dueDate), desc(tasks.createdAt));
}
