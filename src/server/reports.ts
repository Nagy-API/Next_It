/**
 * Reports: what each person worked on, finished and still has, for a day / week / month, with the time it took
 * (from "In progress" until it was sent) and from what time to what time they worked. And per brand: what
 * happened, what's finished, what isn't, and what's due soon.
 */
import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { activityLog, brands, clients, contentItems, contentPlans, projects, stageCompletions, tasks, users, workSessions, type ContentType, type StageKind, type Team } from "@/db/schema";
import { addDays, cairoDate, startOfCairoDay, todayISO } from "@/lib/dates";
import { brandLogoSrc, getPeople, getWorkItems, type WorkItem } from "./queries";

/** Wall-clock time covered by these intervals: two items "In progress" at the same hour count once. */
export function coveredMs(parts: { s: Date; e: Date }[]) {
  const xs = parts.filter((p) => p.e > p.s).sort((a, b) => a.s.getTime() - b.s.getTime());
  let total = 0;
  let curS = 0;
  let curE = 0;
  for (const p of xs) {
    const s = p.s.getTime();
    const e = p.e.getTime();
    if (s > curE) {
      total += curE - curS;
      curS = s;
      curE = e;
    } else if (e > curE) curE = e;
  }
  return total + (curE - curS);
}

type Where = { itemId: string; title: string; type: ContentType; brand: { name: string; color: string } | null; client: string | null; extra: boolean };

export type FinishedLine = Where & { id: string; kind: StageKind; completedAt: Date; workedMs: number; startedAt: Date | null; lateDays: number; round: number; deadline: string | null };
export type SessionLine = Where & { id: string; kind: StageKind | null; status: string; startedAt: Date; endedAt: Date | null; ms: number };
export type DayLine = { day: string; from: Date | null; to: Date | null; workedMs: number; finished: number };
export type TaskLine = { id: string; title: string; doneAt: Date; createdByName: string };

export type PersonReport = {
  person: { id: string; name: string; username: string; teams: Team[]; title: string | null };
  finished: FinishedLine[];
  sessions: SessionLine[];
  tasksDone: TaskLine[];
  days: DayLine[];
  open: WorkItem[];
  workedMs: number;
  extrasDone: number;
};

const whereCols = {
  itemId: contentItems.id,
  title: contentItems.title,
  type: contentItems.type,
  brandName: brands.name,
  brandColor: brands.color,
  clientName: clients.name,
  extraBy: contentItems.extraRequestedById,
};

function toWhere(r: { itemId: string; title: string; type: ContentType; brandName: string | null; brandColor: string | null; clientName: string | null; extraBy: string | null }): Where {
  return { itemId: r.itemId, title: r.title, type: r.type, brand: r.brandName ? { name: r.brandName, color: r.brandColor ?? "#64748b" } : null, client: r.clientName, extra: !!r.extraBy };
}

