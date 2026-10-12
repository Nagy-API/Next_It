import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { closeDb, db } from "@/db";
import { notifications, socialAccounts, socialMetricSnapshots, socialPostTargets, socialPosts } from "@/db/schema";
import { can } from "@/domain/permissions";
import { addDays, todayISO } from "@/lib/dates";
import { KEEP_AFTER_PUBLISH_MS, KEEP_UNUSED_MS, appendUpload, cleanupMedia, connectAccounts, deleteMedia, deletePost, discoverAccounts, getPost, keyMatches, listAccounts, listMedia, movePost, readMedia, readThumb, retryPost, savePost, saveSocialConfig, setMediaThumb, startUpload } from "@/server/social";
import { publishDue, refreshMetrics } from "@/server/social-queue";
import { makeBrand, makeManager, makeUser, uid } from "./helpers";

/**
 * Social media schedule against the real database, with Meta played by a stub: connecting channels, the media
 * library, scheduling, the publishing run (success, failure + notification, try again), the numbers, and the
 * clean-up that removes files from the server once their post is out.
 */
type Call = { method: string; host: string; path: string; params: Record<string, string> };
let calls: Call[] = [];
let meta: (c: Call) => unknown = () => ({});

beforeAll(() => {
  process.env.FILES_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-social-"));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      const c: Call = { method: init?.method ?? "GET", host: u.host, path: u.pathname.replace(/^\/v[\d.]+/, ""), params: Object.fromEntries(init?.body instanceof URLSearchParams ? init.body : u.searchParams) };
      calls.push(c);
      const body = meta(c);
      return new Response(JSON.stringify(body), { status: (body as { error?: unknown })?.error ? 400 : 200 });
    }),
  );
});
afterEach(() => {
  calls = [];
});
afterAll(async () => {
  vi.unstubAllGlobals();
  fs.rmSync(process.env.FILES_DIR!, { recursive: true, force: true });
  await closeDb();
});

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]);

async function world() {
  const admin = await makeUser("Shahenda", ["leadership"], true, true);
  const social = await makeUser("Esraa", ["social"]);
  const writer = await makeUser("King", ["content"]);
  const brand = await makeBrand("Vanilla", admin.id);
  const s = uid();
  const page = `PAGE${s}`;
  const ig = `IG${s}`;
  await saveSocialConfig(admin, { appId: "1234567890123456", appSecret: "0123456789abcdef0123456789abcdef", publicUrl: "https://ops.test/" });
  meta = (c) => (c.path === "/oauth/access_token" ? { access_token: "LONG" } : { data: [{ id: page, name: "Vanilla Roza", access_token: `PAGETOKEN-${s}`, instagram_business_account: { id: ig, username: "vanillaroza" } }] });
  const found = await discoverAccounts(admin, "E".repeat(120));
  await connectAccounts(admin, [{ pageId: found[0].pageId, brandId: brand.id, facebook: true, instagram: true }]);
  const accounts = (await listAccounts()).filter((a) => a.brandId === brand.id);
  return { admin, social, writer, brand, page, ig, token: `PAGETOKEN-${s}`, accounts, fb: accounts.find((a) => a.platform === "facebook")!, insta: accounts.find((a) => a.platform === "instagram")! };
}

async function upload(actor: { id: string; name: string }, name = "photo.jpg", bytes = JPEG) {
  const { id } = await startUpload(actor, { name, size: bytes.length, width: 1080, height: 1350 });
  const half = Math.floor(bytes.length / 2);
  expect(await appendUpload(actor, id, 0, bytes.subarray(0, half))).toEqual({ received: half, done: false });
  // The same piece sent twice (a retry) is not written twice.
  expect(await appendUpload(actor, id, 0, bytes.subarray(0, half))).toEqual({ received: half, done: false });
  expect(await appendUpload(actor, id, half, bytes.subarray(half))).toEqual({ received: bytes.length, done: true });
  return id;
}

describe("who may use it", () => {
  it("the social team and managers schedule; only admins connect accounts", async () => {
    const w = await world();
    expect(can.scheduleSocial(w.social)).toBe(true);
    expect(can.scheduleSocial(w.admin)).toBe(true);
    expect(can.scheduleSocial(w.writer)).toBe(false);
    expect(can.configureSocial(w.social)).toBe(false);
    expect(can.configureSocial(await makeManager("Ammar", ["content"]))).toBe(false);
    await expect(savePost(w.writer, { brandId: null, kind: "post", caption: "x", mediaIds: [], accountIds: [], day: null, time: null, options: {}, mode: "draft" })).rejects.toThrow(/permission/);
    await expect(saveSocialConfig(w.social, { appId: "", appSecret: "", publicUrl: "" })).rejects.toThrow(/permission/);
    await expect(discoverAccounts(w.social, "E".repeat(120))).rejects.toThrow(/permission/);
  });
});

