import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import {
  brands,
  comments,
  contentItems,
  contentPlans,
  itemPlatforms,
  platforms,
  projects,
  clients,
  stageCompletions,
  stages,
  users,
  type ContentType,
  type StageKind,
} from "@/db/schema";
import { cleanPriority } from "@/domain/priority";
import { STAGE_META, TYPE_META, routeFor } from "@/domain/workflow";
import { cairoDate, formatDay, isValidISODate, isValidTime, monthLabel, monthOf, plural } from "@/lib/dates";
import { logActivity, type Actor } from "./activity";
import { UserError, assert } from "./errors";
import { NOT_ALLOWED, can, isManager } from "@/domain/permissions";
import { findMentions } from "./chat";
import { notify, stageAudience } from "./notify";
import {
  defaultAssigneeTx,
  assignStageTx,
  completeStageTx,
  loadItemCtx,
  loadStages,
  normalizeUrl,
  setDriveUrlTx,
  setStageDeadlineTx,
  stopItemTimeTx,
  truncate,
} from "./workflow";

export type NewItemRow = {
  title: string;
  type: ContentType;
  postingDate?: string | null;
  postingTime?: string | null;
  canvaUrl?: string | null;
  slideNumber?: number | null;
};

export type ItemTarget = { kind: "plan"; brandId: string; year: number; month: number } | { kind: "project"; projectId: string };

export async function ensurePlanTx(tx: Tx, actor: Actor | null, brandId: string, year: number, month: number): Promise<string> {
  assert(month >= 1 && month <= 12 && year > 2000 && year < 2200, "Invalid month.");
  const [existing] = await tx
    .select({ id: contentPlans.id })
    .from(contentPlans)
    .where(and(eq(contentPlans.brandId, brandId), eq(contentPlans.year, year), eq(contentPlans.month, month)));
  if (existing) return existing.id;
  const [brand] = await tx.select().from(brands).where(eq(brands.id, brandId));
  assert(brand, "Brand not found.");
  const [plan] = await tx.insert(contentPlans).values({ brandId, year, month, createdById: actor?.id ?? null }).returning({ id: contentPlans.id });
  await logActivity(tx, actor, {
    action: "plan_created",
    brandId,
    summary: actor
      ? `${actor.name} started the ${monthLabel(year, month)} content plan for ${brand.name}.`
      : `The ${monthLabel(year, month)} content plan for ${brand.name} was started.`,
  });
  return plan.id;
}

/**
 * The month at the top follows the posting date: an item dated in November lives in the November plan.
 * Its slide lives in the old month's Canva presentation, so that exact link is kept on the item.
 * Returns the new month's label when the item moved.
 */
export async function followPostingMonthTx(tx: Tx, actor: Actor | null, itemId: string, at = new Date()): Promise<string | null> {
  const [item] = await tx.select().from(contentItems).where(eq(contentItems.id, itemId));
  if (!item?.planId || !item.postingDate || !isValidISODate(item.postingDate)) return null;
  const [plan] = await tx.select().from(contentPlans).where(eq(contentPlans.id, item.planId));
  const { year, month } = monthOf(item.postingDate);
  if (!plan || (plan.year === year && plan.month === month)) return null;
  const planId = await ensurePlanTx(tx, actor, plan.brandId, year, month);
  const set: Partial<typeof contentItems.$inferInsert> = { planId };
  if (!item.canvaUrl && plan.canvaUrl) set.canvaUrl = item.slideNumber ? `${plan.canvaUrl.split("#")[0]}#${item.slideNumber}` : plan.canvaUrl;
  await tx.update(contentItems).set(set).where(eq(contentItems.id, itemId));
  const from = monthLabel(plan.year, plan.month);
  const to = monthLabel(year, month);
  await logActivity(tx, actor, {
    action: "item_updated",
    itemId,
    brandId: plan.brandId,
    field: "month",
    oldValue: from,
    newValue: to,
    summary: `“${item.title}” moved from ${from} to ${to} to match its posting date.`,
    at,
  });
  return to;
}

/**
 * Add one or many items at once. Stages are generated from the content type,
 * the first stage becomes current immediately, and the brand's default creator
 * is assigned to Content unless someone else is chosen.
 */
