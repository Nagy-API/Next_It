/**
 * Workflow transitions. Every function:
 *  - runs in one transaction and locks the content item row (no double completions),
 *  - derives timestamps / completing user / next stage automatically,
 *  - writes immutable activity records for everything it changes.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { db, type Tx } from "@/db";
import {
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
  type ContentItem,
  type PlatformStatus,
  type Stage,
  type StageKind,
} from "@/db/schema";
import {
  PLATFORM_STATUS_META,
  STAGE_META,
  canReturnTo,
  currentStage,
  downstreamShift,
  finalLabel,
  lateDaysFor,
  shiftedDeadline,
  socialComplete,
  type WorkContext,
} from "@/domain/workflow";
import { cairoDate, formatDay, isValidISODate, isValidTime, monthLabel, plural } from "@/lib/dates";
import { logActivity, type Actor } from "./activity";
import { UserError, assert } from "./errors";

/* ------------------------------------------------------------------ */
/* Loading helpers                                                      */
/* ------------------------------------------------------------------ */

export type ItemCtx = {
  item: ContentItem;
  context: WorkContext;
  brandId: string | null;
  projectId: string | null;
  clientId: string | null;
  /** "Vanilla Roza · October 2026" or "SINAI · Summer Campaign" */
  where: string;
};

export async function loadItemCtx(tx: Tx, itemId: string, lock = true): Promise<ItemCtx> {
  const q = tx.select().from(contentItems).where(eq(contentItems.id, itemId));
  const [item] = lock ? await q.for("update") : await q;
  if (!item) throw new UserError("Content item not found.");
  if (item.planId) {
    const [p] = await tx
      .select({ brandId: brands.id, brandName: brands.name, year: contentPlans.year, month: contentPlans.month })
      .from(contentPlans)
      .innerJoin(brands, eq(brands.id, contentPlans.brandId))
      .where(eq(contentPlans.id, item.planId));
    return {
      item,
      context: "plan",
      brandId: p.brandId,
      projectId: null,
      clientId: null,
      where: `${p.brandName} · ${monthLabel(p.year, p.month)}`,
    };
  }
  const [p] = await tx
    .select({ projectId: projects.id, projectName: projects.name, clientId: clients.id, clientName: clients.name })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(eq(projects.id, item.projectId!));
  return {
    item,
    context: "project",
    brandId: null,
    projectId: p.projectId,
    clientId: p.clientId,
    where: `${p.clientName} · ${p.projectName}`,
  };
}

export async function loadStages(tx: Tx, itemId: string): Promise<Stage[]> {
  return tx.select().from(stages).where(eq(stages.itemId, itemId)).orderBy(asc(stages.position));
}

async function userName(tx: Tx, id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const [u] = await tx.select({ name: users.name }).from(users).where(eq(users.id, id));
  return u?.name ?? null;
}

function refs(ctx: ItemCtx) {
  return { itemId: ctx.item.id, brandId: ctx.brandId, projectId: ctx.projectId, clientId: ctx.clientId };
}

function ensureOpen(ctx: ItemCtx) {
  if (ctx.item.cancelledAt) throw new UserError("This item is cancelled. Restore it first.");
}

async function stageWithItem(tx: Tx, stageId: string) {
  const [s] = await tx.select({ itemId: stages.itemId }).from(stages).where(eq(stages.id, stageId));
  if (!s) throw new UserError("Stage not found.");
  const ctx = await loadItemCtx(tx, s.itemId);
  const all = await loadStages(tx, s.itemId);
  const stage = all.find((x) => x.id === stageId)!;
  return { ctx, all, stage };
}

/* ------------------------------------------------------------------ */
/* Completing a stage (automatic hand-off + deadline propagation)       */
/* ------------------------------------------------------------------ */

export type CompleteResult = { next: StageKind | null; lateDays: number; shifted: number; itemDone: boolean };

/**
 * Core hand-off. Assumes the item row is locked and `stage` is active.
 * Records who/when, measures lateness, protects downstream deadlines, activates the next stage.
 */
