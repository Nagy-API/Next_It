/** Read models for the UI. Every screen gets items in the same enriched shape. */
import { and, asc, desc, eq, gte, ilike, inArray, isNull, isNotNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  activityLog,
  brands,
  clients,
  comments,
  contentItems,
  contentPlans,
  itemPlatforms,
  platforms,
  projects,
  stageCompletions,
  stages,
  users,
  type ContentType,
  type PlatformStatus,
  type StageKind,
  type StageStatus,
  type Team,
} from "@/db/schema";
import { currentStage, stageHealth, type StageHealth, type WorkContext } from "@/domain/workflow";
import { addDays, monthRange, startOfCairoDay, todayISO, weekRange } from "@/lib/dates";

export type Person = { id: string; name: string; username: string; isActive: boolean; teams: Team[]; title: string | null };

export async function getPeople(opts: { includeInactive?: boolean } = {}): Promise<Person[]> {
  const rows = await db
    .select({ id: users.id, name: users.name, username: users.username, isActive: users.isActive, teams: users.teams, title: users.title })
    .from(users)
    .where(opts.includeInactive ? undefined : eq(users.isActive, true))
    .orderBy(asc(users.name));
  return rows;
}

export type StageView = {
  id: string;
  kind: StageKind;
  position: number;
  status: StageStatus;
  assignee: { id: string; name: string } | null;
  deadline: string | null;
  originalDeadline: string | null;
  shiftDays: number;
  shiftReason: string | null;
  round: number;
  activatedAt: Date | null;
  completedAt: Date | null;
  completedBy: { id: string; name: string } | null;
  returnedAt: Date | null;
  returnedBy: { id: string; name: string } | null;
  returnNote: string | null;
  lateExcusedAt: Date | null;
  lateExcusedBy: { id: string; name: string } | null;
  health: StageHealth;
};

export type WorkItem = {
  id: string;
  title: string;
  type: ContentType;
  context: WorkContext;
  postingDate: string | null;
  postingTime: string | null;
  canvaUrl: string | null;
  driveUrl: string | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  brand: { id: string; name: string; slug: string; color: string; isActive: boolean } | null;
  plan: { id: string; year: number; month: number } | null;
  project: { id: string; name: string; clientId: string; clientName: string; clientSlug: string } | null;
  stages: StageView[];
  current: StageView | null;
  /** What the item needs right now, in one word — drives badges & sorting. */
  attention: "overdue" | "returned" | "unassigned" | "at_risk" | "due_soon" | null;
  platforms: { platformId: string; name: string; status: PlatformStatus; date: string | null; time: string | null; liveUrl: string | null }[];
};

const brandCols = { id: brands.id, name: brands.name, slug: brands.slug, color: brands.color, isActive: brands.isActive };

type ItemFilter = {
  ids?: string[];
  planIds?: string[];
  projectIds?: string[];
  brandId?: string;
  includeDone?: boolean;
  includeCancelled?: boolean;
  onlyCancelled?: boolean;
  postingFrom?: string;
  postingTo?: string;
  completedFrom?: Date;
  titleLike?: string;
};

