/**
 * Dashboards for Spaces: pick what to count (everything you can see, a space, a folder or a list) and which
 * cards to show. Numbers are always read live from the tasks, and only from spaces the viewer can see.
 */
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { dashboards, lists, spaceStatuses, users, workTaskAssignees, workTaskSessions, workTasks } from "@/db/schema";
import { PRIORITIES, PRIORITY_LIST, isFinishedKind, type Priority } from "@/domain/spaces";
import { addDays, cairoDate, startOfCairoDay, todayISO, weekRange } from "@/lib/dates";
import { logActivity, type Actor } from "./activity";
import { assert } from "./errors";
import { visibleSpaces } from "./spaces";
import { truncate } from "./workflow";

export const WIDGETS = {
  summary: { label: "Totals", hint: "Open, done, overdue, % complete" },
  status: { label: "By status", hint: "How many tasks in each status" },
  people: { label: "By person", hint: "Open, done and overdue for each person" },
  priority: { label: "By priority", hint: "Urgent, high, normal, low" },
  done_weeks: { label: "Done per week", hint: "The last 8 weeks" },
  lists: { label: "Progress per list", hint: "Done out of total, per list" },
  time: { label: "Time tracked", hint: "This month, per person" },
  overdue: { label: "Overdue", hint: "Past their due date and not done" },
  due_soon: { label: "Due this week", hint: "The next 7 days" },
} as const;
export type WidgetKey = keyof typeof WIDGETS;
export const WIDGET_LIST = Object.keys(WIDGETS) as WidgetKey[];
export type Scope = { spaceId?: string | null; folderId?: string | null; listId?: string | null };

export async function saveDashboard(actor: Actor, input: { id?: string | null; name: string; scope: Scope; widgets: string[]; shared: boolean }) {
  const name = truncate(input.name.trim(), 60);
  assert(name, "Name the dashboard.");
  const widgets = input.widgets.filter((w): w is WidgetKey => w in WIDGETS);
  assert(widgets.length, "Pick at least one card.");
  const visible = await visibleSpaces(actor);
  const scope: Scope = {};
  if (input.scope.spaceId) {
    assert(visible.some((s) => s.id === input.scope.spaceId), "Pick a space you can see.");
    scope.spaceId = input.scope.spaceId;
    if (input.scope.listId) {
      const [l] = await db.select().from(lists).where(and(eq(lists.id, input.scope.listId), eq(lists.spaceId, input.scope.spaceId)));
      assert(l, "Pick a list of that space.");
      scope.listId = l.id;
    } else if (input.scope.folderId) scope.folderId = input.scope.folderId;
  }
  return db.transaction(async (tx) => {
    if (input.id) {
      const [d] = await tx.select().from(dashboards).where(eq(dashboards.id, input.id));
      assert(d && !d.archivedAt, "Dashboard not found.");
      assert(d.ownerId === actor.id || !!actor.isAdmin, "Only whoever made this dashboard can change it.");
      await tx.update(dashboards).set({ name, scope, widgets, shared: input.shared }).where(eq(dashboards.id, d.id));
      return d.id;
    }
    const [d] = await tx.insert(dashboards).values({ name, scope, widgets, shared: input.shared, ownerId: actor.id }).returning();
    await logActivity(tx, actor, { action: "dashboard_created", summary: `${actor.name} made the dashboard “${name}”.` });
    return d.id;
  });
}

export async function archiveDashboard(actor: Actor, id: string) {
  const [d] = await db.select().from(dashboards).where(eq(dashboards.id, id));
  assert(d && !d.archivedAt, "Dashboard not found.");
  assert(d.ownerId === actor.id || !!actor.isAdmin, "Only whoever made this dashboard can delete it.");
  await db.update(dashboards).set({ archivedAt: new Date() }).where(eq(dashboards.id, id));
}

/** Mine + shared ones. */
export async function listDashboards(actor: Actor) {
  return db
    .select({ id: dashboards.id, name: dashboards.name, scope: dashboards.scope, widgets: dashboards.widgets, shared: dashboards.shared, ownerId: dashboards.ownerId, ownerName: users.name, createdAt: dashboards.createdAt })
    .from(dashboards)
    .innerJoin(users, eq(users.id, dashboards.ownerId))
    .where(and(isNull(dashboards.archivedAt), or(eq(dashboards.ownerId, actor.id), eq(dashboards.shared, true))))
    .orderBy(desc(dashboards.createdAt));
}

export async function getDashboard(actor: Actor, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const all = await listDashboards(actor);
  return all.find((d) => d.id === id) ?? null;
}