export async function completeStageTx(
  tx: Tx,
  actor: Actor,
  ctx: ItemCtx,
  all: Stage[],
  stage: Stage,
  now: Date,
): Promise<CompleteResult> {
  assert(stage.status === "active", `${STAGE_META[stage.kind].label} is not the current stage.`);
  const label = STAGE_META[stage.kind].label;
  const completedDay = cairoDate(now);
  const lateDays = lateDaysFor(completedDay, stage.deadline);

  await tx
    .update(stages)
    .set({ status: "done", completedAt: now, completedById: actor.id })
    .where(eq(stages.id, stage.id));

  await tx.insert(stageCompletions).values({
    stageId: stage.id,
    itemId: ctx.item.id,
    kind: stage.kind,
    creditedUserId: stage.assigneeId ?? actor.id,
    completedById: actor.id,
    completedAt: now,
    deadline: stage.deadline,
    lateDays,
    round: stage.round,
    excused: !!stage.lateExcusedAt,
    excusedById: stage.lateExcusedById,
    excusedAt: stage.lateExcusedAt,
  });

  // Protect downstream people: push their deadlines by the delay this stage caused (once).
  const shift = downstreamShift(lateDays, stage.propagatedDelayDays);
  let shifted = 0;
  if (shift > 0) {
    const reason = `Shifted by ${plural(shift, "day")} because ${label} was delivered late.`;
    for (const ds of all.filter((s) => s.position > stage.position && s.status !== "done" && s.deadline)) {
      const nd = shiftedDeadline(ds.deadline!, shift);
      await tx
        .update(stages)
        .set({
          deadline: nd,
          originalDeadline: ds.originalDeadline ?? ds.deadline,
          shiftDays: ds.shiftDays + shift,
          shiftReason: reason,
        })
        .where(eq(stages.id, ds.id));
      await logActivity(tx, actor, {
        ...refs(ctx),
        action: "deadline_shifted",
        stageKind: ds.kind,
        field: "deadline",
        oldValue: ds.deadline,
        newValue: nd,
        summary: `${STAGE_META[ds.kind].label} deadline moved ${formatDay(ds.deadline)} → ${formatDay(nd)}. ${reason}`,
        meta: { shiftDays: shift, sourceStage: stage.kind, automatic: true },
        at: now,
      });
      shifted++;
    }
    await tx.update(stages).set({ propagatedDelayDays: lateDays }).where(eq(stages.id, stage.id));
  }

  const next = all.find((s) => s.position > stage.position) ?? null;
  const credited = stage.assigneeId && stage.assigneeId !== actor.id ? await userName(tx, stage.assigneeId) : null;
  const lateNote = lateDays > 0 ? ` · ${plural(lateDays, "day")} late${stage.lateExcusedAt ? " (exception)" : ""}` : "";
  const onBehalf = credited ? ` for ${credited}` : "";

  if (next) {
    await tx.update(stages).set({ status: "active", activatedAt: now }).where(eq(stages.id, next.id));
    await logActivity(tx, actor, {
      ...refs(ctx),
      action: "stage_completed",
      stageKind: stage.kind,
      summary: `${actor.name} completed ${label}${onBehalf}${lateNote} → ${STAGE_META[next.kind].label} is now current.`,
      meta: { lateDays, round: stage.round, next: next.kind },
      at: now,
    });
    return { next: next.kind, lateDays, shifted, itemDone: false };
  }

  await tx.update(contentItems).set({ completedAt: now }).where(eq(contentItems.id, ctx.item.id));
  await logActivity(tx, actor, {
    ...refs(ctx),
    action: "stage_completed",
    stageKind: stage.kind,
    summary: `${actor.name} completed ${label}${onBehalf}${lateNote} → item is ${finalLabel(ctx.context)}.`,
    meta: { lateDays, round: stage.round, next: null },
    at: now,
  });
  return { next: null, lateDays, shifted, itemDone: true };
}

export async function setDriveUrlTx(tx: Tx, actor: Actor, ctx: ItemCtx, url: string | null, at: Date) {
  const clean = normalizeUrl(url);
  if ((ctx.item.driveUrl ?? null) === clean) return;
  await tx.update(contentItems).set({ driveUrl: clean }).where(eq(contentItems.id, ctx.item.id));
  await logActivity(tx, actor, {
    ...refs(ctx),
    action: "drive_link_changed",
    field: "driveUrl",
    oldValue: ctx.item.driveUrl,
    newValue: clean,
    summary: clean
      ? `${actor.name} ${ctx.item.driveUrl ? "changed" : "added"} the Drive link.`
      : `${actor.name} removed the Drive link.`,
    at,
  });
  ctx.item.driveUrl = clean;
}

