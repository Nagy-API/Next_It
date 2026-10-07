/**
 * Workflow transitions. Every function:
 *  - runs in one transaction and locks the content item row (no double completions),
 *  - derives timestamps / completing user / next stage automatically,
 *  - writes immutable activity records for everything it changes.
 */
import { and, asc, desc, eq, inArray, max, sql } from "drizzle-orm";
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
  versions,
  type ContentItem,
  type PlatformStatus,
  type Stage,
  type StageProgress,
  type StageKind,
} from "@/db/schema";
import {
  PLATFORM_STATUS_META,
  STAGE_META,
  canReturnTo,
  currentStage,
  downstreamShift,
  finalLabel,
  handoffTargets,
  isReviewed,
  lateDaysFor,
  routeAfter,
  shiftedDeadline,
  socialComplete,
  type WorkContext,
} from "@/domain/workflow";
import { cairoDate, formatDay, isValidISODate, isValidTime, monthLabel, plural } from "@/lib/dates";
import { logActivity, type Actor } from "./activity";
import { UserError, assert } from "./errors";
import { NOT_ALLOWED, can } from "@/domain/permissions";
import { notify, soleTeamMember, stageAudience } from "./notify";

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
  /** The month's Canva presentation, if the content team added one. */
  planCanvaUrl: string | null;
};

export async function loadItemCtx(tx: Tx, itemId: string, lock = true): Promise<ItemCtx> {
  const q = tx.select().from(contentItems).where(eq(contentItems.id, itemId));
  const [item] = lock ? await q.for("update") : await q;
  if (!item) throw new UserError("Content item not found.");
  if (item.planId) {
    const [p] = await tx
      .select({ brandId: brands.id, brandName: brands.name, year: contentPlans.year, month: contentPlans.month, canvaUrl: contentPlans.canvaUrl })
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
      planCanvaUrl: p.canvaUrl,
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
    planCanvaUrl: null,
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

export type CompleteResult = { next: StageKind | null; nextAssignee?: string | null; lateDays: number; shifted: number; itemDone: boolean };

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
  opts: { quiet?: boolean; /** When the work was actually delivered (e.g. the approved version's upload time). */ deliveredAt?: Date } = {},
): Promise<CompleteResult> {
  assert(stage.status === "active", `${STAGE_META[stage.kind].label} is not the current stage.`);
  const label = STAGE_META[stage.kind].label;
  const completedDay = cairoDate(opts.deliveredAt ?? now);
  const lateDays = lateDaysFor(completedDay, stage.deadline);

  // Whoever finishes an unassigned step gets it (and the credit) automatically.
  if (!stage.assigneeId) stage = { ...stage, assigneeId: actor.id };
  await tx
    .update(stages)
    .set({ status: "done", completedAt: now, completedById: actor.id, assigneeId: stage.assigneeId })
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
    await tx.update(stages).set({ status: "active", activatedAt: now, progress: "not_started", progressAt: null }).where(eq(stages.id, next.id));
    if (!opts.quiet) await notify(tx, actor, await stageAudience(tx, next.kind, next.assigneeId), {
      kind: "new_task",
      title: `New task: ${ctx.item.title}`,
      body: `${STAGE_META[next.kind].label} · ${ctx.where} · from ${actor.name}`,
      itemId: ctx.item.id,
      at: now,
    });
    await logActivity(tx, actor, {
      ...refs(ctx),
      action: "stage_completed",
      stageKind: stage.kind,
      summary: `${actor.name} completed ${label}${onBehalf}${lateNote} → ${STAGE_META[next.kind].label} is now current.`,
      meta: { lateDays, round: stage.round, next: next.kind },
      at: now,
    });
    return { next: next.kind, nextAssignee: next.assigneeId ? await userName(tx, next.assigneeId) : null, lateDays, shifted, itemDone: false };
  }

  await tx.update(contentItems).set({ completedAt: now }).where(eq(contentItems.id, ctx.item.id));
  // Let the people who worked on it know it's out.
  await notify(
    tx,
    actor,
    all.filter((s) => s.id !== stage.id).map((s) => s.assigneeId ?? s.completedById),
    { kind: "finished", title: `${finalLabel(ctx.context)}: ${ctx.item.title}`, body: ctx.where, itemId: ctx.item.id, at: now },
  );
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

export async function setCanvaUrlTx(tx: Tx, actor: Actor, ctx: ItemCtx, url: string | null, at: Date) {
  const clean = normalizeUrl(url);
  if ((ctx.item.canvaUrl ?? null) === clean) return;
  await tx.update(contentItems).set({ canvaUrl: clean }).where(eq(contentItems.id, ctx.item.id));
  await logActivity(tx, actor, {
    ...refs(ctx),
    action: "item_updated",
    field: "canvaUrl",
    oldValue: ctx.item.canvaUrl,
    newValue: clean,
    summary: `${actor.name} ${clean ? (ctx.item.canvaUrl ? "changed" : "added") : "removed"} the Canva link.`,
    at,
  });
  ctx.item.canvaUrl = clean;
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
    assert(can.doStage(actor, stage), NOT_ALLOWED);
    if (opts.driveUrl !== undefined && opts.driveUrl !== null && opts.driveUrl.trim() !== "") {
      await setDriveUrlTx(tx, actor, ctx, opts.driveUrl, now);
    }
    if (STAGE_META[stage.kind].needsDriveLink && !ctx.item.driveUrl) {
      throw new UserError("Add the Google Drive link to the final file before submitting.");
    }
    if (isReviewed(stage.kind)) assert(can.review(actor), APPROVAL_NEEDED);
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
            progress: "adjusting",
            progressAt: now,
            lateExcusedAt: null,
            lateExcusedById: null,
          })
          .where(eq(stages.id, s.id));
      } else if (s.status !== "waiting") {
        await tx
          .update(stages)
          .set({ status: "waiting", activatedAt: null, completedAt: null, completedById: null, progress: "not_started", progressAt: null })
          .where(eq(stages.id, s.id));
      }
    }
    await notify(tx, actor, await stageAudience(tx, t.kind, t.assigneeId), {
      kind: "sent_back",
      title: `Sent back to you: ${ctx.item.title}`,
      body: `${actor.name}${cleanNote ? `: “${truncate(cleanNote, 120)}”` : " asked for changes"}`,
      itemId,
      at: now,
    });
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

