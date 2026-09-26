import { and, eq, inArray } from "drizzle-orm";
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
import { STAGE_META, TYPE_META, routeFor } from "@/domain/workflow";
import { formatDay, isValidISODate, isValidTime, monthLabel, plural } from "@/lib/dates";
import { logActivity, type Actor } from "./activity";
import { UserError, assert } from "./errors";
import { NOT_ALLOWED, can } from "@/domain/permissions";
import {
  assignStageTx,
  completeStageTx,
  loadItemCtx,
  loadStages,
  normalizeUrl,
  setDriveUrlTx,
  setStageDeadlineTx,
  truncate,
} from "./workflow";

export type NewItemRow = {
  title: string;
  type: ContentType;
  postingDate?: string | null;
  postingTime?: string | null;
  canvaUrl?: string | null;
};

export type ItemTarget = { kind: "plan"; brandId: string; year: number; month: number } | { kind: "project"; projectId: string };

export async function ensurePlanTx(tx: Tx, actor: Actor, brandId: string, year: number, month: number): Promise<string> {
  assert(month >= 1 && month <= 12 && year > 2000 && year < 2200, "Invalid month.");
  const [existing] = await tx
    .select({ id: contentPlans.id })
    .from(contentPlans)
    .where(and(eq(contentPlans.brandId, brandId), eq(contentPlans.year, year), eq(contentPlans.month, month)));
  if (existing) return existing.id;
  const [brand] = await tx.select().from(brands).where(eq(brands.id, brandId));
  assert(brand, "Brand not found.");
  const [plan] = await tx.insert(contentPlans).values({ brandId, year, month, createdById: actor.id }).returning({ id: contentPlans.id });
  await logActivity(tx, actor, {
    action: "plan_created",
    brandId,
    summary: `${actor.name} started the ${monthLabel(year, month)} content plan for ${brand.name}.`,
  });
  return plan.id;
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
        .select({ id: projects.id, name: projects.name, clientName: clients.name, clientId: clients.id })
        .from(projects)
        .innerJoin(clients, eq(clients.id, projects.clientId))
        .where(eq(projects.id, target.projectId));
      assert(p, "Project not found.");
      projectId = p.id;
      clientId = p.clientId;
      where = `${p.clientName} · ${p.name}`;
    }
    const contentAssignee = options.contentAssigneeId !== undefined ? options.contentAssigneeId : defaultCreator;

    let platformIds: string[] = [];
    if (target.kind === "plan" && options.platformIds?.length) {
      const ps = await tx.select().from(platforms).where(inArray(platforms.id, options.platformIds));
      platformIds = ps.filter((p) => p.isActive).map((p) => p.id);
    }

    const ids: string[] = [];
    for (const r of clean) {
      const [item] = await tx
        .insert(contentItems)
        .values({
          title: r.title,
          type: r.type,
          planId,
          projectId,
          canvaUrl: normalizeUrl(r.canvaUrl),
          postingDate: r.postingDate || null,
          postingTime: r.postingTime || null,
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
          assigneeId: kind === "content" ? contentAssignee : null,
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
        await completeStageTx(tx, actor, ctx, all, all[0], now);
      }
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
    await logActivity(tx, actor, {
      itemId,
      brandId: ctx.brandId,
      projectId: ctx.projectId,
      clientId: ctx.clientId,
      action: cancelled ? "item_cancelled" : "item_restored",
      summary: `${actor.name} ${cancelled ? "cancelled" : "restored"} “${ctx.item.title}”.`,
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
    await tx.insert(comments).values({ itemId, authorId: actor.id, body: text, parentId: parent?.id ?? null, mentionUserId: to?.id ?? null });
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
          if (stage.status !== "active" || (STAGE_META[kind].needsDriveLink && !ctx.item.driveUrl) || kind === "social" || (kind === "content" && !ctx.item.canvaUrl)) {
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