/** Everything the reports need for [from, to] (Cairo days), for everyone or a few people, in a handful of queries. */
export async function peopleReport(from: string, to: string, opts: { userIds?: string[]; open?: WorkItem[] } = {}): Promise<PersonReport[]> {
  const fromTs = startOfCairoDay(from);
  const toTs = startOfCairoDay(addDays(to, 1));
  const now = new Date();
  const people = (await getPeople({ includeInactive: true })).filter((p) => (opts.userIds ? opts.userIds.includes(p.id) : p.isActive));
  const ids = people.map((p) => p.id);
  if (!ids.length) return [];

  const [comps, sessions, done, open] = await Promise.all([
    db
      .select({ id: stageCompletions.id, stageId: stageCompletions.stageId, userId: stageCompletions.creditedUserId, kind: stageCompletions.kind, completedAt: stageCompletions.completedAt, lateDays: stageCompletions.lateDays, round: stageCompletions.round, deadline: stageCompletions.deadline, ...whereCols })
      .from(stageCompletions)
      .innerJoin(contentItems, eq(contentItems.id, stageCompletions.itemId))
      .leftJoin(contentPlans, eq(contentPlans.id, contentItems.planId))
      .leftJoin(brands, eq(brands.id, contentPlans.brandId))
      .leftJoin(projects, eq(projects.id, contentItems.projectId))
      .leftJoin(clients, eq(clients.id, projects.clientId))
      .where(and(inArray(stageCompletions.creditedUserId, ids), gte(stageCompletions.completedAt, fromTs), lt(stageCompletions.completedAt, toTs)))
      .orderBy(asc(stageCompletions.completedAt)),
    db
      .select({ id: workSessions.id, stageId: workSessions.stageId, userId: workSessions.userId, status: workSessions.kind, startedAt: workSessions.startedAt, endedAt: workSessions.endedAt, ...whereCols })
      .from(workSessions)
      .innerJoin(contentItems, eq(contentItems.id, workSessions.itemId))
      .leftJoin(contentPlans, eq(contentPlans.id, contentItems.planId))
      .leftJoin(brands, eq(brands.id, contentPlans.brandId))
      .leftJoin(projects, eq(projects.id, contentItems.projectId))
      .leftJoin(clients, eq(clients.id, projects.clientId))
      .where(and(inArray(workSessions.userId, ids), lt(workSessions.startedAt, toTs), or(isNull(workSessions.endedAt), sql`${workSessions.endedAt} > ${fromTs}`)))
      .orderBy(asc(workSessions.startedAt)),
    db
      .select({ id: tasks.id, userId: tasks.assigneeId, title: tasks.title, doneAt: tasks.doneAt, createdByName: users.name })
      .from(tasks)
      .innerJoin(users, eq(users.id, tasks.createdById))
      .where(and(inArray(tasks.assigneeId, ids), isNull(tasks.deletedAt), isNotNull(tasks.doneAt), gte(tasks.doneAt, fromTs), lt(tasks.doneAt, toTs)))
      .orderBy(asc(tasks.doneAt)),
    opts.open ? Promise.resolve(opts.open) : getWorkItems({}),
  ]);

  // Total time each person spent on each finished step (all its sessions, not only inside the range).
  const stageIds = [...new Set(comps.map((c) => c.stageId))];
  const allStageSessions = stageIds.length
    ? await db.select({ stageId: workSessions.stageId, userId: workSessions.userId, startedAt: workSessions.startedAt, endedAt: workSessions.endedAt }).from(workSessions).where(inArray(workSessions.stageId, stageIds))
    : [];
  const kindOfStage = new Map<string, StageKind>();
  for (const i of open) for (const s of i.stages) kindOfStage.set(s.id, s.kind);
  for (const c of comps) kindOfStage.set(c.stageId, c.kind);

  return people.map((p) => {
    const finished: FinishedLine[] = comps
      .filter((c) => c.userId === p.id)
      .map((c) => {
        const mine = allStageSessions.filter((w) => w.stageId === c.stageId && w.userId === p.id);
        return {
          ...toWhere(c),
          id: c.id,
          kind: c.kind,
          completedAt: c.completedAt,
          workedMs: mine.reduce((n, w) => n + Math.max(0, (w.endedAt ?? now).getTime() - w.startedAt.getTime()), 0),
          startedAt: mine.length ? mine.reduce((a, w) => (w.startedAt < a ? w.startedAt : a), mine[0].startedAt) : null,
          lateDays: c.lateDays,
          round: c.round,
          deadline: c.deadline,
        };
      });
    const mySessions: SessionLine[] = sessions
      .filter((w) => w.userId === p.id)
      .map((w) => {
        const s = w.startedAt < fromTs ? fromTs : w.startedAt;
        const e = (w.endedAt ?? now) > toTs ? toTs : (w.endedAt ?? now);
        return { ...toWhere(w), id: w.id, kind: kindOfStage.get(w.stageId) ?? null, status: w.status, startedAt: w.startedAt, endedAt: w.endedAt, ms: Math.max(0, e.getTime() - s.getTime()) };
      });
    const tasksDone = done.filter((t) => t.userId === p.id).map((t) => ({ id: t.id, title: t.title, doneAt: t.doneAt!, createdByName: t.createdByName }));

    // Day by day: from the first moment they started to the last moment they stopped / finished something.
    const days: DayLine[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const ds = startOfCairoDay(d);
      const de = startOfCairoDay(addDays(d, 1));
      const parts = mySessions
        .map((w) => ({ s: w.startedAt < ds ? ds : w.startedAt, e: (w.endedAt ?? now) > de ? de : (w.endedAt ?? now) }))
        .filter((x) => x.e > x.s);
      const fin = finished.filter((f) => cairoDate(f.completedAt) === d);
      const marks = [...parts.flatMap((x) => [x.s, x.e]), ...fin.map((f) => f.completedAt), ...tasksDone.filter((t) => cairoDate(t.doneAt) === d).map((t) => t.doneAt)];
      if (!marks.length) continue;
      days.push({
        day: d,
        from: marks.reduce((a, b) => (b < a ? b : a)),
        to: marks.reduce((a, b) => (b > a ? b : a)),
        workedMs: coveredMs(parts),
        finished: fin.length + tasksDone.filter((t) => cairoDate(t.doneAt) === d).length,
      });
    }
    return {
      person: { id: p.id, name: p.name, username: p.username, teams: p.teams, title: p.title },
      finished,
      sessions: mySessions,
      tasksDone,
      days,
      open: open.filter((i) => i.current?.assignee?.id === p.id),
      workedMs: coveredMs(mySessions.map((w) => ({ s: w.startedAt < fromTs ? fromTs : w.startedAt, e: (w.endedAt ?? now) > toTs ? toTs : (w.endedAt ?? now) }))),
      extrasDone: finished.filter((f) => f.extra).length,
    };
  });
}

