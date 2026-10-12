/**
 * Talking to Meta (Facebook Pages + Instagram professional accounts) — plain HTTPS calls to the Graph API, no SDK.
 *
 * Nothing here touches the database: functions take a token and return data, so the queue (social-queue.ts) decides
 * what to store. Media is never sent as bytes: Meta downloads each file from this app's own address
 * (`/api/social/file/<id>?k=<key>`), which is why the public address in Configuration must be reachable.
 *
 * Publishing is done in steps (`publishStep`): Instagram and Facebook Reels process videos for a while, so a step
 * may answer "not yet" with a state to continue from on the next run.
 */
import "server-only";
import type { PostKind, PostOptions, SocialMetrics, SocialPlatform } from "@/domain/social";

export const GRAPH_VERSION = "v25.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const GRAPH_VIDEO = `https://graph-video.facebook.com/${GRAPH_VERSION}`;
const RUPLOAD = `https://rupload.facebook.com/video-upload/${GRAPH_VERSION}`;

/** The permissions the access token needs (shown in Configuration). */
export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "read_insights",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
  "business_management",
] as const;

/** Meta said no. `message` is Meta's own sentence, safe to show to the person. */
export class MetaError extends Error {
  code?: number;
  subcode?: number;
  constructor(message: string, code?: number, subcode?: number) {
    super(message);
    this.name = "MetaError";
    this.code = code;
    this.subcode = subcode;
  }
  /** The token was revoked, expired or lost a permission: the channel must be connected again. */
  get tokenProblem() {
    return this.code === 190 || this.code === 10 || this.code === 200 || (typeof this.code === "number" && this.code >= 200 && this.code <= 299);
  }
}

type Params = Record<string, string | number | boolean | null | undefined>;
type Json = Record<string, unknown>;

async function call<T = Json>(method: "GET" | "POST", url: string, params: Params, token: string, headers?: Record<string, string>): Promise<T> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) body.set(k, String(v));
  body.set("access_token", token);
  let res: Response;
  try {
    res = await fetch(method === "GET" ? `${url}?${body}` : url, { method, body: method === "POST" ? body : undefined, headers, signal: AbortSignal.timeout(90_000), cache: "no-store" });
  } catch {
    throw new MetaError("Couldn't reach Meta (the connection failed or took too long). It will work again when the internet does.");
  }
  const text = await res.text();
  let json: Json | null = null;
  try {
    json = JSON.parse(text) as Json;
  } catch {}
  const err = (json?.error ?? json?.debug_info) as { message?: string; error_user_msg?: string; code?: number; error_subcode?: number } | undefined;
  if (!res.ok || err) throw new MetaError(err?.error_user_msg || err?.message || `Meta answered with an error (${res.status}).`, err?.code, err?.error_subcode);
  return (json ?? {}) as T;
}

/* ------------------------------ Connecting ------------------------------ */

/** A short-lived user token → one that lasts about 60 days (Page tokens made from it don't expire). */
export async function exchangeLongLived(appId: string, appSecret: string, userToken: string): Promise<string> {
  const r = await call<{ access_token?: string }>("GET", `${GRAPH}/oauth/access_token`, { grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: userToken }, userToken);
  if (!r.access_token) throw new MetaError("Meta didn't return a long-lived token. Check the App ID and App secret.");
  return r.access_token;
}

export type FoundPage = { id: string; name: string; token: string; instagram: { id: string; username: string | null; name: string | null } | null };