export async function completeStage(
  actor: Actor,
  stageId: string,
  opts: { driveUrl?: string | null; now?: Date } = {},
): Promise<CompleteResult> {
  return db.transaction(async (tx) => {
    const now = opts.now ?? new Date();
    const { ctx, all, stage } = await stageWithItem(tx, stageId);
    ensureOpen(ctx);
    if (opts.driveUrl !== undefined && opts.driveUrl !== null && opts.driveUrl.trim() !== "") {
      await setDriveUrlTx(tx, actor, ctx, opts.driveUrl, now);
    }
    if (STAGE_META[stage.kind].needsDriveLink && !ctx.item.driveUrl) {
      throw new UserError("Add the Google Drive link to the final file before submitting.");
    }
    if (stage.kind === "social") {
      const rows = await tx.select().from(itemPlatforms).where(eq(itemPlatforms.itemId, ctx.item.id));
      const open = rows.filter((r) => PLATFORM_STATUS_META[r.status].targeted && r.status !== "published");
      if (open.length) {
        throw new UserError("Some platforms are still pending or scheduled. Mark each one Published or Cancelled.");
      }
    }
    return completeStageTx(tx, actor, ctx, all, stage, now);
  });
}

/* ------------------------------------------------------------------ */
/* Returning work to an earlier stage                                   */
/* ------------------------------------------------------------------ */

export async function returnToStage(
  actor: Actor,
  itemId: string,
  target: StageKind,
  note?: string | null,
  opts: { now?: Date } = {},
) {
  return db.transaction(async (tx) => {
    const now = opts.now ?? new Date();
    const ctx = await loadItemCtx(tx, itemId);
    ensureOpen(ctx);
    const all = await loadStages(tx, itemId);
    assert(canReturnTo(all, target), "Work can only be returned to an earlier stage.");
    const t = all.find((s) => s.kind === target)!;
    const from = currentStage(all);
    const cleanNote = note?.trim() || null;

    for (const s of all.filter((x) => x.position >= t.position)) {
      if (s.id === t.id) {
        await tx
          .update(stages)
          .set({
            status: "active",
            activatedAt: now,
            round: s.round + 1,
            completedAt: null,
            completedById: null,
            returnedAt: now,
            returnedById: actor.id,
            returnNote: cleanNote,
            lateExcusedAt: null,
            lateExcusedById: null,
          })
          .where(eq(stages.id, s.id));
      } else if (s.status !== "waiting") {
        await tx
          .update(stages)
          .set({ status: "waiting", activatedAt: null, completedAt: null, completedById: null })
          .where(eq(stages.id, s.id));
      }
    }
    if (ctx.item.completedAt) {
      await tx.update(contentItems).set({ completedAt: null }).where(eq(contentItems.id, itemId));
    }
    const fromLabel = from ? STAGE_META[from.kind].label : finalLabel(ctx.context);
    const toLabel = STAGE_META[target].label;
    if (cleanNote) {
      await tx.insert(comments).values({ itemId, authorId: actor.id, body: cleanNote, tag: `Returned to ${toLabel}`, createdAt: now });
    }
    await logActivity(tx, actor, {
      ...refs(ctx),
      action: "stage_returned",
      stageKind: target,
      field: "stage",
      oldValue: from?.kind ?? "done",
      newValue: target,
      summary: `${actor.name} returned the work from ${fromLabel} to ${toLabel}${cleanNote ? `: “${truncate(cleanNote, 140)}”` : "."}`,
      meta: { note: cleanNote },
      at: now,
    });
  });
}

/* ------------------------------------------------------------------ */
/* Assignment, deadlines, exceptions                                    */
/* ------------------------------------------------------------------ */

export async function assignStageTx(tx: Tx, actor: Actor, ctx: ItemCtx, stage: Stage, assigneeId: string | null) {
  if ((stage.assigneeId ?? null) === (assigneeId ?? null)) return false;
  if (assigneeId) {
    const [u] = await tx.select({ isActive: users.isActive }).from(users).where(eq(users.id, assigneeId));
    assert(u?.isActive, "That person is not an active team member.");
  }
  await tx.update(stages).set({ assigneeId }).where(eq(stages.id, stage.id));
  const [oldName, newName] = [await userName(tx, stage.assigneeId), await userName(tx, assigneeId)];
  const label = STAGE_META[stage.kind].label;
  await logActivity(tx, actor, {
    ...refs(ctx),
    action: "stage_assigned",
    stageKind: stage.kind,
    subjectUserId: assigneeId,
    field: "assignee",
    oldValue: oldName,
    newValue: newName,
    summary: newName
      ? `${actor.name} assigned ${label} to ${newName}${oldName ? ` (was ${oldName})` : ""}.`
      : `${actor.name} unassigned ${label}${oldName ? ` (was ${oldName})` : ""}.`,
  });
  return true;
}