export async function assignStageTx(tx: Tx, actor: Actor, ctx: ItemCtx, stage: Stage, assigneeId: string | null, opts: { quiet?: boolean } = {}) {
  if ((stage.assigneeId ?? null) === (assigneeId ?? null)) return false;
  if (assigneeId) {
    const [u] = await tx.select({ isActive: users.isActive }).from(users).where(eq(users.id, assigneeId));
    assert(u?.isActive, "That person is not an active team member.");
  }
  await tx.update(stages).set({ assigneeId }).where(eq(stages.id, stage.id));
  if (!opts.quiet && stage.status !== "done") {
    await notify(tx, actor, [assigneeId], {
      kind: "assigned",
      title: stage.status === "active" ? `New task: ${ctx.item.title}` : `Coming up for you: ${ctx.item.title}`,
      body: `${STAGE_META[stage.kind].label} · ${ctx.where} · assigned by ${actor.name}`,
      itemId: ctx.item.id,
    });
  }
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
    // Anyone who can do a step may take it themselves; choosing someone else is for that team or managers.
    const claiming = assigneeId === actor.id && can.doStage(actor, { kind: stage.kind });
    assert(claiming || can.assign(actor, stage), NOT_ALLOWED);
    return assignStageTx(tx, actor, ctx, stage, assigneeId);
  });
}

