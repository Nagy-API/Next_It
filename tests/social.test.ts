import { afterEach, describe, expect, it, vi } from "vitest";
import { checkPost, engagementRate, formatMetric, sumMetrics, type MediaLite } from "@/domain/social";
import { MetaError, fetchMetrics, publishStep, type PublishState } from "@/server/social-meta";

/**
 * Social media schedule: the rules (no database) and the conversation with Meta, with Meta played by a stub —
 * so the order of calls, the parameters and the reading of the answers are checked without a real account.
 */
const img = (over: Partial<MediaLite> = {}): MediaLite => ({ id: "i", kind: "image", mime: "image/jpeg", size: 500_000, width: 1080, height: 1350, name: "a.jpg", ...over });
const vid = (over: Partial<MediaLite> = {}): MediaLite => ({ id: "v", kind: "video", mime: "video/mp4", size: 20_000_000, width: null, height: null, name: "a.mp4", ...over });

describe("checkPost", () => {
  it("accepts a normal photo post to both platforms", () => {
    expect(checkPost({ kind: "post", caption: "Hello", media: [img()], platforms: ["facebook", "instagram"] })).toEqual([]);
  });
  it("Instagram: needs media, JPG only, 8 MB, feed shapes, caption and hashtag limits", () => {
    expect(checkPost({ kind: "post", caption: "Hi", media: [], platforms: ["instagram"] }).join()).toMatch(/needs a photo or a video/);
    expect(checkPost({ kind: "post", caption: "", media: [img({ mime: "image/png", name: "a.png" })], platforms: ["instagram"] }).join()).toMatch(/only takes JPG/);
    expect(checkPost({ kind: "post", caption: "", media: [img({ size: 9 * 1024 * 1024 })], platforms: ["instagram"] }).join()).toMatch(/8 MB/);
    expect(checkPost({ kind: "post", caption: "", media: [img({ width: 1080, height: 1920 })], platforms: ["instagram"] }).join()).toMatch(/4:5/);
    expect(checkPost({ kind: "post", caption: "x".repeat(2201), media: [img()], platforms: ["instagram"] }).join()).toMatch(/2200/);
    expect(checkPost({ kind: "post", caption: Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" "), media: [img()], platforms: ["instagram"] }).join()).toMatch(/31 hashtags/);
    // PNG is fine on Facebook.
    expect(checkPost({ kind: "post", caption: "", media: [img({ mime: "image/png", name: "a.png" })], platforms: ["facebook"] })).toEqual([]);
  });
  it("a Reel is one video; a Story is one file and Instagram only", () => {
    expect(checkPost({ kind: "reel", caption: "", media: [img()], platforms: ["instagram"] }).join()).toMatch(/exactly one video/);
    expect(checkPost({ kind: "reel", caption: "", media: [vid()], platforms: ["facebook", "instagram"] })).toEqual([]);
    expect(checkPost({ kind: "reel", caption: "", media: [vid({ size: 301 * 1024 * 1024 })], platforms: ["instagram"] }).join()).toMatch(/300 MB/);
    expect(checkPost({ kind: "story", caption: "", media: [img({ width: 1080, height: 1920 })], platforms: ["instagram"] })).toEqual([]);
    expect(checkPost({ kind: "story", caption: "", media: [img()], platforms: ["facebook"] }).join()).toMatch(/Instagram only/);
  });
  it("a draft isn't checked; no channel is a problem when scheduling", () => {
    expect(checkPost({ kind: "post", caption: "", media: [], platforms: [] }, false)).toEqual([]);
    expect(checkPost({ kind: "post", caption: "Hi", media: [], platforms: [] }).join()).toMatch(/at least one channel/);
  });
});

describe("numbers", () => {
  it("adds channels up, averages rates by views, and formats", () => {
    const s = sumMetrics([{ reach: 100, views: 300, likes: 10, skipRate: 40, avgWatchMs: 6000 }, { reach: 50, views: 100, likes: 5, skipRate: 20, avgWatchMs: 2000 }, null]);
    expect(s).toMatchObject({ reach: 150, views: 400, likes: 15 });
    expect(s.skipRate).toBeCloseTo(35);
    expect(s.avgWatchMs).toBeCloseTo(5000);
    expect(engagementRate({ reach: 200, likes: 10, comments: 5, shares: 3, saves: 2 })).toBeCloseTo(10);
    expect(engagementRate({ likes: 3 })).toBeNull();
    expect(formatMetric("reach", 12_900)).toBe("12.9K");
    expect(formatMetric("reach", 940)).toBe("940");
    expect(formatMetric("skipRate", 38.5)).toBe("39%");
    expect(formatMetric("avgWatchMs", 6400)).toBe("6.4s");
    expect(formatMetric("likes", undefined)).toBe("—");
  });
});