export async function assignStage(actor: Actor, stageId: string, assigneeId: string | null) {
  return db.transaction(async (tx) => {
    const { ctx, stage } = await stageWithItem(tx, stageId);
    ensureOpen(ctx);
    return assignStageTx(tx, actor, ctx, stage, assigneeId);
  });
}

export async function setStageDeadlineTx(tx: Tx, actor: Actor, ctx: ItemCtx, stage: Stage, deadline: string | null) {
  if (deadline !== null) assert(isValidISODate(deadline), "Invalid date.");
  assert(stage.status !== "done", "This stage is already complete; its deadline is part of the record.");
  if ((stage.deadline ?? null) === deadline && stage.shiftDays === 0) return false;
  await tx
    .update(stages)
    .set({ deadline, originalDeadline: deadline, shiftDays: 0, shiftReason: null })
    .where(eq(stages.id, stage.id));
  const label = STAGE_META[stage.kind].label;
  await logActivity(tx, actor, {
    ...refs(ctx),
    action: "deadline_changed",
    stageKind: stage.kind,
    field: "deadline",
    oldValue: stage.deadline,
    newValue: deadline,
    summary: deadline
      ? `${actor.name} set the ${label} deadline to ${formatDay(deadline)}${stage.deadline ? ` (was ${formatDay(stage.deadline)})` : ""}.`
      : `${actor.name} removed the ${label} deadline${stage.deadline ? ` (was ${formatDay(stage.deadline)})` : ""}.`,
  });
  return true;
}

export async function setStageDeadline(actor: Actor, stageId: string, deadline: string | null) {
  return db.transaction(async (tx) => {
    const { ctx, stage } = await stageWithItem(tx, stageId);
    ensureOpen(ctx);
    return setStageDeadlineTx(tx, actor, ctx, stage, deadline);
  });
}

/**
 * Mark a missed deadline as a legitimate exception (or undo it).
 * Downstream deadlines still move — the exception only affects accountability.
 */