export async function setStageDeadlineTx(tx: Tx, actor: Actor, ctx: ItemCtx, stage: Stage, deadline: string | null) {
  if (deadline !== null) assert(isValidISODate(deadline), "Invalid date.");
  assert(stage.status !== "done", "This stage is already complete; its deadline is part of the record.");
  if ((stage.deadline ?? null) === deadline && stage.shiftDays === 0) return false;
  // Once a deadline is set it is a commitment: only an admin can change or remove it.
  // (Automatic shifts for late upstream work still happen — they don't go through here.)
  if (stage.deadline && !actor.isAdmin) {
    throw new UserError(`The ${STAGE_META[stage.kind].label} deadline is already set (${formatDay(stage.deadline)}). Only an admin can change it.`);
  }
  await tx
    .update(stages)
    .set({ deadline, originalDeadline: deadline, shiftDays: 0, shiftReason: null })
    .where(eq(stages.id, stage.id));
  if (deadline) {
    await notify(tx, actor, await stageAudience(tx, stage.kind, stage.assigneeId), {
      kind: "deadline",
      title: `Deadline ${formatDay(deadline)}: ${ctx.item.title}`,
      body: `${STAGE_META[stage.kind].label} · set by ${actor.name}`,
      itemId: ctx.item.id,
    });
  }
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
    assert(can.setDeadline(actor) || can.changeDeadline(actor), NOT_ALLOWED);
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
    assert(can.excuseLateness(actor), "Only an admin can mark a missed deadline as an exception.");
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
    assert(can.publish(actor), "Only the Social Media team can change publishing.");
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

    // Automatic statuses: pasting the live link means it's published; picking a date means it's scheduled.
    let autoStatus: PlatformStatus | undefined;
    if (!patch.status && patch.liveUrl?.trim() && before.status !== "published") autoStatus = "published";
    else if (!patch.status && patch.date && (before.status === "pending" || before.status === "not_planned")) autoStatus = "scheduled";
    const next = {
      status: patch.status ?? autoStatus ?? before.status,
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


/* ------------------------------------------------------------------ */
/* Hand-off: finish my part and choose where it goes next                */
/* ------------------------------------------------------------------ */

/**
 * Make the stages after `from` follow the chosen team. Only possible while those stages
 * haven't been worked on yet (otherwise the work should be sent back instead).
 */
async function rerouteTx(tx: Tx, ctx: ItemCtx, all: Stage[], from: Stage, target: StageKind): Promise<Stage[]> {
  const later = all.filter((s) => s.position > from.position);
  const wanted = routeAfter(target, ctx.context);
  if (later.map((s) => s.kind).join() === wanted.join()) return all;
  const removed = later.filter((s) => !wanted.includes(s.kind));
  if (removed.length) {
    const worked = await tx
      .select({ id: stageCompletions.id })
      .from(stageCompletions)
      .where(inArray(stageCompletions.stageId, removed.map((s) => s.id)))
      .limit(1);
    assert(!worked.length && removed.every((s) => s.status === "waiting"), `This item already went through ${STAGE_META[removed[0].kind].label}. Send it back there instead.`);
    for (const s of removed) await tx.delete(stages).where(eq(stages.id, s.id));
  }
  for (const [i, kind] of wanted.entries()) {
    const position = from.position + 1 + i;
    const existing = later.find((s) => s.kind === kind);
    if (existing) await tx.update(stages).set({ position }).where(eq(stages.id, existing.id));
    else await tx.insert(stages).values({ itemId: ctx.item.id, kind, position, status: "waiting", assigneeId: await defaultAssigneeTx(tx, ctx.brandId, kind) });
  }
  return loadStages(tx, ctx.item.id);
}

/** Brand default for this team (Settings → Brands), else the team's only member, else nobody (whole team sees it). */
export async function defaultAssigneeTx(tx: Tx, brandId: string | null, kind: StageKind): Promise<string | null> {
  if (brandId) {
    const [b] = await tx.select().from(brands).where(eq(brands.id, brandId));
    const byKind: Partial<Record<StageKind, string | null>> = {
      content: b?.defaultCreatorId,
      shooting: b?.defaultShootId,
      media: b?.defaultMediaId,
      design: b?.defaultDesignId,
      social: b?.defaultSocialId,
    };
    const id = byKind[kind];
    if (id) {
      const [u] = await tx.select({ isActive: users.isActive }).from(users).where(eq(users.id, id));
      if (u?.isActive) return id;
    }
  }
  return soleTeamMember(tx, kind);
}

export type HandOffInput = {
  /** Where the work goes next (defaults to the current route). */
  target?: StageKind;
  /** A specific person in the next team — otherwise the whole team sees it and someone picks it up. */
  assigneeId?: string | null;
  /** Deadline for the next team (only if it doesn't have one yet). */
  deadline?: string | null;
  driveUrl?: string | null;
  canvaUrl?: string | null;
  now?: Date;
};

export async function handOff(actor: Actor, stageId: string, input: HandOffInput = {}): Promise<CompleteResult> {
  return db.transaction(async (tx) => {
    const now = input.now ?? new Date();
    const loaded = await stageWithItem(tx, stageId);
    const { ctx, stage } = loaded;
    let all = loaded.all;
    ensureOpen(ctx);
    assert(stage.status === "active", `${STAGE_META[stage.kind].label} is not the current step.`);
    assert(can.doStage(actor, stage), NOT_ALLOWED);
    if (input.canvaUrl?.trim() && stage.kind === "content") await setCanvaUrlTx(tx, actor, ctx, input.canvaUrl, now);
    if (stage.kind === "content" && !ctx.item.canvaUrl && !ctx.planCanvaUrl) {
      throw new UserError("Add the Canva link first (this slide's link, or the month's Canva link on the brand page) — that's what the next team works from.");
    }
    if (input.driveUrl?.trim()) await setDriveUrlTx(tx, actor, ctx, input.driveUrl, now);
    if (STAGE_META[stage.kind].needsDriveLink && !ctx.item.driveUrl) {
      throw new UserError("Add the Google Drive link to the final file before sending it on.");
    }
    if (isReviewed(stage.kind)) assert(can.review(actor), APPROVAL_NEEDED);
    if (input.target) {
      assert(handoffTargets(stage.kind, ctx.context).includes(input.target), "That team can't receive this work from here.");
      all = await rerouteTx(tx, ctx, all, stage, input.target);
    }
    // The person chosen for the next step is set first so the "new task" notification goes to them.
    const me = all.find((s) => s.id === stage.id)!;
    const upcoming = all.find((s) => s.position > me.position);
    if (input.assigneeId) assert(can.assign(actor), "Only managers choose the person — it goes to the default person or team.");
    if (upcoming && input.assigneeId) {
      await assignStageTx(tx, actor, ctx, upcoming, input.assigneeId, { quiet: true });
      all = await loadStages(tx, ctx.item.id);
    }
    const result = await completeStageTx(tx, actor, ctx, all, all.find((s) => s.id === stage.id)!, now);
    // The deadline for the next team is applied after the hand-off, so an upstream delay
    // never shifts a deadline that was just chosen with today's date in mind.
    if (result.next && input.deadline) {
      assert(can.setDeadline(actor), "Only managers can set deadlines.");
      const next = (await loadStages(tx, ctx.item.id)).find((s) => s.kind === result.next)!;
      if (!next.deadline) await setStageDeadlineTx(tx, actor, ctx, next, input.deadline);
    }
    return result;
  });
}

/* ------------------------------------------------------------------ */
/* Progress of the current step (same statuses as the old tracker)       */
/* ------------------------------------------------------------------ */

export const PROGRESS_LABEL: Record<StageProgress, string> = {
  not_started: "Not started",
  processing: "Processing",
  adjusting: "Adjusting",
  waiting_approval: "Waiting approval",
};

export async function setStageProgress(actor: Actor, stageId: string, progress: StageProgress, opts: { now?: Date } = {}) {
  return db.transaction(async (tx) => {
    const now = opts.now ?? new Date();
    const { ctx, stage } = await stageWithItem(tx, stageId);
    ensureOpen(ctx);
    assert(stage.status === "active", "You can only update the step that's in progress.");
    assert(can.doStage(actor, stage), NOT_ALLOWED);
    assert(PROGRESS_LABEL[progress], "Unknown status.");
    if (stage.progress === progress) return false;
    // Starting work on an unclaimed step claims it.
    const assigneeId = stage.assigneeId ?? (progress !== "not_started" ? actor.id : null);
    await tx.update(stages).set({ progress, progressAt: now, assigneeId }).where(eq(stages.id, stage.id));
    await logActivity(tx, actor, {
      ...refs(ctx),
      action: "stage_progress",
      stageKind: stage.kind,
      field: "progress",
      oldValue: stage.progress,
      newValue: progress,
      summary: `${actor.name} set ${STAGE_META[stage.kind].label} to “${PROGRESS_LABEL[progress]}”.`,
      at: now,
    });
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* Versions: editors / designers send v1, v2… for approval               */
/* ------------------------------------------------------------------ */

const APPROVAL_NEEDED = "Send it as a version for approval — the content creator approves it.";

/**
 * Who is asked to review a version: the item's content creator (or project owner), else the brand's default
 * content creator (extra tasks that start after Content), else the whole Content team.
 */
async function reviewersFor(tx: Tx, ctx: ItemCtx, all: Stage[]): Promise<string[]> {
  const content = all.find((s) => s.kind === "content");
  const ids = [content?.assigneeId ?? content?.completedById];
  if (ctx.projectId) {
    const [p] = await tx.select({ ownerId: projects.ownerId }).from(projects).where(eq(projects.id, ctx.projectId));
    ids.push(p?.ownerId);
  }
  if (!ids.some(Boolean) && ctx.brandId) {
    const [b] = await tx.select({ creator: brands.defaultCreatorId }).from(brands).where(eq(brands.id, ctx.brandId));
    ids.push(b?.creator);
  }
  const people = ids.filter((x): x is string => !!x);
  if (people.length) return people;
  const team = await tx.select({ id: users.id }).from(users).where(and(eq(users.isActive, true), sql`'content' = any(${users.teams})`));
  return team.map((m) => m.id);
}

export async function submitVersion(actor: Actor, stageId: string, input: { url: string; note?: string | null; now?: Date }) {
  return db.transaction(async (tx) => {
    const now = input.now ?? new Date();
    const { ctx, all, stage } = await stageWithItem(tx, stageId);
    ensureOpen(ctx);
    assert(stage.status === "active", `${STAGE_META[stage.kind].label} is not the current step.`);
    assert(isReviewed(stage.kind), "This step doesn't have versions.");
    assert(can.doStage(actor, stage), NOT_ALLOWED);
    const url = normalizeUrl(input.url);
    assert(url, "Paste the Google Drive link to this version.");
    const [{ n }] = await tx.select({ n: max(versions.number) }).from(versions).where(eq(versions.stageId, stage.id));
    const number = (n ?? 0) + 1;
    await tx
      .update(versions)
      .set({ status: "replaced" })
      .where(and(eq(versions.stageId, stage.id), eq(versions.status, "pending")));
    const note = input.note?.trim() || null;
    const [v] = await tx
      .insert(versions)
      .values({ itemId: ctx.item.id, stageId: stage.id, kind: stage.kind, number, url, note, submittedById: actor.id, submittedAt: now })
      .returning();
    await setDriveUrlTx(tx, actor, ctx, url, now);
    await tx
      .update(stages)
      .set({ progress: "waiting_approval", progressAt: now, assigneeId: stage.assigneeId ?? actor.id })
      .where(eq(stages.id, stage.id));
    await notify(tx, actor, await reviewersFor(tx, ctx, all), {
      kind: "review",
      title: `v${number} ready to approve: ${ctx.item.title}`,
      body: `${STAGE_META[stage.kind].label} · ${ctx.where} · from ${actor.name}${note ? ` — “${truncate(note, 80)}”` : ""}`,
      itemId: ctx.item.id,
      at: now,
    });
    await logActivity(tx, actor, {
      ...refs(ctx),
      action: "version_submitted",
      stageKind: stage.kind,
      field: "version",
      newValue: `v${number}`,
      summary: `${actor.name} sent v${number} of ${STAGE_META[stage.kind].label} for approval.`,
      meta: { url, note },
      at: now,
    });
    return v;
  });
}

/** Approve a version (the step finishes and goes on) or ask for changes (a new version opens). */
export async function reviewVersion(actor: Actor, versionId: string, input: { approve: boolean; note?: string | null; now?: Date }) {
  return db.transaction(async (tx) => {
    const now = input.now ?? new Date();
    const [v] = await tx.select().from(versions).where(eq(versions.id, versionId));
    assert(v, "Version not found.");
    const { ctx, all, stage } = await stageWithItem(tx, v.stageId);
    ensureOpen(ctx);
    assert(can.review(actor), "Only the Content creators approve versions.");
    assert(v.status === "pending", `v${v.number} was already ${v.status === "approved" ? "approved" : v.status === "changes" ? "sent back for changes" : "replaced by a newer version"}.`);
    assert(stage.status === "active", `${STAGE_META[stage.kind].label} is not the current step.`);
    const note = input.note?.trim() || null;
    if (!input.approve) assert(note, "Write what needs to change.");
    await tx
      .update(versions)
      .set({ status: input.approve ? "approved" : "changes", reviewedById: actor.id, reviewedAt: now, reviewNote: note })
      .where(eq(versions.id, v.id));
    const label = STAGE_META[stage.kind].label;
    await logActivity(tx, actor, {
      ...refs(ctx),
      action: input.approve ? "version_approved" : "version_changes",
      stageKind: stage.kind,
      field: "version",
      newValue: `v${v.number}`,
      summary: input.approve
        ? `${actor.name} approved v${v.number} of ${label}.`
        : `${actor.name} asked for changes on v${v.number} of ${label}: “${truncate(note!, 140)}”`,
      at: now,
    });
    if (note) {
      await tx.insert(comments).values({
        itemId: ctx.item.id,
        authorId: actor.id,
        body: note,
        tag: `v${v.number} · ${input.approve ? "approved" : "changes requested"}`,
        mentionUserId: input.approve ? null : v.submittedById,
        createdAt: now,
      });
    }
    if (!input.approve) {
      await tx.update(stages).set({ progress: "adjusting", progressAt: now }).where(eq(stages.id, stage.id));
      await notify(tx, actor, [stage.assigneeId ?? v.submittedById], {
        kind: "sent_back",
        title: `Changes on v${v.number}: ${ctx.item.title}`,
        body: `${actor.name}: “${truncate(note!, 120)}” — upload v${v.number + 1} when ready`,
        itemId: ctx.item.id,
        at: now,
      });
      return { approved: false as const, next: null };
    }
    await notify(tx, actor, [stage.assigneeId ?? v.submittedById], {
      kind: "approved",
      title: `v${v.number} approved: ${ctx.item.title}`,
      body: `${actor.name} approved it — it moved on automatically`,
      itemId: ctx.item.id,
      at: now,
    });
    const r = await completeStageTx(tx, actor, ctx, all, stage, now, { deliveredAt: v.submittedAt });
    return { approved: true as const, next: r.next, nextAssignee: r.nextAssignee ?? null };
  });
}

/* ------------------------------------------------------------------ */
/* Pre-production: when and how long the shoot is                        */
/* ------------------------------------------------------------------ */

export async function setShootDetails(
  actor: Actor,
  itemId: string,
  input: { shootDate?: string | null; shootTime?: string | null; shootDuration?: string | null; shootLocation?: string | null },
) {
  return db.transaction(async (tx) => {
    const ctx = await loadItemCtx(tx, itemId);
    ensureOpen(ctx);
    assert(can.planShoot(actor), NOT_ALLOWED);
    const next = {
      shootDate: input.shootDate !== undefined ? input.shootDate || null : ctx.item.shootDate,
      shootTime: input.shootTime !== undefined ? input.shootTime?.trim() || null : ctx.item.shootTime,
      shootDuration: input.shootDuration !== undefined ? input.shootDuration?.trim() || null : ctx.item.shootDuration,
      shootLocation: input.shootLocation !== undefined ? input.shootLocation?.trim() || null : ctx.item.shootLocation,
    };
    if (next.shootDate) assert(isValidISODate(next.shootDate), "Invalid shoot date.");
    if (next.shootTime) assert(isValidTime(next.shootTime), "Time must look like 14:30.");
    const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => next[k] !== ctx.item[k]);
    if (!changed.length) return false;
    await tx.update(contentItems).set(next).where(eq(contentItems.id, itemId));
    const parts = [
      next.shootDate ? `${formatDay(next.shootDate)}${next.shootTime ? ` ${next.shootTime}` : ""}` : null,
      next.shootDuration ? `for ${next.shootDuration}` : null,
      next.shootLocation ? `at ${next.shootLocation}` : null,
    ].filter(Boolean);
    const all = await loadStages(tx, itemId);
    const shoot = all.find((s) => s.kind === "shooting");
    // Planning the shoot means the step has started.
    if (shoot?.status === "active" && shoot.progress === "not_started" && next.shootDate) {
      await tx.update(stages).set({ progress: "processing", progressAt: new Date(), assigneeId: shoot.assigneeId ?? actor.id }).where(eq(stages.id, shoot.id));
    }
    const editor = all.find((s) => s.kind === "media");
    if (next.shootDate) {
      await notify(tx, actor, [shoot?.assigneeId, editor?.assigneeId], {
        kind: "deadline",
        title: `Shoot ${parts.join(" ")}: ${ctx.item.title}`,
        body: `${ctx.where} · planned by ${actor.name}`,
        itemId,
      });
    }
    await logActivity(tx, actor, {
      ...refs(ctx),
      action: "shoot_planned",
      stageKind: "shooting",
      summary: parts.length ? `${actor.name} planned the shoot: ${parts.join(" ")}.` : `${actor.name} cleared the shoot plan.`,
      meta: next,
    });
    return true;
  });
}
