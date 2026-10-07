/** Numbers for the Dashboard, personal stats and the notification bell. */
import { and, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { contentItems, contentPlans, notifications, stageCompletions, users, type StageKind } from "@/db/schema";
import { STAGE_META } from "@/domain/workflow";
import { addDays, diffDays, formatDay, monthLabel, monthName, monthRange, shiftMonth, startOfCairoDay, todayISO } from "@/lib/dates";
import { getBrands, getPeople, getWorkItems, tasksFor, type WorkItem } from "./queries";

/* ------------------------------------------------------------------ */
/* Month-over-month                                                        */
/* ------------------------------------------------------------------ */

export type MonthPoint = { year: number; month: number; label: string; value: number };

function lastMonths(year: number, month: number, n: number) {
  return Array.from({ length: n }, (_, i) => shiftMonth(year, month, i - n + 1));
}

/** Items finished (published / delivered) per month. */
export async function finishedPerMonth(year: number, month: number, n = 6, brandId?: string): Promise<MonthPoint[]> {
  const months = lastMonths(year, month, n);
  const from = startOfCairoDay(monthRange(months[0].year, months[0].month).start);
  const to = startOfCairoDay(addDays(monthRange(year, month).end, 1));
  const rows = await db
    .select({ completedAt: contentItems.completedAt })
    .from(contentItems)
    .leftJoin(contentPlans, eq(contentPlans.id, contentItems.planId))
    .where(and(isNull(contentItems.cancelledAt), gte(contentItems.completedAt, from), lt(contentItems.completedAt, to), brandId ? eq(contentPlans.brandId, brandId) : undefined));
  return months.map((m) => {
    const a = startOfCairoDay(monthRange(m.year, m.month).start).getTime();
    const b = startOfCairoDay(addDays(monthRange(m.year, m.month).end, 1)).getTime();
    return { ...m, label: monthName(m.month, true), value: rows.filter((r) => r.completedAt!.getTime() >= a && r.completedAt!.getTime() < b).length };
  });
}

/** Steps a person completed per month (credited to them). */
export async function personPerMonth(userId: string, year: number, month: number, n = 6) {
  const months = lastMonths(year, month, n);
  const from = startOfCairoDay(monthRange(months[0].year, months[0].month).start);
  const rows = await db
    .select({ completedAt: stageCompletions.completedAt, lateDays: stageCompletions.lateDays, round: stageCompletions.round, excused: stageCompletions.excused })
    .from(stageCompletions)
    .where(and(eq(stageCompletions.creditedUserId, userId), gte(stageCompletions.completedAt, from)));
  return months.map((m) => {
    const a = startOfCairoDay(monthRange(m.year, m.month).start).getTime();
    const b = startOfCairoDay(addDays(monthRange(m.year, m.month).end, 1)).getTime();
    const inMonth = rows.filter((r) => r.completedAt.getTime() >= a && r.completedAt.getTime() < b);
    return {
      ...m,
      label: monthName(m.month, true),
      value: inMonth.length,
      late: inMonth.filter((r) => r.round === 1 && r.lateDays > 0 && !r.excused).length,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Dashboard for one month                                                */
/* ------------------------------------------------------------------ */

type DeptCell = { tasks: number; done: number };
export type BrandRow = {
  brand: { id: string; name: string; slug: string; color: string };
  /** The month's plan (extra tasks given on top are counted on their own). */
  total: number;
  published: number;
  extra: number;
  extraDone: number;
  social: number;
  production: number;
  content: number;
  late: number;
  media: DeptCell;
  design: DeptCell;
  socialDept: DeptCell;
};

function dept(items: WorkItem[], kind: StageKind): DeptCell {
  const withStage = items.filter((i) => i.stages.some((s) => s.kind === kind));
  return { tasks: withStage.length, done: withStage.filter((i) => i.stages.find((s) => s.kind === kind)!.status === "done").length };
}

export async function getDashboard(year: number, month: number) {
  const today = todayISO();
  const plans = await db.select({ id: contentPlans.id, brandId: contentPlans.brandId }).from(contentPlans).where(and(eq(contentPlans.year, year), eq(contentPlans.month, month)));
  const prev = shiftMonth(year, month, -1);
  const prevPlans = await db.select({ id: contentPlans.id }).from(contentPlans).where(and(eq(contentPlans.year, prev.year), eq(contentPlans.month, prev.month)));
  const [items, prevItems, brands, people, open] = await Promise.all([
    getWorkItems({ planIds: plans.map((p) => p.id), includeDone: true }, today),
    getWorkItems({ planIds: prevPlans.map((p) => p.id), includeDone: true }, today),
    getBrands(),
    getPeople({ includeInactive: true }),
    getWorkItems({}, today),
  ]);

  const rows: BrandRow[] = brands
    .filter((b) => b.isActive || items.some((i) => i.brand?.id === b.id))
    .map((b) => {
      const mine = items.filter((i) => i.brand?.id === b.id);
      const planned = mine.filter((i) => !i.extra);
      return {
        brand: { id: b.id, name: b.name, slug: b.slug, color: b.color },
        total: planned.length,
        published: planned.filter((i) => i.completedAt).length,
        extra: mine.length - planned.length,
        extraDone: mine.filter((i) => i.extra && i.completedAt).length,
        social: mine.filter((i) => i.current?.kind === "social").length,
        production: mine.filter((i) => i.current && (i.current.kind === "shooting" || i.current.kind === "media" || i.current.kind === "design")).length,
        content: mine.filter((i) => i.current?.kind === "content").length,
        late: mine.filter((i) => i.attention === "overdue").length,
        media: dept(mine, "media"),
        design: dept(mine, "design"),
        socialDept: dept(mine, "social"),
      };
    });

  const planned = items.filter((i) => !i.extra);
  const totals = {
    total: planned.length,
    published: planned.filter((i) => i.completedAt).length,
    extra: items.length - planned.length,
    inProgress: items.filter((i) => !i.completedAt).length,
    late: open.filter((i) => i.attention === "overdue").length,
    prevTotal: prevItems.filter((i) => !i.extra).length,
    prevPublished: prevItems.filter((i) => !i.extra && i.completedAt).length,
  };
  const departments = (["media", "design", "social"] as const).map((k) => ({ kind: k, label: STAGE_META[k].label, ...dept(items, k) }));

  // People: steps completed this month vs last month, lateness, open work now.
  const from = startOfCairoDay(monthRange(prev.year, prev.month).start);
  const comps = await db
    .select({ userId: stageCompletions.creditedUserId, completedAt: stageCompletions.completedAt, lateDays: stageCompletions.lateDays, round: stageCompletions.round, excused: stageCompletions.excused, deadline: stageCompletions.deadline })
    .from(stageCompletions)
    .where(gte(stageCompletions.completedAt, from));
  const thisStart = startOfCairoDay(monthRange(year, month).start).getTime();
  const thisEnd = startOfCairoDay(addDays(monthRange(year, month).end, 1)).getTime();
  const peopleRows = people
    .filter((p) => p.isActive)
    .map((p) => {
      const mine = comps.filter((c) => c.userId === p.id);
      const now = mine.filter((c) => c.completedAt.getTime() >= thisStart && c.completedAt.getTime() < thisEnd);
      const before = mine.filter((c) => c.completedAt.getTime() < thisStart);
      const withDeadline = now.filter((c) => c.deadline && c.round === 1);
      const late = withDeadline.filter((c) => c.lateDays > 0 && !c.excused).length;
      const tasks = tasksFor(open, p);
      return {
        person: p,
        done: now.length,
        donePrev: before.length,
        late,
        onTimeRate: withDeadline.length ? Math.round(((withDeadline.length - late) / withDeadline.length) * 100) : null,
        openNow: tasks.length,
        lateNow: tasks.filter((i) => i.current?.health === "overdue").length,
      };
    })
    .filter((r) => r.done || r.donePrev || r.openNow);

  return { label: monthLabel(year, month), prevLabel: monthLabel(prev.year, prev.month), rows, totals, departments, people: peopleRows };
}

/* ------------------------------------------------------------------ */
/* Notification bell                                                        */
/* ------------------------------------------------------------------ */

export type Alert = { id: string; tone: "bad" | "warn"; title: string; body: string; itemId?: string; href?: string };

/** Live reminders computed from the work itself (no need to store them): late / due soon / posting soon. */
export function alertsFor(
  open: WorkItem[],
  user: { id: string; teams: readonly string[]; isAdmin: boolean; isManager?: boolean },
  myTasks: { id: string; title: string; dueDate: string | null; doneAt: Date | null; createdByName: string }[] = [],
): Alert[] {
  const today = todayISO();
  const out: Alert[] = [];
  for (const i of tasksFor(open, user)) {
    const c = i.current!;
    if (c.health === "overdue") out.push({ id: `late-${c.id}`, tone: "bad", title: `Late: ${i.title}`, body: `${STAGE_META[c.kind].label} was due ${formatDay(c.deadline)}`, itemId: i.id });
    else if (c.deadline && diffDays(c.deadline, today) <= 1 && diffDays(c.deadline, today) >= 0)
      out.push({ id: `due-${c.id}`, tone: "warn", title: `Due ${diffDays(c.deadline, today) === 0 ? "today" : "tomorrow"}: ${i.title}`, body: STAGE_META[c.kind].label, itemId: i.id });
    else if (i.attention === "at_risk") out.push({ id: `risk-${c.id}`, tone: "warn", title: `Posting soon: ${i.title}`, body: `Posts ${formatDay(i.postingDate)} and it's still with ${STAGE_META[c.kind].label}`, itemId: i.id });
  }
  for (const t of myTasks.filter((x) => !x.doneAt && x.dueDate)) {
    const d = diffDays(t.dueDate!, today);
    if (d < 0) out.push({ id: `tlate-${t.id}`, tone: "bad", title: `Late task: ${t.title}`, body: `From ${t.createdByName} · was due ${formatDay(t.dueDate)}`, href: "/my-work#tasks" });
    else if (d <= 1) out.push({ id: `tdue-${t.id}`, tone: "warn", title: `Task due ${d === 0 ? "today" : "tomorrow"}: ${t.title}`, body: `From ${t.createdByName}`, href: "/my-work#tasks" });
  }
  // Content posting within 48h that's still on me — highlighted even without a deadline.
  for (const i of tasksFor(open, user).filter((x) => x.hot && !out.some((a) => a.itemId === x.id))) {
    out.push({ id: `hot-${i.id}`, tone: "warn", title: `Posts ${i.postingDate === today ? "today" : formatDay(i.postingDate)}: ${i.title}`, body: `Still with ${STAGE_META[i.current!.kind].label} — move it now`, itemId: i.id });
  }
  const manager = user.isAdmin || !!user.isManager;
  if (manager) {
    for (const i of open.filter((x) => x.attention === "overdue" && !tasksFor([x], user).length).slice(0, 10)) {
      const c = i.current!;
      out.push({ id: `mlate-${c.id}`, tone: "bad", title: `Late: ${i.title}`, body: `${c.assignee?.name ?? `${STAGE_META[c.kind].label} team`} · was due ${formatDay(c.deadline)}`, itemId: i.id });
    }
  }
  return out;
}

export async function getNotifications(userId: string, limit = 30) {
  const rows = await db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      title: notifications.title,
      body: notifications.body,
      itemId: notifications.itemId,
      href: notifications.href,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
      actorName: users.name,
    })
    .from(notifications)
    .leftJoin(users, eq(users.id, notifications.actorId))
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  const [{ unread }] = await db
    .select({ unread: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return { rows, unread };
}

export async function markNotificationsRead(userId: string, ids?: string[]) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), ids?.length ? inArray(notifications.id, ids) : undefined));
}