/** Every Page this person manages, each with its own token and its linked Instagram professional account (if any). */
export async function listPages(userToken: string): Promise<FoundPage[]> {
  type Row = { id: string; name: string; access_token?: string; instagram_business_account?: { id: string; username?: string; name?: string } };
  const out: FoundPage[] = [];
  let after: string | undefined;
  for (let page = 0; page < 10; page++) {
    const r = await call<{ data?: Row[]; paging?: { cursors?: { after?: string }; next?: string } }>("GET", `${GRAPH}/me/accounts`, { fields: "id,name,access_token,instagram_business_account{id,username,name}", limit: 100, after }, userToken);
    for (const p of r.data ?? []) {
      if (!p.access_token) continue;
      const ig = p.instagram_business_account;
      out.push({ id: p.id, name: p.name, token: p.access_token, instagram: ig ? { id: ig.id, username: ig.username ?? null, name: ig.name ?? null } : null });
    }
    after = r.paging?.next ? r.paging.cursors?.after : undefined;
    if (!after) break;
  }
  return out;
}

/** Is the token still good? Returns the channel's current name. */
export async function pingAccount(platform: SocialPlatform, externalId: string, token: string): Promise<string> {
  const r = await call<{ name?: string; username?: string }>("GET", `${GRAPH}/${externalId}`, { fields: platform === "instagram" ? "username,name" : "name" }, token);
  return r.username || r.name || "";
}

/* ------------------------------ Publishing ------------------------------ */

export type PublishInput = {
  platform: SocialPlatform;
  /** Page ID or Instagram account ID. */
  externalId: string;
  token: string;
  kind: PostKind;
  caption: string;
  /** In order; `url` is the public link Meta downloads the file from. */
  media: { url: string; kind: "image" | "video" }[];
  options: PostOptions;
};
export type PublishState = { step?: "children" | "container" | "reel"; containerId?: string; children?: string[]; videoId?: string; startedAt?: number };
export type StepResult = { done: true; externalId: string; permalink: string | null } | { done: false; state: PublishState };

/** Meta gives up on a video after a while; so do we (and say so) instead of waiting forever. */
const PROCESSING_LIMIT_MS = 45 * 60_000;

function stillWaiting(state: PublishState): StepResult {
  if (state.startedAt && Date.now() - state.startedAt > PROCESSING_LIMIT_MS) throw new MetaError("Meta was still processing the video after 45 minutes. Check the file (MP4, H.264, AAC sound) and try again.");
  return { done: false, state };
}

async function igContainerStatus(id: string, token: string) {
  const r = await call<{ status_code?: string; status?: string }>("GET", `${GRAPH}/${id}`, { fields: "status_code,status" }, token);
  if (r.status_code === "ERROR" || r.status_code === "EXPIRED") throw new MetaError(`Instagram couldn't process the file${r.status ? `: ${r.status}` : "."}`);
  return r.status_code === "FINISHED" || r.status_code === "PUBLISHED";
}

async function instagramStep(input: PublishInput, state: PublishState): Promise<StepResult> {
  const { externalId: ig, token, kind, caption, media, options } = input;
  if (!state.step) {
    const startedAt = Date.now();
    if (kind === "post" && media.length > 1) {
      // A carousel: one container per photo / video, then one that holds them all.
      const children: string[] = [];
      for (const m of media) {
        const r = await call<{ id: string }>("POST", `${GRAPH}/${ig}/media`, m.kind === "video" ? { media_type: "VIDEO", video_url: m.url, is_carousel_item: true } : { image_url: m.url, is_carousel_item: true }, token);
        children.push(r.id);
      }
      return { done: false, state: { step: "children", children, startedAt } };
    }
    const m = media[0];
    const params: Params =
      kind === "story"
        ? { media_type: "STORIES", ...(m.kind === "video" ? { video_url: m.url } : { image_url: m.url }) }
        : m.kind === "video"
          ? // On Instagram every video in the feed is a Reel.
            { media_type: "REELS", video_url: m.url, caption, share_to_feed: options.shareToFeed !== false }
          : { image_url: m.url, caption };
    const r = await call<{ id: string }>("POST", `${GRAPH}/${ig}/media`, params, token);
    state = { step: "container", containerId: r.id, startedAt };
  }
  if (state.step === "children") {
    for (const id of state.children ?? []) if (!(await igContainerStatus(id, token))) return stillWaiting(state);
    const r = await call<{ id: string }>("POST", `${GRAPH}/${ig}/media`, { media_type: "CAROUSEL", children: (state.children ?? []).join(","), caption }, token);
    state = { step: "container", containerId: r.id, startedAt: state.startedAt };
  }
  if (!state.containerId) throw new MetaError("Lost track of this post on Instagram. Try again.");
  if (!(await igContainerStatus(state.containerId, token))) return stillWaiting(state);
  const pub = await call<{ id: string }>("POST", `${GRAPH}/${ig}/media_publish`, { creation_id: state.containerId }, token);
  let permalink: string | null = null;
  try {
    permalink = (await call<{ permalink?: string }>("GET", `${GRAPH}/${pub.id}`, { fields: "permalink" }, token)).permalink ?? null;
  } catch {}
  return { done: true, externalId: pub.id, permalink };
}