/* ------------------------------ Meta, played by a stub ------------------------------ */

type Call = { method: string; host: string; path: string; params: Record<string, string>; headers: Record<string, string> };

function stubMeta(answer: (c: Call) => unknown) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      const params = Object.fromEntries(init?.body instanceof URLSearchParams ? init.body : u.searchParams);
      const c: Call = { method: init?.method ?? "GET", host: u.host, path: u.pathname.replace(/^\/v[\d.]+/, ""), params, headers: (init?.headers ?? {}) as Record<string, string> };
      calls.push(c);
      const body = answer(c);
      const failed = !!(body as { error?: unknown })?.error;
      return new Response(JSON.stringify(body), { status: failed ? 400 : 200 });
    }),
  );
  return calls;
}

/** Run publishStep until it's done, like the queue does on its runs. */
async function publish(input: Parameters<typeof publishStep>[0]) {
  let state: PublishState = {};
  for (let i = 0; i < 10; i++) {
    const r = await publishStep(input, state);
    if (r.done) return r;
    state = r.state;
  }
  throw new Error("never finished");
}

const base = { token: "TOKEN", caption: "Hello #nexora", options: {} };
afterEach(() => vi.unstubAllGlobals());

describe("publishing to Instagram", () => {
  it("a photo: container → wait until FINISHED → publish → permalink", async () => {
    let checks = 0;
    const calls = stubMeta((c) => {
      if (c.method === "POST" && c.path === "/IG/media") return { id: "C1" };
      if (c.method === "GET" && c.path === "/C1") return { status_code: ++checks < 2 ? "IN_PROGRESS" : "FINISHED" };
      if (c.path === "/IG/media_publish") return { id: "M1" };
      if (c.path === "/M1") return { permalink: "https://www.instagram.com/p/abc/" };
      return { error: { message: `unexpected ${c.method} ${c.path}` } };
    });
    const r = await publish({ ...base, platform: "instagram", externalId: "IG", kind: "post", media: [{ kind: "image", url: "https://ops.test/api/social/file/1?k=a" }] });
    expect(r).toEqual({ done: true, externalId: "M1", permalink: "https://www.instagram.com/p/abc/" });
    expect(calls[0].params).toMatchObject({ image_url: "https://ops.test/api/social/file/1?k=a", caption: "Hello #nexora", access_token: "TOKEN" });
    expect(calls.filter((c) => c.path === "/IG/media")).toHaveLength(1); // the container is made once, not on every run
    expect(calls.find((c) => c.path === "/IG/media_publish")!.params.creation_id).toBe("C1");
  });
  it("a Reel is sent as REELS with share_to_feed; a single video in a post too", async () => {
    const calls = stubMeta((c) => (c.path === "/IG/media" ? { id: "C" } : c.path === "/C" ? { status_code: "FINISHED" } : c.path === "/IG/media_publish" ? { id: "M" } : { permalink: "p" }));
    await publish({ ...base, platform: "instagram", externalId: "IG", kind: "reel", options: { shareToFeed: false }, media: [{ kind: "video", url: "https://x/v" }] });
    expect(calls[0].params).toMatchObject({ media_type: "REELS", video_url: "https://x/v", share_to_feed: "false" });
    calls.length = 0;
    await publish({ ...base, platform: "instagram", externalId: "IG", kind: "post", media: [{ kind: "video", url: "https://x/v" }] });
    expect(calls[0].params).toMatchObject({ media_type: "REELS", share_to_feed: "true" });
  });
  it("several photos become a carousel: children first, then the album", async () => {
    let n = 0;
    const calls = stubMeta((c) => {
      if (c.method === "POST" && c.path === "/IG/media") return { id: c.params.media_type === "CAROUSEL" ? "ALBUM" : `K${++n}` };
      if (c.method === "GET" && /^\/(K\d|ALBUM)$/.test(c.path)) return { status_code: "FINISHED" };
      if (c.path === "/IG/media_publish") return { id: "M" };
      return { permalink: "p" };
    });
    await publish({ ...base, platform: "instagram", externalId: "IG", kind: "post", media: [{ kind: "image", url: "u1" }, { kind: "video", url: "u2" }, { kind: "image", url: "u3" }] });
    const made = calls.filter((c) => c.method === "POST" && c.path === "/IG/media");
    expect(made.map((c) => c.params.is_carousel_item)).toEqual(["true", "true", "true", undefined]);
    expect(made[1].params).toMatchObject({ media_type: "VIDEO", video_url: "u2" });
    expect(made[0].params.caption).toBeUndefined();
    expect(made[3].params).toMatchObject({ media_type: "CAROUSEL", children: "K1,K2,K3", caption: "Hello #nexora" });
  });
  it("a Story has no caption", async () => {
    const calls = stubMeta((c) => (c.path === "/IG/media" ? { id: "C" } : c.path === "/C" ? { status_code: "FINISHED" } : c.path === "/IG/media_publish" ? { id: "M" } : { permalink: "p" }));
    await publish({ ...base, platform: "instagram", externalId: "IG", kind: "story", media: [{ kind: "image", url: "u" }] });
    expect(calls[0].params).toMatchObject({ media_type: "STORIES", image_url: "u" });
    expect(calls[0].params.caption).toBeUndefined();
  });
  it("Meta's own sentence comes back when it refuses, and a failed container stops", async () => {
    stubMeta(() => ({ error: { message: "Invalid OAuth access token.", code: 190 } }));
    const e = await publish({ ...base, platform: "instagram", externalId: "IG", kind: "post", media: [{ kind: "image", url: "u" }] }).catch((x) => x);
    expect(e).toBeInstanceOf(MetaError);
    expect(e.message).toBe("Invalid OAuth access token.");
    expect(e.tokenProblem).toBe(true);
    stubMeta((c) => (c.path === "/IG/media" ? { id: "C" } : { status_code: "ERROR", status: "Error: unsupported format" }));
    await expect(publish({ ...base, platform: "instagram", externalId: "IG", kind: "reel", media: [{ kind: "video", url: "u" }] })).rejects.toThrow(/couldn't process the file: Error: unsupported format/);
  });
});

describe("publishing to Facebook", () => {
  it("text only → the feed", async () => {
    const calls = stubMeta((c) => (c.path === "/PAGE/feed" ? { id: "PAGE_1" } : { permalink_url: "https://www.facebook.com/PAGE/posts/1" }));
    const r = await publish({ ...base, platform: "facebook", externalId: "PAGE", kind: "post", media: [] });
    expect(r).toEqual({ done: true, externalId: "PAGE_1", permalink: "https://www.facebook.com/PAGE/posts/1" });
    expect(calls[0]).toMatchObject({ method: "POST", path: "/PAGE/feed", params: { message: "Hello #nexora" } });
  });
  it("one photo → /photos with the caption; several → unpublished photos attached to one feed post", async () => {
    let calls = stubMeta((c) => (c.path === "/PAGE/photos" ? { id: "PH", post_id: "PAGE_9" } : { permalink_url: "/PAGE/posts/9" }));
    const one = await publish({ ...base, platform: "facebook", externalId: "PAGE", kind: "post", media: [{ kind: "image", url: "u1" }] });
    expect(one).toMatchObject({ externalId: "PAGE_9", permalink: "https://www.facebook.com/PAGE/posts/9" });
    expect(calls[0].params).toMatchObject({ url: "u1", caption: "Hello #nexora" });
    let n = 0;
    calls = stubMeta((c) => (c.path === "/PAGE/photos" ? { id: `PH${++n}` } : c.path === "/PAGE/feed" ? { id: "PAGE_7" } : { permalink_url: "https://fb/7" }));
    await publish({ ...base, platform: "facebook", externalId: "PAGE", kind: "post", media: [{ kind: "image", url: "u1" }, { kind: "image", url: "u2" }] });
    expect(calls.filter((c) => c.path === "/PAGE/photos").map((c) => c.params.published)).toEqual(["false", "false"]);
    const feed = calls.find((c) => c.path === "/PAGE/feed")!;
    expect(feed.params).toMatchObject({ message: "Hello #nexora", "attached_media[0]": '{"media_fbid":"PH1"}', "attached_media[1]": '{"media_fbid":"PH2"}' });
  });
  it("a video → graph-video with file_url", async () => {
    const calls = stubMeta((c) => (c.path === "/PAGE/videos" ? { id: "V1" } : { permalink_url: "/PAGE/videos/V1/" }));
    const r = await publish({ ...base, platform: "facebook", externalId: "PAGE", kind: "post", media: [{ kind: "video", url: "https://x/v" }] });
    expect(calls[0]).toMatchObject({ host: "graph-video.facebook.com", params: { file_url: "https://x/v", description: "Hello #nexora" } });
    expect(r).toMatchObject({ externalId: "V1", permalink: "https://www.facebook.com/PAGE/videos/V1/" });
  });
  it("a Reel: start → Meta fetches the file → finish → wait until it is published", async () => {
    let polls = 0;
    const calls = stubMeta((c) => {
      if (c.path === "/PAGE/video_reels" && c.params.upload_phase === "start") return { video_id: "R1" };
      if (c.host === "rupload.facebook.com") return { success: true };
      if (c.path === "/PAGE/video_reels") return { success: true };
      if (c.path === "/R1") return { status: { video_status: "processing", publishing_phase: { status: ++polls < 3 ? "not_started" : "complete" } } };
      return { error: { message: "unexpected" } };
    });
    const r = await publish({ ...base, platform: "facebook", externalId: "PAGE", kind: "reel", media: [{ kind: "video", url: "https://x/v" }] });
    expect(r).toEqual({ done: true, externalId: "R1", permalink: "https://www.facebook.com/reel/R1" });
    const up = calls.find((c) => c.host === "rupload.facebook.com")!;
    expect(up.path).toMatch(/^\/video-upload\/v[\d.]+\/R1$/);
    expect(up.headers).toMatchObject({ Authorization: "OAuth TOKEN", file_url: "https://x/v" });
    expect(calls.filter((c) => c.params.upload_phase === "start")).toHaveLength(1); // started once, then only status checks
    expect(calls.find((c) => c.params.upload_phase === "finish")!.params).toMatchObject({ video_id: "R1", video_state: "PUBLISHED", description: "Hello #nexora" });
  });
});

describe("reading the numbers", () => {
  it("an Instagram Reel, including skip rate sent as a fraction", async () => {
    const calls = stubMeta(() => ({
      data: [
        { name: "reach", values: [{ value: 8420 }] },
        { name: "views", values: [{ value: 12950 }] },
        { name: "likes", values: [{ value: 640 }] },
        { name: "comments", values: [{ value: 48 }] },
        { name: "shares", values: [{ value: 73 }] },
        { name: "saved", values: [{ value: 122 }] },
        { name: "total_interactions", values: [{ value: 883 }] },
        { name: "ig_reels_avg_watch_time", values: [{ value: 6400 }] },
        { name: "reels_skip_rate", total_value: { value: 0.385 } },
      ],
    }));
    const m = await fetchMetrics({ platform: "instagram", externalId: "M1", token: "T", kind: "reel", video: true });
    expect(m).toEqual({ reach: 8420, views: 12950, likes: 640, comments: 48, shares: 73, saves: 122, interactions: 883, avgWatchMs: 6400, skipRate: 38.5 });
    expect(calls[0].params.metric).toContain("reels_skip_rate");
  });
  it("when Meta rejects the list, each number is asked for on its own and the working ones are kept", async () => {
    const calls = stubMeta((c) => {
      if (c.path === "/M1/insights") {
        if (c.params.metric.includes(",")) return { error: { message: "(#100) metric not supported", code: 100 } };
        if (c.params.metric === "reach") return { data: [{ name: "reach", values: [{ value: 10 }] }] };
        if (c.params.metric === "views") return { data: [{ name: "views", values: [{ value: 30 }] }] };
        return { error: { message: "(#100) not supported", code: 100 } };
      }
      return { like_count: 4, comments_count: 1 };
    });
    const m = await fetchMetrics({ platform: "instagram", externalId: "M1", token: "T", kind: "post", video: false });
    expect(m).toEqual({ reach: 10, views: 30, likes: 4, comments: 1, interactions: 5 });
    expect(calls.length).toBeGreaterThan(3);
  });
  it("a Facebook post and a Facebook video", async () => {
    stubMeta((c) => {
      if (c.path === "/P1") return { reactions: { summary: { total_count: 96 } }, comments: { summary: { total_count: 11 } }, shares: { count: 9 } };
      return { data: [{ name: "post_total_media_view_unique", values: [{ value: 2310 }] }, { name: "post_media_view", values: [{ value: 3120 }] }, { name: "post_clicks", values: [{ value: 40 }] }] };
    });
    expect(await fetchMetrics({ platform: "facebook", externalId: "P1", token: "T", kind: "post", video: false })).toEqual({ likes: 96, comments: 11, shares: 9, reach: 2310, views: 3120, clicks: 40, interactions: 116 });
    stubMeta((c) => {
      if (c.path === "/V1") return { likes: { summary: { total_count: 5 } }, comments: { summary: { total_count: 2 } }, views: 100 };
      return { data: [{ name: "post_impressions_unique", values: [{ value: 800 }] }, { name: "fb_reels_total_plays", values: [{ value: 950 }] }, { name: "post_video_avg_time_watched", values: [{ value: 4100 }] }, { name: "post_video_likes_by_reaction_type", values: [{ value: { REACTION_LIKE: 20, REACTION_LOVE: 3 } }] }, { name: "post_video_social_actions", values: [{ value: { COMMENT: 6, SHARE: 4 } }] }] };
    });
    expect(await fetchMetrics({ platform: "facebook", externalId: "V1", token: "T", kind: "reel", video: true })).toEqual({ reach: 800, views: 950, avgWatchMs: 4100, likes: 23, comments: 6, shares: 4, interactions: 33 });
  });
});