describe("connecting", () => {
  it("keeps one row per channel, never the token in the clear, and refreshes it on reconnect", async () => {
    const w = await world();
    expect(w.accounts.map((a) => a.platform).sort()).toEqual(["facebook", "instagram"]);
    expect(w.insta.username).toBe("vanillaroza");
    const [row] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, w.fb.id));
    expect(row.tokenEnc).not.toContain("PAGETOKEN");
    expect(row.tokenEnc.startsWith("v1.")).toBe(true);
    // The exchange for a long-lived token used the app's ID and secret.
    expect(calls.find((c) => c.path === "/oauth/access_token")!.params).toMatchObject({ grant_type: "fb_exchange_token", client_id: "1234567890123456", client_secret: "0123456789abcdef0123456789abcdef" });
    meta = (c) => (c.path === "/oauth/access_token" ? { access_token: "LONG" } : { data: [{ id: w.page, name: "Vanilla Roza (new name)", access_token: "NEWTOKEN" }] });
    const again = await discoverAccounts(w.admin, "E".repeat(120));
    expect(again[0].connected).toEqual({ facebook: true, instagram: false });
    await connectAccounts(w.admin, [{ pageId: w.page, brandId: w.brand.id, facebook: true, instagram: false }]);
    const after = (await listAccounts()).filter((a) => a.brandId === w.brand.id && a.platform === "facebook");
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: w.fb.id, name: "Vanilla Roza (new name)" });
  });
});