async function fbPermalink(id: string, token: string, fallback: string) {
  try {
    const p = (await call<{ permalink_url?: string }>("GET", `${GRAPH}/${id}`, { fields: "permalink_url" }, token)).permalink_url;
    if (p) return p.startsWith("http") ? p : `https://www.facebook.com${p}`;
  } catch {}
  return fallback;
}

async function facebookStep(input: PublishInput, state: PublishState): Promise<StepResult> {
  const { externalId: page, token, kind, caption, media } = input;
  if (kind === "reel") {
    if (!state.step) {
      const start = await call<{ video_id: string }>("POST", `${GRAPH}/${page}/video_reels`, { upload_phase: "start" }, token);
      // Meta fetches the file itself from our link (no bytes go through this server).
      const up = await fetch(`${RUPLOAD}/${start.video_id}`, { method: "POST", headers: { Authorization: `OAuth ${token}`, file_url: media[0].url }, signal: AbortSignal.timeout(90_000), cache: "no-store" }).catch(() => null);
      const upJson = (await up?.json().catch(() => null)) as { success?: boolean; error?: { message?: string }; debug_info?: { message?: string } } | null;
      if (!up?.ok || !upJson?.success) throw new MetaError(upJson?.error?.message || upJson?.debug_info?.message || "Facebook couldn't fetch the video from this system's public address (see Configuration).");
      await call("POST", `${GRAPH}/${page}/video_reels`, { upload_phase: "finish", video_id: start.video_id, video_state: "PUBLISHED", description: caption }, token);
      return { done: false, state: { step: "reel", videoId: start.video_id, startedAt: Date.now() } };
    }
    type Phase = { status?: string; errors?: { message?: string }[]; error?: { message?: string } };
    const r = await call<{ status?: { video_status?: string; uploading_phase?: Phase; processing_phase?: Phase; publishing_phase?: Phase } }>("GET", `${GRAPH}/${state.videoId}`, { fields: "status" }, token);
    const s = r.status ?? {};
    for (const ph of [s.uploading_phase, s.processing_phase, s.publishing_phase]) {
      if (ph?.status === "error") throw new MetaError(`Facebook couldn't publish the Reel${ph.errors?.[0]?.message || ph.error?.message ? `: ${ph.errors?.[0]?.message || ph.error?.message}` : "."}`);
    }
    if (s.video_status === "error") throw new MetaError("Facebook couldn't process the Reel. Check the file: MP4, 9:16, 3 to 90 seconds.");
    if (s.publishing_phase?.status !== "complete" && s.video_status !== "ready") return stillWaiting(state);
    return { done: true, externalId: state.videoId!, permalink: `https://www.facebook.com/reel/${state.videoId}` };
  }
  const videos = media.filter((m) => m.kind === "video");
  const images = media.filter((m) => m.kind === "image");
  if (videos.length) {
    const r = await call<{ id: string }>("POST", `${GRAPH_VIDEO}/${page}/videos`, { file_url: videos[0].url, description: caption }, token);
    return { done: true, externalId: r.id, permalink: await fbPermalink(r.id, token, `https://www.facebook.com/${page}/videos/${r.id}`) };
  }
  if (images.length === 1) {
    const r = await call<{ id: string; post_id?: string }>("POST", `${GRAPH}/${page}/photos`, { url: images[0].url, caption }, token);
    const id = r.post_id ?? r.id;
    return { done: true, externalId: id, permalink: await fbPermalink(id, token, `https://www.facebook.com/${id}`) };
  }
  const params: Params = { message: caption };
  if (images.length > 1) {
    let i = 0;
    for (const m of images) {
      const r = await call<{ id: string }>("POST", `${GRAPH}/${page}/photos`, { url: m.url, published: false }, token);
      params[`attached_media[${i++}]`] = JSON.stringify({ media_fbid: r.id });
    }
  }
  const r = await call<{ id: string }>("POST", `${GRAPH}/${page}/feed`, params, token);
  return { done: true, externalId: r.id, permalink: await fbPermalink(r.id, token, `https://www.facebook.com/${r.id}`) };
}

