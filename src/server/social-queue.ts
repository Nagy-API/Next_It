/**
 * The Social media schedule's background job (started once by prepareDatabase, runs every minute):
 *  1. sends every post whose time has come to its channels, one step at a time (videos take Meta a few minutes),
 *  2. refreshes the numbers of published posts (often while a post is new, then less and less),
 *  3. every quarter of an hour, removes from the server the files of posts that are already out (cleanupMedia).
 *
 * When a channel fails, the social team (and whoever wrote the post) gets a notification with Meta's reason.
 * A channel that fails is NOT retried by itself — a second attempt could post twice. The error Meta gave is kept
 * on the post, and the person presses "Try again".
 */
import { and, arrayContains, asc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { socialAccounts, socialMedia, socialMetricSnapshots, socialPostTargets, socialPosts, users } from "@/db/schema";
import type { PostKind, PostOptions, PostStatus, SocialPlatform } from "@/domain/social";
import { logActivity } from "./activity";
import { notify } from "./notify";
import { accountWithToken, cleanupMedia, markAccount, publicBase } from "./social";
import { MetaError, fetchMetrics, publishStep, type PublishState } from "./social-meta";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const CLAIM_MS = 10 * 60_000;

/** Take a channel of a post for this run (so a second process, or a second run, can't send it too). */
async function claim(targetId: string) {
  const stale = new Date(Date.now() - CLAIM_MS);
  const got = await db
    .update(socialPostTargets)
    .set({ claimedAt: new Date(), status: "processing" })
    .where(and(eq(socialPostTargets.id, targetId), inArray(socialPostTargets.status, ["pending", "processing"]), or(isNull(socialPostTargets.claimedAt), lt(socialPostTargets.claimedAt, stale))))
    .returning();
  return got[0] ?? null;
}

type Failure = { channel: string; message: string };

/** Send one channel of a post one step further. Returns the failure when it didn't work (for the notification). */
async function sendTarget(post: typeof socialPosts.$inferSelect, targetId: string): Promise<Failure | null> {
  const t = await claim(targetId);
  if (!t) return null;
  let channel = "a channel";
  const fail = async (message: string): Promise<Failure> => {
    await db.update(socialPostTargets).set({ status: "failed", error: message.slice(0, 1000), claimedAt: null }).where(eq(socialPostTargets.id, t.id));
    return { channel, message };
  };
  try {
    // The name first, so even a channel whose token can't be read is named in the notification.
    const [named] = await db.select({ platform: socialAccounts.platform, name: socialAccounts.name }).from(socialAccounts).where(eq(socialAccounts.id, t.accountId));
    if (named) channel = `${named.platform === "instagram" ? "Instagram" : "Facebook"} (${named.name})`;
    const acc = await accountWithToken(t.accountId);
    if (!acc) return await fail("This channel is no longer connected. Connect it again in Configuration.");
    const media = post.mediaIds.length ? await db.select().from(socialMedia).where(inArray(socialMedia.id, post.mediaIds)) : [];
    const ordered = post.mediaIds.map((id) => media.find((m) => m.id === id && !m.deletedAt)).filter((m): m is NonNullable<typeof m> => !!m);
    if (ordered.length !== post.mediaIds.length) return await fail("A photo or video of this post was deleted from the media library.");
    const base = await publicBase();
    if (ordered.length && !base) return await fail("This system's public address isn't set (Configuration), so Meta can't download the files.");
    const input = {
      platform: acc.account.platform as SocialPlatform,
      externalId: acc.account.externalId,
      token: acc.token,
      kind: post.kind as PostKind,
      caption: post.caption,
      options: (post.options ?? {}) as PostOptions,
      media: ordered.map((m) => ({ kind: m.kind as "image" | "video", url: `${base}/api/social/file/${m.id}?k=${m.publicKey}` })),
    };
    let state = (t.state ?? {}) as PublishState;
    const hasVideo = ordered.some((m) => m.kind === "video");
    // Photos are ready within seconds: finish them in this run. Videos continue on the next runs.
    for (let i = 0; i < 4; i++) {
      const r = await publishStep(input, state);
      if (r.done) {
        await db.transaction(async (tx) => {
          await tx.update(socialPostTargets).set({ status: "published", externalId: r.externalId, permalink: r.permalink, publishedAt: new Date(), error: null, state: {}, claimedAt: null }).where(eq(socialPostTargets.id, t.id));
          await logActivity(tx, null, { action: "social_published", brandId: post.brandId, summary: `A social ${post.kind} went out on ${input.platform === "instagram" ? "Instagram" : "Facebook"} (${acc.account.name})${post.caption ? `: “${post.caption.slice(0, 60)}”` : "."}`, meta: { postId: post.id, permalink: r.permalink } });
        });
        if (acc.account.status !== "ok") await markAccount(acc.account.id, null);
        return null;
      }
      state = r.state;
      await db.update(socialPostTargets).set({ state, claimedAt: i < 3 && !hasVideo ? new Date() : null }).where(eq(socialPostTargets.id, t.id));
      if (hasVideo) return null;
      await sleep(2000);
    }
    // Still not ready: let the next run continue.
    await db.update(socialPostTargets).set({ claimedAt: null }).where(eq(socialPostTargets.id, t.id));
    return null;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    if (!(e instanceof MetaError)) console.error("Social publishing failed:", e);
    const failure = await fail(e instanceof MetaError || (e instanceof Error && e.name === "UserError") ? message : "Something went wrong on our side while sending this. Press Try again.");
    if (e instanceof MetaError && e.tokenProblem) await markAccount(t.accountId, message).catch(() => {});
    return failure;
  }
}

/** Tell the social team, and whoever wrote the post, that it didn't go out — with the reason. */
async function notifyFailure(post: typeof socialPosts.$inferSelect, failures: Failure[]) {
  const team = await db.select({ id: users.id }).from(users).where(and(eq(users.isActive, true), arrayContains(users.teams, ["social"])));
  const what = post.kind === "reel" ? "Reel" : post.kind === "story" ? "Story" : "post";
  const caption = post.caption.trim().replace(/\s+/g, " ");
  await db.transaction(async (tx) => {
    await notify(tx, null, [...team.map((u) => u.id), post.createdById, post.updatedById], {
      kind: "social_failed",
      title: `A ${what} didn't publish on ${failures.map((f) => f.channel).join(" and ")}`,
      body: `${failures[0].message}${caption ? ` — “${caption.slice(0, 80)}${caption.length > 80 ? "…" : ""}”` : ""}`,
      href: `/social/posts/${post.id}`,
    });
    await logActivity(tx, null, { action: "social_failed", brandId: post.brandId, summary: `A social ${what} didn't publish on ${failures.map((f) => f.channel).join(" and ")}: ${failures[0].message}`, meta: { postId: post.id } });
  });
}

/** The post's own status follows its channels. */
async function settle(postId: string) {
  const targets = await db.select({ status: socialPostTargets.status }).from(socialPostTargets).where(eq(socialPostTargets.postId, postId));
  const n = (s: string) => targets.filter((t) => t.status === s).length;
  let status: PostStatus;
  if (n("pending") + n("processing") > 0) status = "publishing";
  else if (n("published") === targets.length && targets.length) status = "published";
  else if (n("published") > 0) status = "partial";
  else status = "failed";
  await db.update(socialPosts).set({ status, updatedAt: new Date() }).where(and(eq(socialPosts.id, postId), inArray(socialPosts.status, ["scheduled", "publishing"])));
}

let running = false;

/** Send everything that is due. Safe to call any time (a run already in progress makes this one a no-op). */
export async function publishDue(now = new Date()): Promise<number> {
  if (running) return 0;
  running = true;
  let sent = 0;
  try {
    const due = await db
      .select()
      .from(socialPosts)
      .where(and(isNull(socialPosts.deletedAt), inArray(socialPosts.status, ["scheduled", "publishing"]), lte(socialPosts.scheduledAt, now)))
      .orderBy(asc(socialPosts.scheduledAt))
      .limit(25);
    for (const post of due) {
      if (post.status === "scheduled") await db.update(socialPosts).set({ status: "publishing" }).where(and(eq(socialPosts.id, post.id), eq(socialPosts.status, "scheduled")));
      const targets = await db
        .select({ id: socialPostTargets.id })
        .from(socialPostTargets)
        .where(and(eq(socialPostTargets.postId, post.id), inArray(socialPostTargets.status, ["pending", "processing"])));
      const failures: Failure[] = [];
      for (const t of targets) {
        const failed = await sendTarget(post, t.id);
        if (failed) failures.push(failed);
        sent++;
      }
      await settle(post.id);
      if (failures.length) await notifyFailure(post, failures).catch((e) => console.error("Social notification failed:", e));
    }
  } finally {
    running = false;
  }
  return sent;
}

/** How long to wait before asking Meta for a post's numbers again: often while it's new, then less. */
function refreshEvery(publishedAt: Date, now: Date) {
  const age = now.getTime() - publishedAt.getTime();
  const H = 3_600_000;
  if (age < 48 * H) return H;
  if (age < 14 * 24 * H) return 6 * H;
  if (age < 90 * 24 * H) return 24 * H;
  return Infinity;
}

async function refreshTarget(targetId: string) {
  const [row] = await db
    .select({ t: socialPostTargets, kind: socialPosts.kind, mediaIds: socialPosts.mediaIds })
    .from(socialPostTargets)
    .innerJoin(socialPosts, eq(socialPosts.id, socialPostTargets.postId))
    .where(eq(socialPostTargets.id, targetId));
  if (!row?.t.externalId) return;
  const acc = await accountWithToken(row.t.accountId);
  if (!acc) return;
  const media = row.mediaIds.length ? await db.select({ id: socialMedia.id, kind: socialMedia.kind }).from(socialMedia).where(inArray(socialMedia.id, row.mediaIds)) : [];
  const platform = acc.account.platform as SocialPlatform;
  // Instagram: one video = a Reel (a carousel with videos counts as a feed post). Facebook: a post with a video is a video.
  const video = row.kind === "reel" || (media.some((m) => m.kind === "video") && (platform === "facebook" || row.mediaIds.length === 1));
  try {
    const data = await fetchMetrics({ platform, externalId: row.t.externalId, token: acc.token, kind: row.kind as PostKind, video });
    await db.transaction(async (tx) => {
      await tx.update(socialPostTargets).set({ metrics: data, metricsAt: new Date(), metricsError: null }).where(eq(socialPostTargets.id, targetId));
      await tx.insert(socialMetricSnapshots).values({ targetId, data });
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    if (!(e instanceof MetaError)) console.error("Social numbers failed:", e);
    await db.update(socialPostTargets).set({ metricsAt: new Date(), metricsError: message.slice(0, 500) }).where(eq(socialPostTargets.id, targetId));
  }
}

let refreshing = false;

/** Refresh the numbers that are due (or, with `postId`, every channel of that post right now). */
export async function refreshMetrics(opts: { postId?: string; all?: boolean; now?: Date } = {}): Promise<number> {
  if (refreshing && !opts.postId) return 0;
  refreshing = true;
  const now = opts.now ?? new Date();
  let done = 0;
  try {
    const rows = await db
      .select({ id: socialPostTargets.id, publishedAt: socialPostTargets.publishedAt, metricsAt: socialPostTargets.metricsAt })
      .from(socialPostTargets)
      .innerJoin(socialPosts, eq(socialPosts.id, socialPostTargets.postId))
      .where(and(eq(socialPostTargets.status, "published"), isNull(socialPosts.deletedAt), opts.postId ? eq(socialPostTargets.postId, opts.postId) : sql`${socialPostTargets.publishedAt} > now() - interval '90 days'`))
      .orderBy(sql`${socialPostTargets.metricsAt} asc nulls first`);
    for (const r of rows) {
      if (!opts.postId && !opts.all) {
        const every = refreshEvery(r.publishedAt ?? now, now);
        // The first numbers a couple of minutes after publishing, once Meta has something to say.
        if (!r.metricsAt ? now.getTime() - (r.publishedAt?.getTime() ?? 0) < 2 * 60_000 : now.getTime() - r.metricsAt.getTime() < every) continue;
        if (done >= 15) break;
      }
      if (done >= 120) break;
      await refreshTarget(r.id);
      done++;
    }
  } finally {
    refreshing = false;
  }
  return done;
}

let timer: ReturnType<typeof setInterval> | null = null;
let ticks = 0;

/** Started once by prepareDatabase(): checks every minute. */
export function startSocialQueue() {
  if (timer) return;
  const tick = async () => {
    await publishDue().catch((e) => console.error("Social queue failed:", e));
    await refreshMetrics().catch((e) => console.error("Social numbers failed:", e));
    // Every 15 minutes: free the disk from the files of posts that are already out.
    if (ticks++ % 15 === 0) await cleanupMedia().catch((e) => console.error("Social clean-up failed:", e));
  };
  timer = setInterval(tick, 60_000);
  timer.unref?.();
  void tick();
}