/** Load items (with brand/project, stages, people, platforms) and compute health once, centrally. */
export async function getWorkItems(f: ItemFilter = {}, today = todayISO()): Promise<WorkItem[]> {
  const where: (SQL | undefined)[] = [];
  if (f.ids) where.push(f.ids.length ? inArray(contentItems.id, f.ids) : sql`false`);
  if (f.planIds) where.push(f.planIds.length ? inArray(contentItems.planId, f.planIds) : sql`false`);
  if (f.projectIds) where.push(f.projectIds.length ? inArray(contentItems.projectId, f.projectIds) : sql`false`);
  if (f.brandId) where.push(eq(contentPlans.brandId, f.brandId));
  if (f.onlyCancelled) where.push(isNotNull(contentItems.cancelledAt));
  else if (!f.includeCancelled) where.push(isNull(contentItems.cancelledAt));
  if (!f.includeDone && !f.completedFrom) where.push(isNull(contentItems.completedAt));
  if (f.completedFrom) where.push(gte(contentItems.completedAt, f.completedFrom));
  if (f.postingFrom) where.push(gte(contentItems.postingDate, f.postingFrom));
  if (f.postingTo) where.push(lte(contentItems.postingDate, f.postingTo));
  if (f.titleLike) where.push(ilike(contentItems.title, `%${f.titleLike}%`));

  const rows = await db
    .select({
      item: contentItems,
      brand: brandCols,
      plan: { id: contentPlans.id, year: contentPlans.year, month: contentPlans.month },
      project: { id: projects.id, name: projects.name, clientId: clients.id, clientName: clients.name, clientSlug: clients.slug },
    })
    .from(contentItems)
    .leftJoin(contentPlans, eq(contentPlans.id, contentItems.planId))
    .leftJoin(brands, eq(brands.id, contentPlans.brandId))
    .leftJoin(projects, eq(projects.id, contentItems.projectId))
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(and(...where))
    .orderBy(sql`${contentItems.postingDate} asc nulls last`, asc(contentItems.createdAt));

  return enrich(rows, today);
}

async function enrich(
  rows: {
    item: typeof contentItems.$inferSelect;
    brand: WorkItem["brand"] | null;
    plan: WorkItem["plan"] | null;
    project: { id: string | null; name: string | null; clientId: string | null; clientName: string | null; clientSlug: string | null } | null;
  }[],
  today: string,
): Promise<WorkItem[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.item.id);
  const [stageRows, people, platRows] = await Promise.all([
    db.select().from(stages).where(inArray(stages.itemId, ids)).orderBy(asc(stages.position)),
    db.select({ id: users.id, name: users.name }).from(users),
    db
      .select({ itemId: itemPlatforms.itemId, platformId: itemPlatforms.platformId, name: platforms.name, sortOrder: platforms.sortOrder, status: itemPlatforms.status, date: itemPlatforms.date, time: itemPlatforms.time, liveUrl: itemPlatforms.liveUrl })
      .from(itemPlatforms)
      .innerJoin(platforms, eq(platforms.id, itemPlatforms.platformId))
      .where(inArray(itemPlatforms.itemId, ids))
      .orderBy(asc(platforms.sortOrder)),
  ]);
  const nameOf = new Map(people.map((p) => [p.id, p]));
  const person = (id: string | null) => (id ? (nameOf.get(id) ?? null) : null);
  const stagesByItem = new Map<string, StageView[]>();
  for (const s of stageRows) {
    const view: StageView = {
      id: s.id,
      kind: s.kind,
      position: s.position,
      status: s.status,
      assignee: person(s.assigneeId),
      deadline: s.deadline,
      originalDeadline: s.originalDeadline,
      shiftDays: s.shiftDays,
      shiftReason: s.shiftReason,
      round: s.round,
      activatedAt: s.activatedAt,
      completedAt: s.completedAt,
      completedBy: person(s.completedById),
      returnedAt: s.returnedAt,
      returnedBy: person(s.returnedById),
      returnNote: s.returnNote,
      lateExcusedAt: s.lateExcusedAt,
      lateExcusedBy: person(s.lateExcusedById),
      health: stageHealth(s, today),
    };
    const list = stagesByItem.get(s.itemId) ?? [];
    list.push(view);
    stagesByItem.set(s.itemId, list);
  }
  const platsByItem = new Map<string, WorkItem["platforms"]>();
  for (const p of platRows) {
    const list = platsByItem.get(p.itemId) ?? [];
    list.push({ platformId: p.platformId, name: p.name, status: p.status, date: p.date, time: p.time, liveUrl: p.liveUrl });
    platsByItem.set(p.itemId, list);
  }

  return rows.map(({ item, brand, plan, project }) => {
    const st = stagesByItem.get(item.id) ?? [];
    const cur = item.cancelledAt || item.completedAt ? null : currentStage(st);
    const context: WorkContext = item.planId ? "plan" : "project";
    return {
      id: item.id,
      title: item.title,
      type: item.type,
      context,
      postingDate: item.postingDate,
      postingTime: item.postingTime,
      canvaUrl: item.canvaUrl,
      driveUrl: item.driveUrl,
      completedAt: item.completedAt,
      cancelledAt: item.cancelledAt,
      createdAt: item.createdAt,
      brand: brand?.id ? brand : null,
      plan: plan?.id ? plan : null,
      project: project?.id ? (project as WorkItem["project"]) : null,
      stages: st,
      current: cur,
      attention: attentionOf(cur, item.postingDate, context, today),
      platforms: platsByItem.get(item.id) ?? [],
    };
  });
}