/** One step of publishing. Call it again with the returned state until it says done. Throws MetaError when Meta refuses. */
export function publishStep(input: PublishInput, state: PublishState): Promise<StepResult> {
  return input.platform === "instagram" ? instagramStep(input, state) : facebookStep(input, state);
}

/* ------------------------------ Numbers ------------------------------ */

type Insight = { name: string; values?: { value?: unknown }[]; total_value?: { value?: unknown } };
const valueOf = (d: Insight): unknown => d.values?.[0]?.value ?? d.total_value?.value;
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
/** { like: 3, love: 1 } → 4 */
const sumObj = (v: unknown): number | undefined => (v && typeof v === "object" ? Object.values(v as Record<string, unknown>).reduce<number>((a, x) => a + (typeof x === "number" ? x : 0), 0) : undefined);
const pick = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) {
    const key = Object.keys(o).find((x) => x.toLowerCase() === k);
    if (key && typeof o[key] === "number") return o[key] as number;
  }
  return undefined;
};

/**
 * Ask for several insights at once; if Meta rejects the list (a metric that doesn't apply to this kind of post
 * makes the whole request fail), ask one by one and keep what answers.
 */
async function insights(path: string, metrics: string[], token: string): Promise<Map<string, unknown>> {
  const out = new Map<string, unknown>();
  const read = (r: { data?: Insight[] }) => {
    for (const d of r.data ?? []) out.set(d.name, valueOf(d));
  };
  try {
    read(await call<{ data?: Insight[] }>("GET", `${GRAPH}/${path}`, { metric: metrics.join(",") }, token));
    return out;
  } catch (e) {
    // An invalid token fails every request the same way: no point asking again.
    if (e instanceof MetaError && e.code === 190) throw e;
  }
  let first: unknown = null;
  for (const m of metrics) {
    try {
      read(await call<{ data?: Insight[] }>("GET", `${GRAPH}/${path}`, { metric: m }, token));
    } catch (e) {
      first ??= e;
    }
  }
  if (!out.size && first) throw first;
  return out;
}

const IG_METRICS = {
  reel: ["reach", "views", "likes", "comments", "shares", "saved", "total_interactions", "ig_reels_avg_watch_time", "ig_reels_video_view_total_time", "reels_skip_rate"],
  feed: ["reach", "views", "likes", "comments", "shares", "saved", "total_interactions", "follows", "profile_visits"],
  story: ["reach", "views", "replies", "shares", "total_interactions", "follows", "profile_visits"],
};

export type MetricsInput = { platform: SocialPlatform; externalId: string; token: string; kind: PostKind; video: boolean };