/** All the numbers a dashboard can show, for a scope, from the spaces this person can see. */
export async function dashboardData(actor: Actor, scope: Scope, now = new Date()) {
  const visible = await visibleSpaces(actor);
  const spaceIds = visible.map((s) => s.id).filter((id) => !scope.spaceId || id === scope.spaceId);
  const today = todayISO(now);
  if (!spaceIds.length) return null;
  const listRows = await db.select().from(lists).where(and(inArray(lists.spaceId, spaceIds), isNull(lists.archivedAt))).orderBy(asc(lists.position));
  const listIds = listRows.filter((l) => (!scope.listId || l.id === scope.listId) && (!scope.folderId || l.folderId === scope.folderId)).map((l) => l.id);
  if (!listIds.length) return null;
  const [taskRows, statuses] = await Promise.all([
    db.select().from(workTasks).where(and(inArray(workTasks.listId, listIds), isNull(workTasks.archivedAt), isNull(workTasks.parentId))),
    db.select().from(spaceStatuses).where(inArray(spaceStatuses.spaceId, spaceIds)).orderBy(asc(spaceStatuses.position)),
  ]);
  const ids = taskRows.map((t) => t.id);
  const monthStart = startOfCairoDay(`${today.slice(0, 7)}-01`);
  const [ass, sess, people] = await Promise.all([
    ids.length ? db.select().from(workTaskAssignees).where(inArray(workTaskAssignees.taskId, ids)) : Promise.resolve([]),
    ids.length ? db.select().from(workTaskSessions).where(inArray(workTaskSessions.taskId, ids)) : Promise.resolve([]),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true)).orderBy(asc(users.name)),
  ]);
  const kindOf = new Map(statuses.map((s) => [s.id, s.kind]));
  const done = (t: (typeof taskRows)[number]) => isFinishedKind(kindOf.get(t.statusId) ?? "");
  const overdue = taskRows.filter((t) => !done(t) && t.dueDate && t.dueDate < today);
  const open = taskRows.filter((t) => !done(t));
  const wk = weekRange(today);
  const doneThisWeek = taskRows.filter((t) => t.completedAt && cairoDate(t.completedAt) >= wk.start).length;

  // By status: one row per status name across the scope (spaces may share names).
  const byStatus = new Map<string, { name: string; color: string; count: number }>();
  for (const s of statuses.filter((s) => !s.archivedAt)) if (!byStatus.has(s.name.toLowerCase())) byStatus.set(s.name.toLowerCase(), { name: s.name, color: s.color, count: 0 });
  for (const t of taskRows) {
    const s = statuses.find((x) => x.id === t.statusId);
    if (s) byStatus.get(s.name.toLowerCase())!.count++;
  }

  const byPerson = people
    .map((p) => {
      const mine = taskRows.filter((t) => ass.some((a) => a.taskId === t.id && a.userId === p.id));
      return { id: p.id, name: p.name, open: mine.filter((t) => !done(t)).length, done: mine.filter(done).length, overdue: mine.filter((t) => overdue.includes(t)).length };
    })
    .filter((p) => p.open + p.done > 0)
    .sort((a, b) => b.open + b.done - (a.open + a.done));

  const byPriority = [...PRIORITY_LIST.map((p) => ({ key: p as Priority | "none", label: PRIORITIES[p].label, color: PRIORITIES[p].color, count: open.filter((t) => t.priority === p).length })), { key: "none" as const, label: "No priority", color: "#cbd5e1", count: open.filter((t) => !t.priority).length }];

  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = addDays(wk.start, -7 * (7 - i));
    const end = addDays(start, 6);
    return { start, label: start.slice(5).split("-").reverse().join("/"), count: taskRows.filter((t) => t.completedAt && cairoDate(t.completedAt) >= start && cairoDate(t.completedAt) <= end).length };
  });

  const perList = listRows
    .filter((l) => listIds.includes(l.id))
    .map((l) => {
      const mine = taskRows.filter((t) => t.listId === l.id);
      return { id: l.id, spaceId: l.spaceId, name: l.name, space: visible.find((s) => s.id === l.spaceId)?.name ?? "", total: mine.length, done: mine.filter(done).length };
    });

  const timeByPerson = people
    .map((p) => ({
      id: p.id,
      name: p.name,
      ms: sess.filter((s) => s.userId === p.id && (s.endedAt ?? now) > monthStart).reduce((t, s) => t + ((s.endedAt ?? now).getTime() - Math.max(s.startedAt.getTime(), monthStart.getTime())), 0),
    }))
    .filter((p) => p.ms > 0)
    .sort((a, b) => b.ms - a.ms);

  const spaceOf = (t: (typeof taskRows)[number]) => visible.find((s) => s.id === t.spaceId);
  const brief = (t: (typeof taskRows)[number]) => ({ id: t.id, spaceId: t.spaceId, title: t.title, dueDate: t.dueDate, priority: t.priority as Priority | null, space: spaceOf(t)?.name ?? "", color: spaceOf(t)?.color ?? "#94a3b8", people: ass.filter((a) => a.taskId === t.id).map((a) => people.find((p) => p.id === a.userId)?.name ?? "") });

  return {
    summary: { total: taskRows.length, open: open.length, done: taskRows.length - open.length, overdue: overdue.length, doneThisWeek, pct: taskRows.length ? Math.round(((taskRows.length - open.length) / taskRows.length) * 100) : 0 },
    byStatus: [...byStatus.values()],
    byPerson,
    byPriority,
    weeks,
    perList,
    timeByPerson,
    overdue: overdue.sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "")).slice(0, 15).map(brief),
    dueSoon: open
      .filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= addDays(today, 7))
      .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
      .slice(0, 15)
      .map(brief),
  };
}

export type DashboardData = NonNullable<Awaited<ReturnType<typeof dashboardData>>>;
