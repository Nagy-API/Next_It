/**
 * Social media schedule — the rules, with no database (used by the server and by the screens).
 *
 * A post goes to one or more channels (a Facebook Page, an Instagram professional account). Each platform has its
 * own limits; `checkPost` says in plain words what's wrong before anything is sent to Meta.
 */

export const SOCIAL_PLATFORMS = ["facebook", "instagram"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export const PLATFORM_LABEL: Record<SocialPlatform, string> = { facebook: "Facebook", instagram: "Instagram" };

/** Remembers which brand's schedule the person is looking at (the switcher at the top of the section). */
export const SOCIAL_BRAND_COOKIE = "social_brand";

export const POST_KINDS = ["post", "reel", "story"] as const;
export type PostKind = (typeof POST_KINDS)[number];
export const KIND_LABEL: Record<PostKind, string> = { post: "Post", reel: "Reel", story: "Story" };

export const POST_STATUSES = ["draft", "scheduled", "publishing", "published", "partial", "failed"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];
export const STATUS_LABEL: Record<PostStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  publishing: "Publishing",
  published: "Published",
  partial: "Partly published",
  failed: "Didn't publish",
};
/** One colour per status, the same on the calendar, the lists and the post page. */
export const STATUS_COLOR: Record<PostStatus, string> = {
  draft: "#64748b",
  scheduled: "#3b82f6",
  publishing: "#c77700",
  published: "#0f9d6b",
  partial: "#e0620f",
  failed: "#d63a3a",
};

export type PostOptions = {
  /** Instagram Reel: also show it in the profile grid (on by default). */
  shareToFeed?: boolean;
};

/** Files the library takes, by extension → the type we serve them as. Kept exactly as uploaded. */
export const MEDIA_TYPES: Record<string, { mime: string; kind: "image" | "video" }> = {
  jpg: { mime: "image/jpeg", kind: "image" },
  jpeg: { mime: "image/jpeg", kind: "image" },
  png: { mime: "image/png", kind: "image" },
  mp4: { mime: "video/mp4", kind: "video" },
  mov: { mime: "video/quicktime", kind: "video" },
};
export const MEDIA_ACCEPT = Object.keys(MEDIA_TYPES)
  .map((e) => `.${e}`)
  .join(",");
export const MB = 1024 * 1024;
/** The biggest file the library takes (Instagram's own limits are lower, see LIMITS). */
export const MAX_MEDIA_BYTES = 1024 * MB;
/** Uploads travel in pieces this big, so a slow connection or a host limit never breaks a large video. */
export const UPLOAD_CHUNK_BYTES = 4 * MB;

export const LIMITS = {
  instagram: { caption: 2200, hashtags: 30, carousel: 10, imageBytes: 8 * MB, reelBytes: 300 * MB, storyVideoBytes: 100 * MB, minRatio: 4 / 5, maxRatio: 1.91 },
  facebook: { caption: 63206, photos: 10 },
} as const;

export function extOf(name: string) {
  return name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
}

export function formatBytes(n: number) {
  if (n >= 1024 * MB) return `${(n / (1024 * MB)).toFixed(2)} GB`;
  if (n >= MB) return `${(n / MB).toFixed(n >= 100 * MB ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export type MediaLite = { id: string; kind: "image" | "video"; mime: string; size: number; width: number | null; height: number | null; name: string };

/**
 * What stops this post from going out, in plain words (empty = fine). `strict` = it is being scheduled or
 * posted now; a draft only needs the basics.
 */
export function checkPost(input: { kind: PostKind; caption: string; media: MediaLite[]; platforms: SocialPlatform[] }, strict = true): string[] {
  const out: string[] = [];
  const { kind, caption, media, platforms } = input;
  const images = media.filter((m) => m.kind === "image");
  const videos = media.filter((m) => m.kind === "video");
  if (!strict) return out;
  if (!platforms.length) out.push("Choose at least one channel.");
  if (kind === "reel") {
    if (media.length !== 1 || videos.length !== 1) out.push("A Reel is exactly one video.");
  } else if (kind === "story") {
    if (media.length !== 1) out.push("A Story is exactly one photo or one video.");
    if (platforms.includes("facebook")) out.push("Stories go to Instagram only for now — untick the Facebook channel.");
  } else {
    if (!media.length && !caption.trim()) out.push("Write something or add a photo or video.");
    if (videos.length > 1 && platforms.includes("facebook")) out.push("A Facebook post takes one video (or several photos).");
    if (videos.length && images.length && platforms.includes("facebook")) out.push("A Facebook post is either photos or one video, not both.");
  }
  if (platforms.includes("instagram")) {
    const L = LIMITS.instagram;
    if (!media.length) out.push("Instagram needs a photo or a video — it can't publish text alone.");
    if (kind === "post" && media.length > L.carousel) out.push(`Instagram takes up to ${L.carousel} photos and videos in one post.`);
    if (caption.length > L.caption) out.push(`The caption is ${caption.length} characters; Instagram's limit is ${L.caption}.`);
    const tags = caption.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0;
    if (tags > L.hashtags) out.push(`${tags} hashtags; Instagram's limit is ${L.hashtags}.`);
    for (const m of images) {
      if (m.mime !== "image/jpeg") out.push(`“${m.name}” is a PNG. Instagram only takes JPG photos — export it as JPG.`);
      if (m.size > L.imageBytes) out.push(`“${m.name}” is ${formatBytes(m.size)}; Instagram's limit for a photo is 8 MB.`);
      if (kind === "post" && m.width && m.height) {
        const r = m.width / m.height;
        if (r < L.minRatio - 0.01 || r > L.maxRatio + 0.01) out.push(`“${m.name}” is ${m.width}×${m.height}. In the feed Instagram takes shapes from 4:5 (tall) to 1.91:1 (wide).`);
      }
    }
    for (const m of videos) {
      const cap = kind === "story" ? L.storyVideoBytes : L.reelBytes;
      if (m.size > cap) out.push(`“${m.name}” is ${formatBytes(m.size)}; Instagram's limit for a ${kind === "story" ? "Story video is 100 MB" : "video is 300 MB"}.`);
    }
  }
  if (platforms.includes("facebook")) {
    if (kind === "post" && images.length > LIMITS.facebook.photos) out.push(`Keep a Facebook post to ${LIMITS.facebook.photos} photos.`);
  }
  return [...new Set(out)];
}