describe("the media library", () => {
  it("stores the file byte for byte, refuses a renamed file, and serves it to Meta only with its key", async () => {
    const w = await world();
    const id = await upload(w.social);
    const found = (await readMedia(id))!;
    expect(fs.readFileSync(found.file).equals(JPEG)).toBe(true);
    expect(keyMatches(found.m, found.m.publicKey)).toBe(true);
    expect(keyMatches(found.m, "wrong")).toBe(false);
    expect(keyMatches(found.m, null)).toBe(false);
    await expect(startUpload(w.social, { name: "virus.exe", size: 10 })).rejects.toThrow(/JPG and PNG/);
    const fake = await startUpload(w.social, { name: "fake.jpg", size: 100 });
    await expect(appendUpload(w.social, fake.id, 0, Buffer.alloc(100, 1))).rejects.toThrow(/isn't really/);
    expect(await readMedia(fake.id)).toBeNull();
    // Someone else can't add to my upload.
    const mine = await startUpload(w.social, { name: "b.jpg", size: JPEG.length });
    await expect(appendUpload(w.admin, mine.id, 0, JPEG)).rejects.toThrow(/not found/);
  });

  it("keeps a small preview, and shows a brand its own files plus the ones without a brand", async () => {
    const w = await world();
    const other = await makeBrand("Other", w.admin.id);
    const mine = (await startUpload(w.social, { name: "mine.jpg", size: JPEG.length, brandId: w.brand.id })).id;
    await appendUpload(w.social, mine, 0, JPEG);
    const theirs = (await startUpload(w.social, { name: "theirs.jpg", size: JPEG.length, brandId: other.id })).id;
    await appendUpload(w.social, theirs, 0, JPEG);
    const shared = await upload(w.social);
    const ids = (await listMedia({ brandId: w.brand.id, limit: 1000 })).map((m) => m.id);
    expect(ids).toContain(mine);
    expect(ids).toContain(shared);
    expect(ids).not.toContain(theirs);
    const thumb = `data:image/jpeg;base64,${JPEG.subarray(0, 300).toString("base64")}`;
    await setMediaThumb(w.social, mine, thumb);
    expect((await readThumb(mine))!.equals(JPEG.subarray(0, 300))).toBe(true);
    expect((await listMedia({ brandId: w.brand.id, limit: 1000 })).find((m) => m.id === mine)!.hasThumb).toBe(true);
    await expect(setMediaThumb(w.social, mine, "data:text/html;base64,PGI+")).rejects.toThrow(/can't be used/);
    await expect(setMediaThumb(w.social, mine, `data:image/jpeg;base64,${"A".repeat(130_000)}`)).rejects.toThrow(/can't be used/);
    expect(await readThumb(shared)).toBeNull();
  });
});

describe("scheduling and publishing", () => {
  const tomorrow = () => addDays(todayISO(), 1);

  it("checks the post, moves it on the calendar, and never into the past", async () => {
    const w = await world();
    const media = await upload(w.social);
    const input = { brandId: w.brand.id, kind: "post" as const, caption: "Hello", mediaIds: [media], accountIds: [w.fb.id, w.insta.id], day: tomorrow(), time: "18:30", options: {}, mode: "schedule" as const };
    await expect(savePost(w.social, { ...input, mediaIds: [], accountIds: [w.insta.id] })).rejects.toThrow(/Instagram needs a photo/);
    await expect(savePost(w.social, { ...input, day: addDays(todayISO(), -1) })).rejects.toThrow(/already passed/);
    // A post needs a brand, a connected one, and goes to that brand's own channels only.
    await expect(savePost(w.social, { ...input, brandId: null, mode: "draft" })).rejects.toThrow(/Choose the brand first/);
    const lonely = await makeBrand("Lonely", w.admin.id);
    await expect(savePost(w.social, { ...input, brandId: lonely.id, mediaIds: [], accountIds: [], mode: "draft" })).rejects.toThrow(/isn't connected yet/);
    const other = await world();
    await expect(savePost(w.social, { ...input, accountIds: [other.fb.id] })).rejects.toThrow(/own channels/);
    const { id } = await savePost(w.social, input);
    let p = (await getPost(id))!;
    expect(p).toMatchObject({ status: "scheduled", day: tomorrow(), time: "18:30" });
    expect(p.targets.map((t) => t.status)).toEqual(["pending", "pending"]);
    // The file can't be deleted while a post that hasn't gone out uses it.
    await expect(deleteMedia(w.social, media)).rejects.toThrow(/hasn't gone out/);
    await movePost(w.social, id, addDays(todayISO(), 3), "09:15");
    p = (await getPost(id))!;
    expect(p).toMatchObject({ day: addDays(todayISO(), 3), time: "09:15", status: "scheduled" });
    await movePost(w.social, id, addDays(todayISO(), 4), null);
    expect((await getPost(id))!.time).toBe("09:15");
    await expect(movePost(w.social, id, addDays(todayISO(), -2), "09:00")).rejects.toThrow(/already passed/);
    // Not due yet: a run sends nothing.
    calls = [];
    await publishDue();
    expect(calls).toHaveLength(0);
    // Editing swaps the channels.
    await savePost(w.social, { ...input, id, accountIds: [w.fb.id], caption: "Hello again" });
    p = (await getPost(id))!;
    expect(p.targets.map((t) => t.platform)).toEqual(["facebook"]);
    await deletePost(w.social, id);
    expect(await getPost(id)).toBeNull();
    await deleteMedia(w.social, media);
  });

  it("Post now: sends to both platforms with the file's public link, then keeps the numbers", async () => {
    const w = await world();
    const media = await upload(w.social);
    const key = (await readMedia(media))!.m.publicKey;
    const { id, kick } = await savePost(w.social, { brandId: w.brand.id, kind: "post", caption: "Launch day", mediaIds: [media], accountIds: [w.fb.id, w.insta.id], day: null, time: null, options: {}, mode: "now" });
    expect(kick).toBe(true);
    meta = (c) => {
      if (c.path === `/${w.page}/photos`) return { id: "PH1", post_id: `${w.page}_55` };
      if (c.path === `/${w.page}_55`) return { permalink_url: "https://www.facebook.com/x/posts/55" };
      if (c.method === "POST" && c.path === `/${w.ig}/media`) return { id: "CONT" };
      if (c.path === "/CONT") return { status_code: "FINISHED" };
      if (c.path === `/${w.ig}/media_publish`) return { id: "IGM" };
      if (c.path === "/IGM") return { permalink: "https://www.instagram.com/p/xyz/" };
      return { error: { message: `unexpected ${c.method} ${c.path}` } };
    };
    await publishDue();
    const p = (await getPost(id))!;
    expect(p.status).toBe("published");
    expect(p.targets.map((t) => [t.platform, t.status, t.permalink])).toEqual([
      ["facebook", "published", "https://www.facebook.com/x/posts/55"],
      ["instagram", "published", "https://www.instagram.com/p/xyz/"],
    ]);
    const link = `https://ops.test/api/social/file/${media}?k=${key}`;
    expect(calls.find((c) => c.path === `/${w.page}/photos`)!.params).toMatchObject({ url: link, caption: "Launch day", access_token: w.token });
    expect(calls.find((c) => c.path === `/${w.ig}/media`)!.params).toMatchObject({ image_url: link, caption: "Launch day", access_token: w.token });
    // A second run doesn't post it again.
    calls = [];
    await publishDue();
    expect(calls).toHaveLength(0);
    // A published post stays as it is.
    await expect(savePost(w.social, { id, brandId: w.brand.id, kind: "post", caption: "changed", mediaIds: [media], accountIds: [w.fb.id], day: null, time: null, options: {}, mode: "draft" })).rejects.toThrow(/already published/);
    await expect(movePost(w.social, id, addDays(todayISO(), 2), "10:00")).rejects.toThrow(/already gone out/);

    meta = (c) => {
      if (c.path === "/IGM/insights") return { data: [{ name: "reach", values: [{ value: 500 }] }, { name: "views", values: [{ value: 900 }] }, { name: "likes", values: [{ value: 40 }] }, { name: "comments", values: [{ value: 6 }] }] };
      if (c.path === `/${w.page}_55/insights`) return { data: [{ name: "post_total_media_view_unique", values: [{ value: 200 }] }, { name: "post_media_view", values: [{ value: 260 }] }] };
      if (c.path === `/${w.page}_55`) return { reactions: { summary: { total_count: 12 } }, comments: { summary: { total_count: 1 } } };
      return { error: { message: `unexpected ${c.path}` } };
    };
    expect(await refreshMetrics({ postId: id })).toBe(2);
    const after = (await getPost(id))!;
    expect(after.targets.find((t) => t.platform === "instagram")!.metrics).toMatchObject({ reach: 500, views: 900, likes: 40, comments: 6 });
    expect(after.targets.find((t) => t.platform === "facebook")!.metrics).toMatchObject({ reach: 200, views: 260, likes: 12, comments: 1, shares: 0 });
    const snaps = await db.select().from(socialMetricSnapshots).where(eq(socialMetricSnapshots.targetId, after.targets[0].id));
    expect(snaps).toHaveLength(1);
  });

  it("when Meta refuses: the reason is kept, nothing is retried by itself, Try again sends only what failed", async () => {
    const w = await world();
    const media = await upload(w.social);
    const { id } = await savePost(w.social, { brandId: w.brand.id, kind: "post", caption: "Oops", mediaIds: [media], accountIds: [w.fb.id, w.insta.id], day: null, time: null, options: {}, mode: "now" });
    meta = (c) => {
      if (c.path === `/${w.page}/photos`) return { id: "PH2", post_id: `${w.page}_77` };
      if (c.path === `/${w.page}_77`) return { permalink_url: "https://www.facebook.com/x/posts/77" };
      return { error: { message: "The user is not an Instagram Business", code: 100 } };
    };
    await publishDue();
    let p = (await getPost(id))!;
    expect(p.status).toBe("partial");
    expect(p.targets.find((t) => t.platform === "instagram")).toMatchObject({ status: "failed", error: "The user is not an Instagram Business" });
    // The social team is told, once, with Meta's reason and a link to the post. Other teams aren't.
    const esraa2 = await makeUser("Esraa2", ["social"]);
    const told = await db.select().from(notifications).where(eq(notifications.href, `/social/posts/${id}`));
    expect(told.every((n) => n.kind === "social_failed")).toBe(true);
    expect(told.map((n) => n.userId)).toContain(w.social.id);
    expect(told.map((n) => n.userId)).not.toContain(w.writer.id);
    expect(told.map((n) => n.userId)).not.toContain(esraa2.id);
    expect(told.find((n) => n.userId === w.social.id)).toMatchObject({ title: "A post didn't publish on Instagram (vanillaroza)", body: expect.stringContaining("The user is not an Instagram Business") });
    calls = [];
    await publishDue();
    expect(calls).toHaveLength(0);
    expect(await db.select().from(notifications).where(eq(notifications.href, `/social/posts/${id}`))).toHaveLength(told.length);
    await retryPost(w.social, id);
    meta = (c) => (c.method === "POST" && c.path === `/${w.ig}/media` ? { id: "C2" } : c.path === "/C2" ? { status_code: "FINISHED" } : c.path === `/${w.ig}/media_publish` ? { id: "IG2" } : { permalink: "https://www.instagram.com/p/2/" });
    await publishDue();
    p = (await getPost(id))!;
    expect(p.status).toBe("published");
    // Facebook was not sent a second time.
    expect(calls.some((c) => c.path === `/${w.page}/photos`)).toBe(false);
  });

  it("a video waits for Instagram across runs, and an expired token marks the channel", async () => {
    const w = await world();
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(500, 1)]);
    const media = await upload(w.social, "reel.mp4", mp4);
    const { id } = await savePost(w.social, { brandId: w.brand.id, kind: "reel", caption: "Reel", mediaIds: [media], accountIds: [w.insta.id], day: null, time: null, options: { shareToFeed: true }, mode: "now" });
    let ready = false;
    meta = (c) => (c.method === "POST" && c.path === `/${w.ig}/media` ? { id: "RC" } : c.path === "/RC" ? { status_code: ready ? "FINISHED" : "IN_PROGRESS" } : c.path === `/${w.ig}/media_publish` ? { id: "RM" } : { permalink: "https://www.instagram.com/reel/1/" });
    await publishDue();
    expect((await getPost(id))!.status).toBe("publishing");
    await publishDue();
    expect((await getPost(id))!.status).toBe("publishing");
    ready = true;
    await publishDue();
    expect((await getPost(id))!.status).toBe("published");
    expect(calls.filter((c) => c.method === "POST" && c.path === `/${w.ig}/media`)).toHaveLength(1);
    expect(calls.find((c) => c.path === `/${w.ig}/media`)!.params).toMatchObject({ media_type: "REELS", share_to_feed: "true" });

    const second = await savePost(w.social, { brandId: w.brand.id, kind: "post", caption: "Text", mediaIds: [], accountIds: [w.fb.id], day: null, time: null, options: {}, mode: "now" });
    meta = () => ({ error: { message: "Error validating access token: the session has been invalidated.", code: 190 } });
    await publishDue();
    expect((await getPost(second.id))!.status).toBe("failed");
    expect((await listAccounts()).find((a) => a.id === w.fb.id)).toMatchObject({ status: "error", lastError: expect.stringContaining("access token") });
    const [t] = await db.select().from(socialPostTargets).where(eq(socialPostTargets.postId, second.id));
    expect(t.claimedAt).toBeNull();
    const [row] = await db.select().from(socialPosts).where(eq(socialPosts.id, second.id));
    expect(row.status).toBe("failed");
  });

  it("clean-up: a file leaves the server a day after its post is out — the post, numbers and preview stay", async () => {
    const w = await world();
    const used = await upload(w.social);
    const waiting = await upload(w.social);
    const unused = await upload(w.social);
    await setMediaThumb(w.social, used, `data:image/jpeg;base64,${JPEG.subarray(0, 200).toString("base64")}`);
    const out = await savePost(w.social, { brandId: w.brand.id, kind: "post", caption: "Out", mediaIds: [used], accountIds: [w.fb.id], day: null, time: null, options: {}, mode: "now" });
    const later = await savePost(w.social, { brandId: w.brand.id, kind: "post", caption: "Later", mediaIds: [waiting], accountIds: [w.fb.id], day: addDays(todayISO(), 20), time: "10:00", options: {}, mode: "schedule" });
    meta = (c) => (c.path === `/${w.page}/photos` ? { id: "PH9", post_id: `${w.page}_99` } : { permalink_url: "https://www.facebook.com/x/posts/99" });
    await publishDue();
    expect((await getPost(out.id))!.status).toBe("published");
    const file = (await readMedia(used))!.file;

    // Right after publishing, and 23 hours later: still there (Meta may still be fetching a large video).
    await cleanupMedia(new Date(Date.now() + KEEP_AFTER_PUBLISH_MS - 3_600_000));
    expect(fs.existsSync(file)).toBe(true);

    await cleanupMedia(new Date(Date.now() + KEEP_AFTER_PUBLISH_MS + 3_600_000));
    expect(fs.existsSync(file)).toBe(false);
    expect(await readMedia(used)).toBeNull();
    const p = (await getPost(out.id))!;
    expect(p).toMatchObject({ status: "published", caption: "Out" });
    expect(p.media[0]).toMatchObject({ id: used, gone: true, hasThumb: true });
    expect(p.targets[0].permalink).toBe("https://www.facebook.com/x/posts/99");
    expect(await readThumb(used)).not.toBeNull();
    expect((await listMedia({ limit: 1000 })).map((m) => m.id)).not.toContain(used);
    // The file of a post that hasn't gone out, and a file nobody used yet, are untouched…
    expect(await readMedia(waiting)).not.toBeNull();
    expect(await readMedia(unused)).not.toBeNull();
    expect((await getPost(later.id))!.status).toBe("scheduled");
    // …until a month has passed for the unused one. The scheduled post's file is still kept then.
    await cleanupMedia(new Date(Date.now() + KEEP_UNUSED_MS + 3_600_000));
    expect(await readMedia(unused)).toBeNull();
    expect(await readMedia(waiting)).not.toBeNull();
  });
});