export async function createItems(
  actor: Actor,
  target: ItemTarget,
  rows: NewItemRow[],
  options: {
    contentAssigneeId?: string | null;
    platformIds?: string[];
    /** Mark every row's Content as delivered now. */
    contentReady?: boolean;
    /** Rows that already have their Canva slide link are delivered automatically. */
    sendWithCanva?: boolean;
    now?: Date;
  } = {},
): Promise<string[]> {
  assert(target.kind === "plan" ? can.editContent(actor) : can.manageProjects(actor), "Only the Content team can add content.");
  const clean = rows
    .map((r) => ({ ...r, title: r.title.trim() }))
    .filter((r) => r.title.length > 0);
  assert(clean.length > 0, "Add at least one item with a title.");
  assert(clean.length <= 200, "That's more than 200 items — split it into smaller batches.");
  for (const r of clean) {
    assert(TYPE_META[r.type], `Unknown content type for “${r.title}”.`);
    if (r.postingDate) assert(isValidISODate(r.postingDate), `Invalid posting date for “${r.title}”.`);
    if (r.postingTime) assert(isValidTime(r.postingTime), `Posting time for “${r.title}” must look like 19:00.`);
  }

  return db.transaction(async (tx) => {
    const now = options.now ?? new Date();
    let planId: string | null = null;
    let projectId: string | null = null;
    let defaultCreator: string | null = null;
    let where: string;
    let brandId: string | null = null;
    let clientId: string | null = null;

    if (target.kind === "plan") {
      const [brand] = await tx.select().from(brands).where(eq(brands.id, target.brandId));
      assert(brand, "Brand not found.");
      assert(brand.isActive, `${brand.name} is inactive. Reactivate it in Settings to add new work.`);
      planId = await ensurePlanTx(tx, actor, brand.id, target.year, target.month);
      defaultCreator = brand.defaultCreatorId;
      brandId = brand.id;
      where = `${brand.name} · ${monthLabel(target.year, target.month)}`;
    } else {
      const [p] = await tx
        .select({ id: projects.id, name: projects.name, clientName: clients.name, clientId: clients.id, ownerId: projects.ownerId })
        .from(projects)
        .innerJoin(clients, eq(clients.id, projects.clientId))
        .where(eq(projects.id, target.projectId));
      assert(p, "Project not found.");
      projectId = p.id;
      clientId = p.clientId;
      defaultCreator = p.ownerId;
      where = `${p.clientName} · ${p.name}`;
    }
    const contentAssignee = options.contentAssigneeId !== undefined ? options.contentAssigneeId : defaultCreator;
    // Default people per team for this brand (or the team's only member) — work goes straight to them.
    const defaults: Partial<Record<StageKind, string | null>> = { content: contentAssignee };
    for (const k of ["shooting", "media", "design", "social", "delivery"] as StageKind[]) defaults[k] = await defaultAssigneeTx(tx, brandId, k);
    // Each row lives in the plan of its posting month (dated 3 Nov while adding to October → November).
    // Slide numbers continue after the last one already in that month's Canva presentation.
    const nextSlide = new Map<string, number>();
    const planFor = async (r: NewItemRow): Promise<string | null> => {
      if (!planId || !brandId) return planId;
      if (!r.postingDate || target.kind !== "plan") return planId;
      const { year, month } = monthOf(r.postingDate);
      return year === target.year && month === target.month ? planId : ensurePlanTx(tx, actor, brandId, year, month);
    };
    const slideIn = async (pid: string) => {
      if (!nextSlide.has(pid)) {
        const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${contentItems.slideNumber}), 0)::int` }).from(contentItems).where(eq(contentItems.planId, pid));
        nextSlide.set(pid, max + 1);
      }
      const n = nextSlide.get(pid)!;
      nextSlide.set(pid, n + 1);
      return n;
    };
    const readyForTeam = new Map<string, number>();

    let platformIds: string[] = [];
    if (target.kind === "plan" && options.platformIds?.length) {
      const ps = await tx.select().from(platforms).where(inArray(platforms.id, options.platformIds));
      platformIds = ps.filter((p) => p.isActive).map((p) => p.id);
    }

    const ids: string[] = [];
    for (const r of clean) {
      const rowPlan = await planFor(r);
      const [item] = await tx
        .insert(contentItems)
        .values({
          title: r.title,
          type: r.type,
          planId: rowPlan,
          projectId,
          canvaUrl: normalizeUrl(r.canvaUrl),
          postingDate: r.postingDate || null,
          postingTime: r.postingTime || null,
          slideNumber: rowPlan ? (r.slideNumber ?? (await slideIn(rowPlan))) : (r.slideNumber ?? null),
          createdAt: now,
          createdById: actor.id,
        })
        .returning();
      ids.push(item.id);
      const route = routeFor(r.type, target.kind);
      await tx.insert(stages).values(
        route.map((kind, i) => ({
          itemId: item.id,
          kind,
          position: i,
          status: i === 0 ? ("active" as const) : ("waiting" as const),
          activatedAt: i === 0 ? now : null,
          assigneeId: defaults[kind] ?? null,
        })),
      );
      if (platformIds.length) {
        await tx.insert(itemPlatforms).values(platformIds.map((platformId) => ({ itemId: item.id, platformId, status: "pending" as const, updatedById: actor.id, updatedAt: now })));
      }
      await logActivity(tx, actor, {
        action: "item_created",
        itemId: item.id,
        brandId,
        projectId,
        clientId,
        summary: `${actor.name} added ${TYPE_META[r.type].label} “${r.title}” to ${where}.`,
        at: now,
      });
      if (options.contentReady || (options.sendWithCanva && item.canvaUrl)) {
        const ctx = await loadItemCtx(tx, item.id);
        const all = await loadStages(tx, item.id);
        const r2 = await completeStageTx(tx, actor, ctx, all, all[0], now, { quiet: true });
        const next = all.find((s) => s.kind === r2.next);
        if (next) {
          for (const u of await stageAudience(tx, next.kind, next.assigneeId)) readyForTeam.set(u, (readyForTeam.get(u) ?? 0) + 1);
        }
      } else if (contentAssignee) {
        readyForTeam.set(contentAssignee, (readyForTeam.get(contentAssignee) ?? 0) + 1);
      }
    }
    // One notification per person for the whole batch, not one per item.
    for (const [userId, n] of readyForTeam) {
      await notify(tx, actor, [userId], {
        kind: "new_task",
        title: n === 1 ? `New task in ${where}` : `${n} new tasks in ${where}`,
        body: `Added by ${actor.name}`,
        itemId: n === 1 ? ids[ids.length - 1] : null,
        at: now,
      });
    }
    return ids;
  });
}

/* ------------------------------------------------------------------ */
/* Editing an item                                                       */
/* ------------------------------------------------------------------ */

export type ItemPatch = {
  title?: string;
  type?: ContentType;
  canvaUrl?: string | null;
  driveUrl?: string | null;
  postingDate?: string | null;
  postingTime?: string | null;
  slideNumber?: number | null;
};

export async function updateItem(actor: Actor, itemId: string, patch: ItemPatch) {
  return db.transaction(async (tx) => {
    const ctx = await loadItemCtx(tx, itemId);
    const item = ctx.item;
    const base = { itemId, brandId: ctx.brandId, projectId: ctx.projectId, clientId: ctx.clientId };
    let changed = 0;
    const differs = (a: unknown, b: unknown) => a !== undefined && (a || null) !== (b || null);
    if (differs(patch.title?.trim(), item.title) || differs(patch.type, item.type) || differs(patch.canvaUrl && normalizeUrl(patch.canvaUrl), item.canvaUrl))
      assert(can.editContent(actor), "Only the Content team can change the content details.");
    if (differs(patch.postingDate, item.postingDate) || differs(patch.postingTime, item.postingTime)) assert(can.editPostingDate(actor), NOT_ALLOWED);
    if (differs(patch.driveUrl && normalizeUrl(patch.driveUrl), item.driveUrl)) {
      const all = await loadStages(tx, itemId);
      const production = all.find((s) => STAGE_META[s.kind].needsDriveLink);
      assert(!!actor.isAdmin || (production && can.doStage(actor, production)), "Only the team that made the file can change its Drive link.");
    }

    if (patch.title !== undefined) {
      const t = patch.title.trim();
      assert(t, "Title can't be empty.");
      if (t !== item.title) {
        await tx.update(contentItems).set({ title: t }).where(eq(contentItems.id, itemId));
        await logActivity(tx, actor, { ...base, action: "item_updated", field: "title", oldValue: item.title, newValue: t, summary: `${actor.name} renamed “${item.title}” to “${t}”.` });
        changed++;
      }
    }
    if (patch.canvaUrl !== undefined) {
      const v = normalizeUrl(patch.canvaUrl);
      if (v !== item.canvaUrl) {
        await tx.update(contentItems).set({ canvaUrl: v }).where(eq(contentItems.id, itemId));
        await logActivity(tx, actor, { ...base, action: "item_updated", field: "canvaUrl", oldValue: item.canvaUrl, newValue: v, summary: `${actor.name} ${v ? (item.canvaUrl ? "changed" : "added") : "removed"} the Canva link.` });
        changed++;
        // Adding the Canva slide is the moment content is delivered: record it and pass the work on.
        if (v && !item.canvaUrl && !item.cancelledAt) {
          const all = await loadStages(tx, itemId);
          const content = all.find((s) => s.kind === "content" && s.status === "active");
          if (content) await completeStageTx(tx, actor, { ...ctx, item: { ...item, canvaUrl: v } }, all, content, new Date());
        }
      }
    }
    if (patch.driveUrl !== undefined) {
      const before = item.driveUrl;
      await setDriveUrlTx(tx, actor, ctx, patch.driveUrl, new Date());
      if (before !== ctx.item.driveUrl) changed++;
    }
    if (patch.postingDate !== undefined) {
      const v = patch.postingDate || null;
      if (v) assert(isValidISODate(v), "Invalid posting date.");
      if (v !== item.postingDate) {
        await tx.update(contentItems).set({ postingDate: v }).where(eq(contentItems.id, itemId));
        await logActivity(tx, actor, { ...base, action: "item_updated", field: "postingDate", oldValue: item.postingDate, newValue: v, summary: `${actor.name} changed the posting date: ${formatDay(item.postingDate)} → ${formatDay(v)}.` });
        await followPostingMonthTx(tx, actor, itemId);
        changed++;
      }
    }
    if (patch.postingTime !== undefined) {
      const v = patch.postingTime || null;
      if (v) assert(isValidTime(v), "Posting time must look like 19:00.");
      if (v !== item.postingTime) {
        await tx.update(contentItems).set({ postingTime: v }).where(eq(contentItems.id, itemId));
        await logActivity(tx, actor, { ...base, action: "item_updated", field: "postingTime", oldValue: item.postingTime, newValue: v, summary: `${actor.name} changed the posting time: ${item.postingTime ?? "—"} → ${v ?? "—"}.` });
        changed++;
      }
    }
    if (patch.slideNumber !== undefined && (patch.slideNumber ?? null) !== item.slideNumber) {
      assert(can.editContent(actor), "Only the Content team can change the content details.");
      assert(patch.slideNumber === null || (Number.isInteger(patch.slideNumber) && patch.slideNumber > 0 && patch.slideNumber < 1000), "Slide number must be 1 or more.");
      await tx.update(contentItems).set({ slideNumber: patch.slideNumber }).where(eq(contentItems.id, itemId));
      await logActivity(tx, actor, { ...base, action: "item_updated", field: "slideNumber", oldValue: String(item.slideNumber ?? ""), newValue: String(patch.slideNumber ?? ""), summary: `${actor.name} set the Canva slide to ${patch.slideNumber ?? "none"}.` });
      changed++;
    }
    if (patch.type !== undefined && patch.type !== item.type) {
      await changeTypeTx(tx, actor, ctx, patch.type);
      changed++;
    }
    return changed;
  });
}

/** Changing the type changes the route, so it is only allowed before production has started. */
async function changeTypeTx(tx: Tx, actor: Actor, ctx: Awaited<ReturnType<typeof loadItemCtx>>, type: ContentType) {
  const all = await loadStages(tx, ctx.item.id);
  const later = all.filter((s) => s.kind !== "content");
  const laterIds = later.map((s) => s.id);
  const done = laterIds.length
    ? await tx.select({ id: stageCompletions.id }).from(stageCompletions).where(inArray(stageCompletions.stageId, laterIds)).limit(1)
    : [];
  assert(
    later.every((s) => s.status === "waiting") && done.length === 0,
    "The type can only be changed while the item is still in Content.",
  );
  const newRoute = routeFor(type, ctx.context);
  const keep = new Map(later.map((s) => [s.kind, s]));
  for (const s of later) if (!newRoute.includes(s.kind)) await tx.delete(stages).where(eq(stages.id, s.id));
  for (const [i, kind] of newRoute.entries()) {
    if (kind === "content") continue;
    const existing = keep.get(kind);
    if (existing) await tx.update(stages).set({ position: i }).where(eq(stages.id, existing.id));
    else await tx.insert(stages).values({ itemId: ctx.item.id, kind, position: i, status: "waiting" });
  }
  await tx.update(contentItems).set({ type }).where(eq(contentItems.id, ctx.item.id));
  await logActivity(tx, actor, {
    itemId: ctx.item.id,
    brandId: ctx.brandId,
    projectId: ctx.projectId,
    clientId: ctx.clientId,
    action: "item_updated",
    field: "type",
    oldValue: ctx.item.type,
    newValue: type,
    summary: `${actor.name} changed the type from ${TYPE_META[ctx.item.type].label} to ${TYPE_META[type].label}.`,
  });
}

export async function setItemCancelled(actor: Actor, itemId: string, cancelled: boolean) {
  return db.transaction(async (tx) => {
    assert(can.editContent(actor), NOT_ALLOWED);
    const ctx = await loadItemCtx(tx, itemId);
    if (!!ctx.item.cancelledAt === cancelled) return false;
    await tx
      .update(contentItems)
      .set(cancelled ? { cancelledAt: new Date(), cancelledById: actor.id } : { cancelledAt: null, cancelledById: null })
      .where(eq(contentItems.id, itemId));
    if (cancelled) await stopItemTimeTx(tx, itemId, new Date(), "cancelled");
    await logActivity(tx, actor, {
      itemId,
      brandId: ctx.brandId,
      projectId: ctx.projectId,
      clientId: ctx.clientId,
      action: cancelled ? "item_deleted" : "item_restored",
      summary: `${actor.name} ${cancelled ? "deleted" : "restored"} “${ctx.item.title}”.`,
    });
    return true;
  });
}

/**
 * Managers decide what counts as extra: e.g. a replacement for a rejected post isn't extra, a surprise request is.
 * Extra work is counted for the person and the brand (on top of the month's plan).
 */
export async function setItemExtra(actor: Actor, itemId: string, extra: boolean) {
  assert(can.markExtra(actor), "Only managers decide what counts as extra.");
  return db.transaction(async (tx) => {
    const ctx = await loadItemCtx(tx, itemId);
    assert(ctx.context === "plan", "Extra work is counted for brand content.");
    if (!!ctx.item.extraRequestedById === extra) return false;
    await tx
      .update(contentItems)
      .set({ extraRequestedById: extra ? actor.id : null })
      .where(eq(contentItems.id, itemId));
    await logActivity(tx, actor, {
      itemId,
      brandId: ctx.brandId,
      action: "item_updated",
      field: "extra",
      oldValue: ctx.item.extraRequestedById ? "extra" : "plan",
      newValue: extra ? "extra" : "plan",
      summary: extra ? `${actor.name} marked “${ctx.item.title}” as extra work.` : `${actor.name} counted “${ctx.item.title}” as part of the plan (not extra).`,
    });
    return true;
  });
}

export async function addComment(
  actor: Actor,
  itemId: string,
  body: string,
  opts: { parentId?: string | null; mentionUserId?: string | null } = {},
) {
  const text = body.trim();
  assert(text, "Write something first.");
  assert(text.length <= 4000, "Keep comments under 4000 characters.");
  return db.transaction(async (tx) => {
    const ctx = await loadItemCtx(tx, itemId, false);
    let parent: typeof comments.$inferSelect | undefined;
    if (opts.parentId) {
      [parent] = await tx.select().from(comments).where(eq(comments.id, opts.parentId));
      assert(parent && parent.itemId === itemId, "That comment no longer exists.");
      if (parent.parentId) [parent] = await tx.select().from(comments).where(eq(comments.id, parent.parentId)); // keep one level
    }
    let to: { id: string; name: string } | undefined;
    if (opts.mentionUserId && !parent) {
      [to] = await tx.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, opts.mentionUserId));
      assert(to, "That person doesn't exist.");
    }
    const [created] = await tx.insert(comments).values({ itemId, authorId: actor.id, body: text, parentId: parent?.id ?? null, mentionUserId: to?.id ?? null }).returning({ id: comments.id });
    // @Name anywhere in the text notifies that person too.
    const people = await tx.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true));
    const tagged = findMentions(text, people).filter((id) => id !== to?.id && id !== parent?.authorId && id !== parent?.mentionUserId);
    if (tagged.length) {
      await notify(tx, actor, tagged, { kind: "mention", title: `${actor.name} mentioned you on ${ctx.item.title}`, body: truncate(text, 140), itemId });
    }
    if (parent) {
      await notify(tx, actor, [parent.authorId, parent.mentionUserId], {
        kind: "reply",
        title: `${actor.name} replied on ${ctx.item.title}`,
        body: truncate(text, 140),
        itemId,
      });
    } else if (to) {
      await notify(tx, actor, [to.id], { kind: "comment", title: `${actor.name} wrote to you on ${ctx.item.title}`, body: truncate(text, 140), itemId });
    }
    // Replying to a comment addressed to you counts as answering it.
    if (parent && parent.mentionUserId === actor.id && !parent.resolvedAt) {
      await tx.update(comments).set({ resolvedAt: new Date(), resolvedById: actor.id }).where(eq(comments.id, parent.id));
    }
    await logActivity(tx, actor, {
      itemId,
      brandId: ctx.brandId,
      projectId: ctx.projectId,
      clientId: ctx.clientId,
      subjectUserId: to?.id ?? null,
      action: parent ? "comment_replied" : "comment_added",
      summary: parent
        ? `${actor.name} replied: “${truncate(text, 140)}”`
        : `${actor.name} ${to ? `wrote to ${to.name}` : "commented"}: “${truncate(text, 140)}”`,
    });
    return created.id;
  });
}

/** Delete your own comment (managers can delete any). Kept in the activity log. */
export async function deleteComment(actor: Actor, commentId: string) {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(comments).where(eq(comments.id, commentId));
    assert(c && !c.deletedAt, "Comment not found.");
    assert(c.authorId === actor.id || isManager(actor), "You can only delete your own comments.");
    await tx.update(comments).set({ deletedAt: new Date() }).where(eq(comments.id, commentId));
    const ctx = await loadItemCtx(tx, c.itemId, false);
    await logActivity(tx, actor, {
      itemId: c.itemId,
      brandId: ctx.brandId,
      projectId: ctx.projectId,
      clientId: ctx.clientId,
      action: "comment_deleted",
      summary: `${actor.name} deleted a comment: “${truncate(c.body, 80)}”`,
    });
  });
}

/** Mark a comment thread as handled (the person it was for, its author, or an admin). */
export async function resolveComment(actor: Actor, commentId: string, resolved = true) {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(comments).where(eq(comments.id, commentId));
    assert(c && !c.parentId, "Comment not found.");
    assert(c.authorId === actor.id || c.mentionUserId === actor.id || !!actor.isAdmin, NOT_ALLOWED);
    await tx.update(comments).set(resolved ? { resolvedAt: new Date(), resolvedById: actor.id } : { resolvedAt: null, resolvedById: null }).where(eq(comments.id, commentId));
    const ctx = await loadItemCtx(tx, c.itemId, false);
    await logActivity(tx, actor, {
      itemId: c.itemId,
      brandId: ctx.brandId,
      projectId: ctx.projectId,
      clientId: ctx.clientId,
      action: resolved ? "comment_resolved" : "comment_reopened",
      summary: `${actor.name} ${resolved ? "marked a comment as done" : "reopened a comment"}: “${truncate(c.body, 80)}”`,
    });
  });
}

/* ------------------------------------------------------------------ */
/* Bulk actions on many items                                           */
/* ------------------------------------------------------------------ */

export type BulkAction = { type: "assign"; userId: string | null } | { type: "deadline"; date: string | null } | { type: "complete" };

export async function bulkStageAction(actor: Actor, itemIds: string[], kind: StageKind, action: BulkAction) {
  assert(itemIds.length > 0, "Select at least one item.");
  return db.transaction(async (tx) => {
    let applied = 0;
    const skipped: string[] = [];
    const now = new Date();
    for (const id of itemIds) {
      const ctx = await loadItemCtx(tx, id);
      if (ctx.item.cancelledAt) {
        skipped.push(ctx.item.title);
        continue;
      }
      const all = await loadStages(tx, id);
      const stage = all.find((s) => s.kind === kind);
      if (!stage) {
        skipped.push(ctx.item.title);
        continue;
      }
      const allowed = action.type === "assign" ? can.assign(actor, stage) : action.type === "deadline" ? can.setDeadline(actor) : can.doStage(actor, stage);
      if (!allowed) {
        skipped.push(ctx.item.title);
        continue;
      }
      try {
        if (action.type === "assign") {
          if (await assignStageTx(tx, actor, ctx, stage, action.userId)) applied++;
        } else if (action.type === "deadline") {
          if (stage.status === "done") {
            skipped.push(ctx.item.title);
            continue;
          }
          if (await setStageDeadlineTx(tx, actor, ctx, stage, action.date)) applied++;
        } else {
          if (stage.status !== "active" || (STAGE_META[kind].needsDriveLink && !ctx.item.driveUrl) || kind === "social") {
            skipped.push(ctx.item.title);
            continue;
          }
          await completeStageTx(tx, actor, ctx, all, stage, now);
          applied++;
        }
      } catch (e) {
        if (e instanceof UserError) skipped.push(ctx.item.title);
        else throw e;
      }
    }
    return { applied, skipped, message: `${plural(applied, "item")} updated${skipped.length ? `, ${skipped.length} skipped` : ""}.` };
  });
}

/* ------------------------------------------------------------------ */
/* Month links: one Canva presentation + one Drive folder per brand-month */
/* ------------------------------------------------------------------ */

export async function setPlanLinks(
  actor: Actor,
  target: { brandId: string; year: number; month: number },
  links: { canvaUrl?: string | null; driveFolderUrl?: string | null },
) {
  assert(can.editContent(actor), "Only the Content team can change the month's links.");
  return db.transaction(async (tx) => {
    const planId = await ensurePlanTx(tx, actor, target.brandId, target.year, target.month);
    const [plan] = await tx.select().from(contentPlans).where(eq(contentPlans.id, planId));
    const set: Partial<typeof contentPlans.$inferInsert> = {};
    const changes: string[] = [];
    if (links.canvaUrl !== undefined && normalizeUrl(links.canvaUrl) !== plan.canvaUrl) {
      set.canvaUrl = normalizeUrl(links.canvaUrl);
      changes.push(set.canvaUrl ? "the month's Canva link" : "removed the month's Canva link");
    }
    if (links.driveFolderUrl !== undefined && normalizeUrl(links.driveFolderUrl) !== plan.driveFolderUrl) {
      set.driveFolderUrl = normalizeUrl(links.driveFolderUrl);
      changes.push(set.driveFolderUrl ? "the month's Drive folder" : "removed the month's Drive folder");
    }
    if (!changes.length) return false;
    await tx.update(contentPlans).set(set).where(eq(contentPlans.id, planId));
    const [b] = await tx.select({ name: brands.name }).from(brands).where(eq(brands.id, target.brandId));
    await logActivity(tx, actor, {
      action: "plan_updated",
      brandId: target.brandId,
      summary: `${actor.name} updated ${changes.join(" and ")} for ${b.name} · ${monthLabel(target.year, target.month)}.`,
    });
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* Extra work: a manager gives a task for a brand                        */
/* ------------------------------------------------------------------ */

export type ExtraTaskInput = {
  title: string;
  notes?: string | null;
  assigneeIds: string[];
  brandId: string;
  /** The step the work starts at — everything before it is skipped (e.g. "media" = editing only). */
  step: StageKind;
  type: ContentType;
  dueDate?: string | null;
  priority?: string | null;
};

/**
 * "Give a task" with a brand: the task becomes a real item in that brand's plan for the month it was given,
 * marked EXTRA (outside the planned content). It starts at the chosen step, with that person and the deadline,
 * and then works like any item: links, versions, approval or changes, the next steps, statistics.
 * One item per person chosen.
 */
export async function createExtraTasks(actor: Actor, input: ExtraTaskInput, opts: { now?: Date } = {}): Promise<string[]> {
  assert(can.giveTasks(actor), "Only managers can give tasks.");
  const title = input.title.trim();
  assert(title, "Write what needs to be done.");
  assert(title.length <= 300, "Keep the title under 300 characters.");
  const ids = [...new Set(input.assigneeIds.filter(Boolean))];
  assert(ids.length, "Choose who it's for.");
  assert(TYPE_META[input.type], "Unknown content type.");
  const route = routeFor(input.type, "plan");
  const start = route.indexOf(input.step);
  assert(start >= 0, `A ${TYPE_META[input.type].label} has no ${STAGE_META[input.step]?.label ?? "such"} step — pick another type or step.`);
  if (input.dueDate) assert(isValidISODate(input.dueDate), "Invalid date.");
  const now = opts.now ?? new Date();
  const today = cairoDate(now);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));

  return db.transaction(async (tx) => {
    const [brand] = await tx.select().from(brands).where(eq(brands.id, input.brandId));
    assert(brand, "Brand not found.");
    assert(brand.isActive, `${brand.name} is inactive. Reactivate it in Settings to add new work.`);
    const planId = await ensurePlanTx(tx, actor, brand.id, year, month);
    const where = `${brand.name} · ${monthLabel(year, month)}`;
    const kinds = route.slice(start);
    const defaults: Partial<Record<StageKind, string | null>> = {};
    for (const k of kinds) defaults[k] = await defaultAssigneeTx(tx, brand.id, k);
    const people = await tx.select({ id: users.id, name: users.name, isActive: users.isActive }).from(users).where(inArray(users.id, ids));
    const created: string[] = [];
    for (const assigneeId of ids) {
      const p = people.find((x) => x.id === assigneeId);
      assert(p?.isActive, "That person is not an active team member.");
      const [item] = await tx
        .insert(contentItems)
        .values({ title, type: input.type, planId, extraRequestedById: actor.id, priority: cleanPriority(input.priority), createdAt: now, createdById: actor.id })
        .returning();
      await tx.insert(stages).values(
        kinds.map((kind, i) => ({
          itemId: item.id,
          kind,
          position: i,
          status: i === 0 ? ("active" as const) : ("waiting" as const),
          activatedAt: i === 0 ? now : null,
          assigneeId: i === 0 ? assigneeId : (defaults[kind] ?? null),
        })),
      );
      const step = STAGE_META[input.step].label;
      await logActivity(tx, actor, {
        action: "item_created",
        itemId: item.id,
        brandId: brand.id,
        subjectUserId: assigneeId,
        summary: `${actor.name} gave ${p!.name} an extra task in ${where}: ${TYPE_META[input.type].label} “${title}”, starting at ${step}${input.dueDate ? `, due ${formatDay(input.dueDate)}` : ""}.`,
        at: now,
      });
      if (input.dueDate) {
        const ctx = await loadItemCtx(tx, item.id);
        const [first] = await loadStages(tx, item.id);
        await setStageDeadlineTx(tx, actor, ctx, first, input.dueDate);
      }
      const notes = input.notes?.trim();
      if (notes) await tx.insert(comments).values({ itemId: item.id, authorId: actor.id, body: notes, tag: "task", createdAt: now });
      await notify(tx, actor, [assigneeId], {
        kind: "new_task",
        title: `New task from ${actor.name}: ${title}`,
        body: `${where} · Extra · ${step}${input.dueDate ? ` · due ${formatDay(input.dueDate)}` : ""}`,
        itemId: item.id,
        at: now,
      });
      created.push(item.id);
    }
    return created;
  });
}