/** Posting within this many days while still before Social = at risk. */
export const AT_RISK_DAYS = 3;

function attentionOf(cur: StageView | null, postingDate: string | null, context: WorkContext, today: string): WorkItem["attention"] {
  if (!cur) return null;
  if (cur.health === "overdue") return "overdue";
  if (cur.round > 1 && cur.returnedAt) return "returned";
  if (context === "plan" && postingDate && cur.kind !== "social" && postingDate <= addDays(today, AT_RISK_DAYS)) return "at_risk";
  if (!cur.assignee) return "unassigned";
  if (cur.health === "due_today" || cur.health === "due_soon") return "due_soon";
  return null;
}

/* ------------------------------------------------------------------ */
/* Item detail                                                          */
/* ------------------------------------------------------------------ */

export async function getItemDetail(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [item] = await getWorkItems({ ids: [id], includeDone: true, includeCancelled: true });
  if (!item) return null;
  const [history, allPlatforms, commentRows] = await Promise.all([
    db
      .select({ id: activityLog.id, at: activityLog.at, action: activityLog.action, summary: activityLog.summary, actorId: activityLog.actorId, actorName: users.name, stageKind: activityLog.stageKind })
      .from(activityLog)
      .leftJoin(users, eq(users.id, activityLog.actorId))
      .where(eq(activityLog.itemId, id))
      .orderBy(desc(activityLog.id)),
    db.select().from(platforms).orderBy(asc(platforms.sortOrder)),
    db
      .select({ id: comments.id, body: comments.body, tag: comments.tag, createdAt: comments.createdAt, authorName: users.name, authorId: users.id })
      .from(comments)
      .innerJoin(users, eq(users.id, comments.authorId))
      .where(eq(comments.itemId, id))
      .orderBy(desc(comments.createdAt)),
  ]);
  return { item, history, allPlatforms, comments: commentRows };
}

/* ------------------------------------------------------------------ */
/* Brands & months                                                      */
/* ------------------------------------------------------------------ */

export async function getBrands() {
  return db
    .select({ ...brandCols, logoUrl: brands.logoUrl, defaultCreatorId: brands.defaultCreatorId, creatorName: users.name, createdAt: brands.createdAt, archivedAt: brands.archivedAt })
    .from(brands)
    .leftJoin(users, eq(users.id, brands.defaultCreatorId))
    .orderBy(asc(brands.name));
}

export async function getBrandBySlug(slug: string) {
  const [b] = await db
    .select({ ...brandCols, logoUrl: brands.logoUrl, defaultCreatorId: brands.defaultCreatorId, creatorName: users.name, archivedAt: brands.archivedAt })
    .from(brands)
    .leftJoin(users, eq(users.id, brands.defaultCreatorId))
    .where(eq(brands.slug, slug));
  return b ?? null;
}