export async function setLateException(actor: Actor, stageId: string, excused: boolean, opts: { now?: Date } = {}) {
  return db.transaction(async (tx) => {
    const now = opts.now ?? new Date();
    const { ctx, stage } = await stageWithItem(tx, stageId);
    assert(stage.deadline, "This stage has no deadline.");
    if (!!stage.lateExcusedAt === excused) return false;
    await tx
      .update(stages)
      .set(excused ? { lateExcusedAt: now, lateExcusedById: actor.id } : { lateExcusedAt: null, lateExcusedById: null })
      .where(eq(stages.id, stage.id));
    if (stage.status === "done") {
      const [last] = await tx
        .select({ id: stageCompletions.id })
        .from(stageCompletions)
        .where(eq(stageCompletions.stageId, stage.id))
        .orderBy(desc(stageCompletions.completedAt))
        .limit(1);
      if (last) {
        await tx
          .update(stageCompletions)
          .set(excused ? { excused: true, excusedById: actor.id, excusedAt: now } : { excused: false, excusedById: null, excusedAt: null })
          .where(eq(stageCompletions.id, last.id));
      }
    }
    const label = STAGE_META[stage.kind].label;
    const who = await userName(tx, stage.assigneeId ?? stage.completedById);
    await logActivity(tx, actor, {
      ...refs(ctx),
      action: excused ? "deadline_exception_applied" : "deadline_exception_removed",
      stageKind: stage.kind,
      subjectUserId: stage.assigneeId,
      summary: excused
        ? `${actor.name} marked the missed ${label} deadline as an exception${who ? ` for ${who}` : ""} — it won't count as late.`
        : `${actor.name} removed the deadline exception on ${label}.`,
      at: now,
    });
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* Social platforms                                                      */
/* ------------------------------------------------------------------ */

export type PlatformPatch = {
  status?: PlatformStatus;
  date?: string | null;
  time?: string | null;
  liveUrl?: string | null;
};

export async function setPlatformState(
  actor: Actor,
  itemId: string,
  platformId: string,
  patch: PlatformPatch,
  opts: { now?: Date } = {},
) {
  return db.transaction(async (tx) => {
    const now = opts.now ?? new Date();
    const ctx = await loadItemCtx(tx, itemId);
    ensureOpen(ctx);
    assert(ctx.context === "plan", "Platform publishing only applies to monthly brand content.");
    const [platform] = await tx.select().from(platforms).where(eq(platforms.id, platformId));
    assert(platform, "Platform not found.");
    const all = await loadStages(tx, itemId);
    const social = all.find((s) => s.kind === "social");
    const [existing] = await tx
      .select()
      .from(itemPlatforms)
      .where(and(eq(itemPlatforms.itemId, itemId), eq(itemPlatforms.platformId, platformId)));
    const before = existing ?? { status: "not_planned" as PlatformStatus, date: null, time: null, liveUrl: null };
    if (!existing) assert(platform.isActive, `${platform.name} is no longer an active platform.`);

    const next = {
      status: patch.status ?? before.status,
      date: patch.date !== undefined ? patch.date || null : before.date,
      time: patch.time !== undefined ? patch.time || null : before.time,
      liveUrl: patch.liveUrl !== undefined ? normalizeUrl(patch.liveUrl) : before.liveUrl,
    };
    if (next.date) assert(isValidISODate(next.date), "Invalid date.");
    if (next.time) assert(isValidTime(next.time), "Time must look like 14:30.");
    if (next.status === "scheduled" || next.status === "published") {
      assert(
        social && social.status !== "waiting",
        `The asset isn't ready for Social Media yet — ${STAGE_META[currentStage(all)?.kind ?? "content"].label} hasn't delivered.`,
      );
    }
    if (next.status === "published" && !next.date && before.status !== "published") next.date = cairoDate(now);

    const changes: string[] = [];
    if (next.status !== before.status) changes.push(`marked ${platform.name} as ${PLATFORM_STATUS_META[next.status].label}`);
    if (next.date !== before.date || next.time !== before.time) {
      if (next.date) changes.push(`set ${platform.name} date to ${formatDay(next.date)}${next.time ? ` ${next.time}` : ""}`);
      else if (before.date) changes.push(`cleared the ${platform.name} date`);
    }
    if (next.liveUrl !== before.liveUrl) {
      changes.push(next.liveUrl ? `${before.liveUrl ? "changed" : "added"} the ${platform.name} live link` : `removed the ${platform.name} live link`);
    }
    if (!changes.length) return false;

    await tx
      .insert(itemPlatforms)
      .values({ itemId, platformId, ...next, updatedAt: now, updatedById: actor.id })
      .onConflictDoUpdate({
        target: [itemPlatforms.itemId, itemPlatforms.platformId],
        set: { ...next, updatedAt: now, updatedById: actor.id },
      });
    await logActivity(tx, actor, {
      ...refs(ctx),
      action: "platform_updated",
      stageKind: "social",
      field: platform.slug,
      oldValue: before.status,
      newValue: next.status,
      summary: `${actor.name} ${joinWords(changes)}.`,
      meta: { platform: platform.name, before, after: next },
      at: now,
    });

    // Social work completes (or re-opens) by itself based on platform states.
    if (social) {
      const rows = await tx.select().from(itemPlatforms).where(eq(itemPlatforms.itemId, itemId));
      const complete = socialComplete(rows);
      if (social.status === "active" && complete) {
        await completeStageTx(tx, actor, ctx, all, social, now);
      } else if (social.status === "done" && !complete && rows.some((r) => PLATFORM_STATUS_META[r.status].targeted)) {
        await tx.update(stages).set({ status: "active", completedAt: null, completedById: null }).where(eq(stages.id, social.id));
        await tx.update(contentItems).set({ completedAt: null }).where(eq(contentItems.id, itemId));
        await logActivity(tx, actor, {
          ...refs(ctx),
          action: "stage_reopened",
          stageKind: "social",
          summary: `Social Media reopened because ${platform.name} is no longer published.`,
          at: now,
        });
      }
    }
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* Utilities                                                            */
/* ------------------------------------------------------------------ */

export function normalizeUrl(url: string | null | undefined): string | null {
  const v = url?.trim();
  if (!v) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes(".")) throw new Error();
    return u.toString();
  } catch {
    throw new UserError(`“${truncate(v, 60)}” doesn't look like a link.`);
  }
}

export function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function joinWords(parts: string[]) {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