/** The latest numbers for one published post. Each platform returns what it has; missing ones stay empty. */
export async function fetchMetrics(input: MetricsInput): Promise<SocialMetrics> {
  const { platform, externalId: id, token, kind, video } = input;
  const m: SocialMetrics = {};
  if (platform === "instagram") {
    const product = kind === "story" ? "story" : video ? "reel" : "feed";
    const got = await insights(`${id}/insights`, IG_METRICS[product], token);
    m.reach = num(got.get("reach"));
    m.views = num(got.get("views"));
    m.likes = num(got.get("likes"));
    m.comments = num(got.get("comments"));
    m.shares = num(got.get("shares"));
    m.saves = num(got.get("saved"));
    m.interactions = num(got.get("total_interactions"));
    m.follows = num(got.get("follows"));
    m.profileVisits = num(got.get("profile_visits"));
    m.replies = num(got.get("replies"));
    m.avgWatchMs = num(got.get("ig_reels_avg_watch_time"));
    m.watchTimeMs = num(got.get("ig_reels_video_view_total_time"));
    const skip = num(got.get("reels_skip_rate"));
    // Meta may send the rate as a fraction (0.42) or as a percentage (42).
    if (skip !== undefined) m.skipRate = skip <= 1 ? skip * 100 : skip;
    if (kind !== "story" && (m.likes === undefined || m.comments === undefined)) {
      try {
        const r = await call<{ like_count?: number; comments_count?: number }>("GET", `${GRAPH}/${id}`, { fields: "like_count,comments_count" }, token);
        m.likes ??= num(r.like_count);
        m.comments ??= num(r.comments_count);
      } catch {}
    }
  } else if (video) {
    // A Page video or Reel: its ID is a video ID.
    try {
      const r = await call<{ likes?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } }; views?: number }>("GET", `${GRAPH}/${id}`, { fields: "likes.summary(total_count).limit(0),comments.summary(total_count).limit(0),views" }, token);
      m.likes = num(r.likes?.summary?.total_count);
      m.comments = num(r.comments?.summary?.total_count);
      m.views = num(r.views);
    } catch {}
    const r = await call<{ data?: Insight[] }>("GET", `${GRAPH}/${id}/video_insights`, {}, token);
    const got = new Map((r.data ?? []).map((d) => [d.name, valueOf(d)]));
    const first = (...names: string[]) => {
      for (const n of names) {
        const v = num(got.get(n));
        if (v !== undefined) return v;
      }
      return undefined;
    };
    m.reach = first("post_total_media_view_unique", "post_impressions_unique") ?? m.reach;
    m.views = first("post_media_view", "fb_reels_total_plays", "blue_reels_play_count", "total_video_views", "post_video_views") ?? m.views;
    m.avgWatchMs = first("post_video_avg_time_watched", "total_video_avg_time_watched");
    m.watchTimeMs = first("post_video_view_time", "total_video_view_total_time");
    m.likes = sumObj(got.get("post_video_likes_by_reaction_type")) ?? sumObj(got.get("total_video_reactions_by_type_total")) ?? m.likes;
    const actions = (got.get("post_video_social_actions") ?? got.get("total_video_stories_by_action_type")) as Record<string, unknown> | undefined;
    if (actions && typeof actions === "object") {
      m.comments = pick(actions, "comment") ?? m.comments;
      m.shares = pick(actions, "share") ?? m.shares;
    }
  } else {
    const r = await call<{ reactions?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } }; shares?: { count?: number } }>("GET", `${GRAPH}/${id}`, { fields: "reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares" }, token);
    m.likes = num(r.reactions?.summary?.total_count);
    m.comments = num(r.comments?.summary?.total_count);
    m.shares = num(r.shares?.count) ?? 0;
    try {
      const got = await insights(`${id}/insights`, ["post_total_media_view_unique", "post_media_view", "post_clicks"], token);
      m.reach = num(got.get("post_total_media_view_unique"));
      m.views = num(got.get("post_media_view"));
      m.clicks = num(got.get("post_clicks"));
    } catch {}
  }
  if (m.interactions === undefined && (m.likes !== undefined || m.comments !== undefined)) m.interactions = (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0);
  // Drop the empty ones so the stored record only holds real numbers.
  return Object.fromEntries(Object.entries(m).filter(([, v]) => typeof v === "number")) as SocialMetrics;
}