/** All months that have a plan for a brand, newest first, with simple counts. */
export async function getBrandMonths(brandId: string) {
  return db
    .select({
      id: contentPlans.id,
      year: contentPlans.year,
      month: contentPlans.month,
      total: sql<number>`count(${contentItems.id}) filter (where ${contentItems.cancelledAt} is null)::int`,
      done: sql<number>`count(${contentItems.id}) filter (where ${contentItems.completedAt} is not null and ${contentItems.cancelledAt} is null)::int`,
    })
    .from(contentPlans)
    .leftJoin(contentItems, eq(contentItems.planId, contentPlans.id))
    .where(eq(contentPlans.brandId, brandId))
    .groupBy(contentPlans.id)
    .orderBy(desc(contentPlans.year), desc(contentPlans.month));
}

export async function getPlan(brandId: string, year: number, month: number) {
  const [p] = await db
    .select()
    .from(contentPlans)
    .where(and(eq(contentPlans.brandId, brandId), eq(contentPlans.year, year), eq(contentPlans.month, month)));
  return p ?? null;
}

/* ------------------------------------------------------------------ */
/* Projects                                                              */
/* ------------------------------------------------------------------ */

export async function getClientsWithProjects() {
  const rows = await db
    .select({
      clientId: clients.id,
      clientName: clients.name,
      clientSlug: clients.slug,
      projectId: projects.id,
      projectName: projects.name,
      projectCreatedAt: projects.createdAt,
      total: sql<number>`count(${contentItems.id}) filter (where ${contentItems.cancelledAt} is null)::int`,
      done: sql<number>`count(${contentItems.id}) filter (where ${contentItems.completedAt} is not null and ${contentItems.cancelledAt} is null)::int`,
    })
    .from(clients)
    .leftJoin(projects, eq(projects.clientId, clients.id))
    .leftJoin(contentItems, eq(contentItems.projectId, projects.id))
    .groupBy(clients.id, projects.id)
    .orderBy(asc(clients.name), desc(projects.createdAt));
  const map = new Map<string, { id: string; name: string; slug: string; projects: { id: string; name: string; createdAt: Date; total: number; done: number }[] }>();
  for (const r of rows) {
    const c = map.get(r.clientId) ?? { id: r.clientId, name: r.clientName, slug: r.clientSlug, projects: [] };
    if (r.projectId) c.projects.push({ id: r.projectId, name: r.projectName!, createdAt: r.projectCreatedAt!, total: r.total, done: r.done });
    map.set(r.clientId, c);
  }
  return [...map.values()];
}

export async function getProject(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [p] = await db
    .select({ id: projects.id, name: projects.name, notes: projects.notes, createdAt: projects.createdAt, clientId: clients.id, clientName: clients.name, clientSlug: clients.slug })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(eq(projects.id, id));
  return p ?? null;
}

export async function getClientBySlug(slug: string) {
  const [c] = await db.select().from(clients).where(eq(clients.slug, slug));
  return c ?? null;
}

/* ------------------------------------------------------------------ */
/* Activity                                                              */
/* ------------------------------------------------------------------ */