/* ------------------------------ Numbers ------------------------------ */

/** The numbers we keep per published post. Every one is optional: each platform gives what it has. */
export type SocialMetrics = {
  reach?: number;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  interactions?: number;
  clicks?: number;
  follows?: number;
  profileVisits?: number;
  replies?: number;
  /** Average watch time, milliseconds (videos). */
  avgWatchMs?: number;
  /** Total watch time, milliseconds (videos). */
  watchTimeMs?: number;
  /** Share of views that left in the first 3 seconds, 0–100 (Instagram Reels only). */
  skipRate?: number;
};
export type MetricKey = keyof SocialMetrics;

export const METRIC_META: Record<MetricKey, { label: string; hint: string; unit?: "ms" | "pct" }> = {
  reach: { label: "Reach", hint: "Different accounts that saw it" },
  views: { label: "Views", hint: "Times it was shown or played" },
  likes: { label: "Likes", hint: "Likes and reactions" },
  comments: { label: "Comments", hint: "" },
  shares: { label: "Shares", hint: "" },
  saves: { label: "Saves", hint: "Instagram only" },
  interactions: { label: "Interactions", hint: "Likes, comments, shares and saves together" },
  clicks: { label: "Clicks", hint: "Facebook only" },
  follows: { label: "Follows", hint: "New followers from this post (Instagram)" },
  profileVisits: { label: "Profile visits", hint: "Instagram only" },
  replies: { label: "Replies", hint: "Stories" },
  avgWatchMs: { label: "Average watch time", hint: "How long people stay on the video", unit: "ms" },
  watchTimeMs: { label: "Total watch time", hint: "", unit: "ms" },
  skipRate: { label: "Skip rate", hint: "Views that left in the first 3 seconds (Instagram Reels)", unit: "pct" },
};
export const METRIC_KEYS = Object.keys(METRIC_META) as MetricKey[];
/** Shown first, everywhere. */
export const HEADLINE_METRICS: MetricKey[] = ["reach", "views", "likes", "comments", "shares", "saves", "skipRate"];

export function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}K`;
  return n.toLocaleString("en-US");
}

function watch(ms: number) {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${Math.round(s % 60)}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function formatMetric(key: MetricKey, value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const unit = METRIC_META[key].unit;
  if (unit === "ms") return watch(value);
  if (unit === "pct") return `${value.toFixed(value < 10 ? 1 : 0)}%`;
  return compact(value);
}

/** Interactions ÷ reach, as a percentage (null when there's no reach yet). */
export function engagementRate(m: SocialMetrics | null | undefined): number | null {
  if (!m?.reach) return null;
  const inter = m.interactions ?? (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0);
  return (inter / m.reach) * 100;
}

/** Add up the numbers of several channels (rates are averaged, weighted by views). */
export function sumMetrics(list: (SocialMetrics | null | undefined)[]): SocialMetrics {
  const out: SocialMetrics = {};
  let skipW = 0;
  let skipSum = 0;
  let avgW = 0;
  let avgSum = 0;
  for (const m of list) {
    if (!m) continue;
    for (const k of METRIC_KEYS) {
      const v = m[k];
      if (typeof v !== "number") continue;
      if (k === "skipRate") {
        const w = m.views || 1;
        skipW += w;
        skipSum += v * w;
      } else if (k === "avgWatchMs") {
        const w = m.views || 1;
        avgW += w;
        avgSum += v * w;
      } else out[k] = (out[k] ?? 0) + v;
    }
  }
  if (skipW) out.skipRate = skipSum / skipW;
  if (avgW) out.avgWatchMs = avgSum / avgW;
  return out;
}