export type BrandReport = {
  brand: { id: string; name: string; slug: string; color: string; logoUrl: string | null };
  happened: { id: number; at: Date; summary: string; actorName: string | null; itemId: string | null }[];
  happenedCount: number;
  finishedSteps: { id: string; title: string; itemId: string; kind: StageKind; by: string | null; at: Date }[];
  published: WorkItem[];
  notFinished: WorkItem[];
  dueSoon: WorkItem[];
};

/** Per brand: what happened in [from, to], what's finished, what's still open, and what's due on or before `dueBy`. */
export async function brandsReport(from: string, to: string, dueBy: string, opts: { open?: WorkItem[] } = {}): Promise<BrandReport[]> {
  const fromTs = startOfCairoDay(from);
  const toTs = startOfCairoDay(addDays(to, 1));
  const [bs, open, finishedItems, steps, acts] = await Promise.all([
    db.select({ id: brands.id, name: brands.name, slug: brands.slug, color: brands.color, logoUrl: brandLogoSrc }).from(brands).where(and(eq(brands.isActive, true), isNull(brands.deletedAt))).orderBy(asc(brands.name)),
    opts.open ? Promise.resolve(opts.open) : getWorkItems({}),
    getWorkItems({ completedFrom: fromTs }),
    db
      .select({ id: stageCompletions.id, itemId: contentItems.id, title: contentItems.title, kind: stageCompletions.kind, at: stageCompletions.completedAt, by: users.name, brandId: contentPlans.brandId })
      .from(stageCompletions)
      .innerJoin(contentItems, eq(contentItems.id, stageCompletions.itemId))
      .innerJoin(contentPlans, eq(contentPlans.id, contentItems.planId))
      .leftJoin(users, eq(users.id, stageCompletions.creditedUserId))
      .where(and(gte(stageCompletions.completedAt, fromTs), lt(stageCompletions.completedAt, toTs)))
      .orderBy(desc(stageCompletions.completedAt)),
    db
      .select({ id: activityLog.id, at: activityLog.at, summary: activityLog.summary, actorName: users.name, itemId: activityLog.itemId, brandId: activityLog.brandId })
      .from(activityLog)
      .leftJoin(users, eq(users.id, activityLog.actorId))
      .where(and(isNotNull(activityLog.brandId), gte(activityLog.at, fromTs), lt(activityLog.at, toTs)))
      .orderBy(desc(activityLog.id))
      .limit(2000),
  ]);
  return bs.map((b) => {
    const mineOpen = open.filter((i) => i.brand?.id === b.id);
    const happened = acts.filter((a) => a.brandId === b.id);
    return {
      brand: b,
      happened: happened.slice(0, 8),
      happenedCount: happened.length,
      finishedSteps: steps.filter((s) => s.brandId === b.id),
      published: finishedItems.filter((i) => i.brand?.id === b.id && i.completedAt && i.completedAt < toTs),
      notFinished: mineOpen,
      dueSoon: mineOpen
        .filter((i) => (i.postingDate && i.postingDate <= dueBy) || (i.current?.deadline && i.current.deadline <= dueBy))
        .sort((x, y) => (x.postingDate ?? x.current?.deadline ?? "9").localeCompare(y.postingDate ?? y.current?.deadline ?? "9")),
    };
  });
}

export function todayRange() {
  const t = todayISO();
  return { from: t, to: t };
}