export async function getActivity(f: { actorId?: string; brandId?: string; before?: number; limit?: number } = {}) {
  const limit = f.limit ?? 50;
  const rows = await db
    .select({
      id: activityLog.id,
      at: activityLog.at,
      action: activityLog.action,
      summary: activityLog.summary,
      actorName: users.name,
      actorId: activityLog.actorId,
      itemId: activityLog.itemId,
      itemTitle: contentItems.title,
      brandName: brands.name,
      brandColor: brands.color,
      projectId: activityLog.projectId,
    })
    .from(activityLog)
    .leftJoin(users, eq(users.id, activityLog.actorId))
    .leftJoin(contentItems, eq(contentItems.id, activityLog.itemId))
    .leftJoin(brands, eq(brands.id, activityLog.brandId))
    .where(
      and(
        f.actorId ? eq(activityLog.actorId, f.actorId) : undefined,
        f.brandId ? eq(activityLog.brandId, f.brandId) : undefined,
        f.before ? sql`${activityLog.id} < ${f.before}` : undefined,
      ),
    )
    .orderBy(desc(activityLog.id))
    .limit(limit + 1);
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

/* ------------------------------------------------------------------ */
/* Home                                                                   */
/* ------------------------------------------------------------------ */

export async function getHomeData(today = todayISO()) {
  const week = weekRange(today);
  const month = monthRange(Number(today.slice(0, 4)), Number(today.slice(5, 7)));
  const [open, publishingWeek, finishedThisMonth, activeBrands] = await Promise.all([
    getWorkItems({}, today),
    getWorkItems({ includeDone: true, postingFrom: week.start, postingTo: week.end }, today),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(contentItems)
      .where(and(isNull(contentItems.cancelledAt), gte(contentItems.completedAt, startOfCairoDay(month.start)))),
    db.select(brandCols).from(brands).where(eq(brands.isActive, true)).orderBy(asc(brands.name)),
  ]);
  return { open, publishingWeek: publishingWeek.filter((i) => i.context === "plan"), finishedThisMonth: finishedThisMonth[0].count, activeBrands, week, today };
}

/** Per-brand progress for a given month (for the Home brand strip & brand list). */
export async function getBrandMonthSummaries(year: number, month: number, today = todayISO()) {
  const plans = await db
    .select({ id: contentPlans.id, brandId: contentPlans.brandId })
    .from(contentPlans)
    .where(and(eq(contentPlans.year, year), eq(contentPlans.month, month)));
  const items = await getWorkItems({ planIds: plans.map((p) => p.id), includeDone: true }, today);
  const byBrand = new Map<string, WorkItem[]>();
  for (const i of items) {
    const list = byBrand.get(i.brand!.id) ?? [];
    list.push(i);
    byBrand.set(i.brand!.id, list);
  }
  return byBrand;
}

/* ------------------------------------------------------------------ */
/* Team insights                                                          */
/* ------------------------------------------------------------------ */

export type PersonInsight = {
  person: Person;
  completed: number;
  onTime: number;
  late: number;
  excused: number;
  noDeadline: number;
  rework: number;
  openNow: number;
  overdueNow: number;
  waitingNow: number;
};

/**
 * Descriptive, fair numbers per person:
 *  - completions are credited to the assignee at the time,
 *  - lateness counts first-pass work (or rework with a fresh deadline) only, and never excused misses,
 *  - work still waiting on a previous stage is shown separately and never counts as late.
 */
export async function getInsights(from: string, to: string, today = todayISO()) {
  const people = await getPeople({ includeInactive: true });
  const fromTs = startOfCairoDay(from);
  const toTs = startOfCairoDay(addDays(to, 1));
  const [comps, openStages] = await Promise.all([
    db
      .select()
      .from(stageCompletions)
      .where(and(gte(stageCompletions.completedAt, fromTs), sql`${stageCompletions.completedAt} < ${toTs}`)),
    db
      .select({ stage: stages })
      .from(stages)
      .innerJoin(contentItems, eq(contentItems.id, stages.itemId))
      .where(and(isNull(contentItems.cancelledAt), isNull(contentItems.completedAt), inArray(stages.status, ["active", "waiting"]), isNotNull(stages.assigneeId))),
  ]);
  const out = new Map<string, PersonInsight>(
    people.map((p) => [p.id, { person: p, completed: 0, onTime: 0, late: 0, excused: 0, noDeadline: 0, rework: 0, openNow: 0, overdueNow: 0, waitingNow: 0 }]),
  );
  for (const c of comps) {
    const row = c.creditedUserId ? out.get(c.creditedUserId) : undefined;
    if (!row) continue;
    row.completed++;
    // Rework after a return is shown separately; only first-pass deadlines are held against someone.
    const counts = c.round === 1;
    if (c.round > 1) row.rework++;
    if (!c.deadline) row.noDeadline++;
    else if (c.lateDays > 0 && counts) {
      if (c.excused) row.excused++;
      else row.late++;
    } else row.onTime++;
  }
  for (const { stage } of openStages) {
    const row = out.get(stage.assigneeId!);
    if (!row) continue;
    if (stage.status === "waiting") row.waitingNow++;
    else {
      row.openNow++;
      if (stageHealth(stage, today) === "overdue") row.overdueNow++;
    }
  }
  return [...out.values()];
}

export async function getPersonCompletions(userId: string, from: string, to: string) {
  const fromTs = startOfCairoDay(from);
  const toTs = startOfCairoDay(addDays(to, 1));
  return db
    .select({
      id: stageCompletions.id,
      kind: stageCompletions.kind,
      completedAt: stageCompletions.completedAt,
      deadline: stageCompletions.deadline,
      lateDays: stageCompletions.lateDays,
      round: stageCompletions.round,
      excused: stageCompletions.excused,
      itemId: contentItems.id,
      title: contentItems.title,
      type: contentItems.type,
      brandName: brands.name,
      brandColor: brands.color,
      clientName: clients.name,
    })
    .from(stageCompletions)
    .innerJoin(contentItems, eq(contentItems.id, stageCompletions.itemId))
    .leftJoin(contentPlans, eq(contentPlans.id, contentItems.planId))
    .leftJoin(brands, eq(brands.id, contentPlans.brandId))
    .leftJoin(projects, eq(projects.id, contentItems.projectId))
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(stageCompletions.creditedUserId, userId), gte(stageCompletions.completedAt, fromTs), sql`${stageCompletions.completedAt} < ${toTs}`))
    .orderBy(desc(stageCompletions.completedAt));
}

