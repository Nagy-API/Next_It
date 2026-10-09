import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { activityLog, brands, contentItems, contentPlans, notifications, platforms, users } from "@/db/schema";
import type { ContentType, StageKind } from "@/db/schema";
import { cairoDate } from "@/lib/dates";
import { logActivity, type Actor } from "./activity";
import { addComment, createItems, updateItem } from "./items";
import { handOff, loadStages, reviewVersion, setPlatformState, setShootDetails, setStageProgress, submitVersion } from "./workflow";
import { TRACKER } from "./seed-data/tracker.generated";

/**
 * One-time import of the old Excel content tracker (data: src/server/seed-data/tracker.generated.ts, made by
 * scripts/tracker-to-seed.mjs). Every item is created in its brand's month plan and brought to its real state
 * through the normal workflow, as the people who did each step and on the dates in the sheet:
 *   content delivered → shoot planned / done → editing or design version sent (waiting approval) or approved (done)
 *   → posted platforms with their live links (the item completes when all are live).
 * Items already in the plan (same title and posting date) are not duplicated. Runs once (activity-log marker).
 * The notifications this replays are marked read — it's history, not new work.
 */

type Production = { status: "done" | "waiting_approval" | "processing" | "adjusting" | null; url: string | null; delivered: string | null; comment: string | null };
export type TrackerItem = {
  title: string;
  type: ContentType;
  canvaUrl: string | null;
  contentDelivered: string | null;
  contentComment: string | null;
  postingDate: string;
  shootDate: string | null;
  production: Production;
  posted: { date: string | null; platforms: Record<string, string> } | null;
};
export type TrackerBrand = { brand: string; year: number; month: number; items: TrackerItem[] };

const MARKER = "tracker_import_2026_10";

/** Morning in Cairo on that day (10:00), so the timeline reads naturally. */
const at = (day: string | null | undefined, hours = 0) => new Date(new Date(`${day ?? cairoDate(new Date())}T07:00:00Z`).getTime() + hours * 3_600_000);

export async function importTracker(data: TrackerBrand[] = TRACKER) {
  const [done] = await db.select({ id: activityLog.id }).from(activityLog).where(eq(activityLog.action, MARKER)).limit(1);
  if (done) return;
  const people = await db.select().from(users);
  const actor = (id: string | null | undefined, fallback: string): Actor | null => {
    const u = people.find((p) => p.id === id && p.isActive) ?? people.find((p) => p.username === fallback && p.isActive);
    return u ? { id: u.id, name: u.name, isAdmin: u.isAdmin, isManager: u.isManager, teams: u.teams } : null;
  };
  const platformRows = await db.select().from(platforms);
  const before = (await db.select({ id: notifications.id }).from(notifications)).map((n) => n.id);
  const today = cairoDate(new Date());
  let created = 0;
  let updated = 0;

  for (const b of data) {
    const [brand] = await db.select().from(brands).where(sql`lower(${brands.name}) = ${b.brand.toLowerCase()}`);
    if (!brand?.isActive) {
      console.log(`  (skipped ${b.brand}: no active brand with that name)`);
      continue;
    }
    const creator = actor(brand.defaultCreatorId, "king");
    if (!creator) continue;
    const existing = await db
      .select({ id: contentItems.id, title: contentItems.title, postingDate: contentItems.postingDate })
      .from(contentItems)
      .innerJoin(contentPlans, eq(contentPlans.id, contentItems.planId))
      // Any month: an item dated in the next month lives in that month's plan.
      .where(and(eq(contentPlans.brandId, brand.id), isNull(contentItems.cancelledAt)));

    for (const it of b.items) {
      const match = existing.find((e) => e.title.trim().toLowerCase() === it.title.toLowerCase() && e.postingDate === it.postingDate);
      let id = match?.id;
      if (!id) {
        [id] = await createItems(
          creator,
          { kind: "plan", brandId: brand.id, year: b.year, month: b.month },
          [{ title: it.title, type: it.type, canvaUrl: it.canvaUrl, postingDate: it.postingDate }],
          { contentReady: !!it.contentDelivered, now: at(it.contentDelivered) },
        );
        existing.push({ id, title: it.title, postingDate: it.postingDate });
        created++;
        if (it.contentComment) await addComment(creator, id, it.contentComment);
      }
      if (await applyState(id, it, creator, actor, platformRows, today)) updated++;
    }
  }

  // History, not new work: don't flood everyone's bell with what the import replayed.
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(before.length ? and(isNull(notifications.readAt), notInArray(notifications.id, before)) : isNull(notifications.readAt));
  await logActivity(db, null, {
    action: MARKER,
    summary: `Imported the Excel content tracker: ${created} new items, ${updated} brought to their current step (shoots, versions, approvals, posts).`,
  });
  console.log(`✓ Imported the content tracker: ${created} new items, ${updated} updated to their current step`);
}

async function applyState(
  itemId: string,
  it: TrackerItem,
  creator: Actor,
  actor: (id: string | null | undefined, fallback: string) => Actor | null,
  platformRows: { id: string; slug: string }[],
  today: string,
): Promise<boolean> {
  const stage = async (kind: StageKind) => (await loadStages(db, itemId)).find((s) => s.kind === kind);
  const p = it.production;
  let changed = false;

  // Pre-production: the shoot date; it's done once editing has started (unless the shoot is today or later).
  const shoot = await stage("shooting");
  if (shoot?.status === "active") {
    const shooter = actor(shoot.assigneeId, "ayman");
    if (shooter && it.shootDate) changed = (await setShootDetails(shooter, itemId, { shootDate: it.shootDate })) || changed;
    const editingStarted = !!(p.status || p.url);
    if (shooter && editingStarted && !(it.shootDate && it.shootDate >= today)) {
      await handOff(shooter, shoot.id, { now: at(it.shootDate ?? it.contentDelivered, 6) });
      changed = true;
    }
  }

  // Post-production (reels) or Graphic Design (statics, carousels): versions and approval.
  const prod = await stage(it.type === "reel" ? "media" : "design");
  if (prod?.status === "active") {
    const worker = actor(prod.assigneeId, it.type === "reel" ? "jana" : "gannah");
    if (worker) {
      if (p.url && (p.status === "done" || p.status === "waiting_approval" || !p.status)) {
        const v = await submitVersion(worker, prod.id, { url: p.url, now: at(p.delivered, 2) });
        if (p.status === "done") await reviewVersion(creator, v.id, { approve: true, note: p.comment, now: at(p.delivered, 4) });
        changed = true;
      } else if (p.status === "waiting_approval" || p.status === "processing" || p.status === "adjusting") {
        await setStageProgress(worker, prod.id, p.status, { now: at(p.delivered ?? it.contentDelivered, 3) });
        if (p.url) await updateItem(worker, itemId, { driveUrl: p.url });
        changed = true;
      }
    }
  }

  // Social: each live link marks that platform published; when all are live the item is done.
  if (it.posted) {
    const social = await stage("social");
    const esraa = actor(social?.assigneeId, "esraa");
    if (social && social.status !== "waiting" && esraa) {
      for (const [slug, url] of Object.entries(it.posted.platforms)) {
        const platform = platformRows.find((x) => x.slug === slug);
        if (platform) await setPlatformState(esraa, itemId, platform.id, { liveUrl: url, date: it.posted.date }, { now: at(it.posted.date, 8) });
      }
      changed = true;
    }
  }
  return changed;
}