/** Items where this person holds the current stage, or a stage that is waiting to reach them. */
export async function getPersonWork(userId: string, today = todayISO()) {
  const rows = await db
    .select({ itemId: stages.itemId })
    .from(stages)
    .innerJoin(contentItems, eq(contentItems.id, stages.itemId))
    .where(and(eq(stages.assigneeId, userId), inArray(stages.status, ["active", "waiting"]), isNull(contentItems.cancelledAt), isNull(contentItems.completedAt)));
  const items = await getWorkItems({ ids: [...new Set(rows.map((r) => r.itemId))] }, today);
  const now = items.filter((i) => i.current?.assignee?.id === userId);
  const next = items.filter((i) => i.current?.assignee?.id !== userId);
  return { now, next };
}

/* ------------------------------------------------------------------ */
/* Search                                                                  */
/* ------------------------------------------------------------------ */

export async function search(q: string) {
  const term = q.trim();
  if (term.length < 2) return { items: [], brands: [], clients: [], projects: [], people: [] };
  const like = `%${term.replace(/[%_]/g, "\\$&")}%`;
  const [itemRows, brandRows, clientRows, projectRows, peopleRows] = await Promise.all([
    db
      .select({ id: contentItems.id })
      .from(contentItems)
      .leftJoin(contentPlans, eq(contentPlans.id, contentItems.planId))
      .leftJoin(brands, eq(brands.id, contentPlans.brandId))
      .leftJoin(projects, eq(projects.id, contentItems.projectId))
      .leftJoin(clients, eq(clients.id, projects.clientId))
      .where(or(ilike(contentItems.title, like), ilike(brands.name, like), ilike(clients.name, like), ilike(projects.name, like)))
      .orderBy(desc(contentItems.createdAt))
      .limit(40),
    db.select(brandCols).from(brands).where(ilike(brands.name, like)).limit(10),
    db.select({ id: clients.id, name: clients.name, slug: clients.slug }).from(clients).where(ilike(clients.name, like)).limit(10),
    db
      .select({ id: projects.id, name: projects.name, clientName: clients.name })
      .from(projects)
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .where(ilike(projects.name, like))
      .limit(10),
    db.select({ id: users.id, name: users.name, username: users.username, title: users.title }).from(users).where(or(ilike(users.name, like), ilike(users.username, like))).limit(10),
  ]);
  const items = await getWorkItems({ ids: itemRows.map((r) => r.id), includeDone: true, includeCancelled: true });
  return { items, brands: brandRows, clients: clientRows, projects: projectRows, people: peopleRows };
}

