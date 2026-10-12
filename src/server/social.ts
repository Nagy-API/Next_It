/**
 * Social media schedule: configuration, connected channels, the media library and the posts.
 *
 * - Configuration (Meta app ID / secret, this system's public address) lives in `workspace_settings` under "social".
 *   Secrets and tokens are encrypted before they reach the database (`secretKey`), and never sent to the browser.
 * - Media files live on disk next to the other files (`<files folder>/social`), exactly as uploaded — nothing here
 *   resizes or re-encodes, so Facebook and Instagram always receive the original file.
 * - Posting itself happens in social-queue.ts; this file only prepares what it will send.
 */
import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { brands, socialAccounts, socialMedia, socialMetricSnapshots, socialPostTargets, socialPosts, users, workspaceSettings } from "@/db/schema";
import { NOT_ALLOWED, can } from "@/domain/permissions";
import {
  MAX_MEDIA_BYTES,
  MEDIA_TYPES,
  POST_KINDS,
  checkPost,
  extOf,
  formatBytes,
  type MediaLite,
  type PostKind,
  type PostOptions,
  type PostStatus,
  type SocialMetrics,
  type SocialPlatform,
} from "@/domain/social";
import { cairoDate, formatTime, fromCairoLocal, isValidISODate, isValidTime } from "@/lib/dates";
import { logActivity, type Actor } from "./activity";
import { filesDir } from "./attachments";
import { UserError, assert } from "./errors";
import { MetaError, exchangeLongLived, listPages, pingAccount, type FoundPage } from "./social-meta";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/* ------------------------------ Secrets ------------------------------ */

export function socialDir() {
  return path.join(filesDir(), "social");
}

let keyCache: Buffer | null = null;

/**
 * The key that encrypts tokens and the app secret. `SOCIAL_SECRET_KEY` (any long random text) when set; otherwise
 * a key file created once next to the uploaded files — outside the database, so a database backup alone
 * can't be used to post on anyone's page.
 */
function secretKey(): Buffer {
  if (keyCache) return keyCache;
  const env = process.env.SOCIAL_SECRET_KEY?.trim();
  if (env) return (keyCache = crypto.createHash("sha256").update(env).digest());
  const file = path.join(socialDir(), ".key");
  try {
    const hex = fs.readFileSync(file, "utf8").trim();
    if (/^[0-9a-f]{64}$/.test(hex)) return (keyCache = Buffer.from(hex, "hex"));
  } catch {}
  fs.mkdirSync(socialDir(), { recursive: true });
  const key = crypto.randomBytes(32);
  fs.writeFileSync(file, key.toString("hex"), { mode: 0o600 });
  return (keyCache = key);
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const data = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return `v1.${iv.toString("base64")}.${c.getAuthTag().toString("base64")}.${data.toString("base64")}`;
}

function decrypt(enc: string): string {
  const [v, iv, tag, data] = enc.split(".");
  assert(v === "v1" && iv && tag && data, "A saved token can't be read. Connect the channel again in Configuration.");
  try {
    const d = crypto.createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
  } catch {
    throw new UserError("A saved token can't be read (the encryption key changed). Connect the channel again in Configuration.");
  }
}

/* ------------------------------ Configuration ------------------------------ */

type RawConfig = { appId?: string; appSecretEnc?: string; publicUrl?: string };
export type SocialConfig = { appId: string; hasSecret: boolean; publicUrl: string };

async function setting<T>(key: string): Promise<T | null> {
  const [row] = await db.select().from(workspaceSettings).where(eq(workspaceSettings.key, key));
  return (row?.value as T | undefined) ?? null;
}

async function saveSetting(key: string, value: unknown, actorId: string | null) {
  await db
    .insert(workspaceSettings)
    .values({ key, value, updatedById: actorId })
    .onConflictDoUpdate({ target: workspaceSettings.key, set: { value, updatedById: actorId, updatedAt: new Date() } });
}

export async function getSocialConfig(): Promise<SocialConfig> {
  const raw = (await setting<RawConfig>("social")) ?? {};
  return { appId: raw.appId ?? "", hasSecret: !!raw.appSecretEnc, publicUrl: raw.publicUrl ?? "" };
}

/** "https://ops.example.com" — no path, no trailing slash. */
function cleanBase(url: string): string {
  const v = url.trim();
  if (!v) return "";
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
  } catch {
    throw new UserError("That doesn't look like a web address. Example: https://ops.yourcompany.com");
  }
  return `${u.protocol}//${u.host}`;
}

export async function saveSocialConfig(actor: Actor, input: { appId: string; appSecret: string; publicUrl: string }) {
  assert(can.configureSocial(actor), NOT_ALLOWED);
  const raw = (await setting<RawConfig>("social")) ?? {};
  const appId = input.appId.trim();
  assert(!appId || /^\d{5,25}$/.test(appId), "The App ID is a number (about 15 digits). Copy it from the top of your app's page on developers.facebook.com.");
  const secret = input.appSecret.trim();
  assert(!secret || /^[0-9a-f]{20,64}$/i.test(secret), "The App secret is a long code of letters a–f and digits. Copy it from App settings → Basic → Show.");
  const publicUrl = cleanBase(input.publicUrl);
  const next: RawConfig = { appId, appSecretEnc: secret ? encrypt(secret) : appId === raw.appId ? raw.appSecretEnc : undefined, publicUrl };
  await db.transaction(async (tx) => {
    await tx
      .insert(workspaceSettings)
      .values({ key: "social", value: next, updatedById: actor.id })
      .onConflictDoUpdate({ target: workspaceSettings.key, set: { value: next, updatedById: actor.id, updatedAt: new Date() } });
    await logActivity(tx, actor, { action: "social_config", summary: `${actor.name} changed the Social media schedule configuration.` });
  });
}

/** The address Meta downloads media from. Empty when nothing is configured and none can be guessed. */
export async function publicBase(fallbackHost?: string | null): Promise<string> {
  const raw = (await setting<RawConfig>("social")) ?? {};
  if (raw.publicUrl) return raw.publicUrl;
  const env = process.env.PUBLIC_URL?.trim();
  if (env) return cleanBase(env);
  return fallbackHost ? `https://${fallbackHost}` : "";
}

/** Can the outside world reach this address? (Meta has to, to download photos and videos.) */
export function looksPublic(base: string) {
  try {
    const u = new URL(base);
    const h = u.hostname;
    return u.protocol === "https:" && h.includes(".") && !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
  } catch {
    return false;
  }
}

/* ------------------------------ Channels ------------------------------ */

export type AccountView = {
  id: string;
  platform: SocialPlatform;
  name: string;
  username: string | null;
  brandId: string | null;
  status: "ok" | "error";
  lastError: string | null;
  checkedAt: Date | null;
};

export async function listAccounts(): Promise<AccountView[]> {
  const rows = await db.select().from(socialAccounts).where(isNull(socialAccounts.deletedAt)).orderBy(asc(socialAccounts.name), asc(socialAccounts.platform));
  return rows.map((a) => ({ id: a.id, platform: a.platform as SocialPlatform, name: a.name, username: a.username, brandId: a.brandId, status: a.status === "error" ? "error" : "ok", lastError: a.lastError, checkedAt: a.checkedAt }));
}

export type FoundView = { pageId: string; name: string; instagram: { id: string; username: string | null } | null; connected: { facebook: boolean; instagram: boolean } };
type Pending = { enc: string; at: number; by: string };

/**
 * Step 1 of connecting: read the pages behind a user access token. The page tokens are kept (encrypted) for
 * 30 minutes so step 2 can connect the chosen ones; nothing is connected yet.
 */
export async function discoverAccounts(actor: Actor, userToken: string): Promise<FoundView[]> {
  assert(can.configureSocial(actor), NOT_ALLOWED);
  const token = userToken.replace(/\s+/g, "");
  assert(token.length >= 50, "Paste the whole access token (it is a very long code starting with EAA…).");
  const raw = (await setting<RawConfig>("social")) ?? {};
  assert(raw.appId && raw.appSecretEnc, "Save the App ID and App secret first (the section above). Without them the connection would stop working after about an hour.");
  let pages: FoundPage[];
  try {
    const long = await exchangeLongLived(raw.appId, decrypt(raw.appSecretEnc), token);
    pages = await listPages(long);
  } catch (e) {
    if (e instanceof MetaError) assert(false, `Meta refused the token: ${e.message}`);
    throw e;
  }
  assert(pages.length, "This token doesn't give access to any Facebook Page. In the Graph API Explorer choose your app, tick the permissions listed below, press Generate Access Token and select your pages in the window that opens.");
  await saveSetting("social.pending", { enc: encrypt(JSON.stringify(pages)), at: Date.now(), by: actor.id } satisfies Pending, actor.id);
  const have = await db.select({ platform: socialAccounts.platform, externalId: socialAccounts.externalId }).from(socialAccounts).where(isNull(socialAccounts.deletedAt));
  const has = (p: string, id: string) => have.some((h) => h.platform === p && h.externalId === id);
  return pages.map((p) => ({ pageId: p.id, name: p.name, instagram: p.instagram ? { id: p.instagram.id, username: p.instagram.username } : null, connected: { facebook: has("facebook", p.id), instagram: !!p.instagram && has("instagram", p.instagram.id) } }));
}

/** Step 2: connect the chosen pages (and their Instagram accounts) to a brand. Connecting again refreshes the token. */
export async function connectAccounts(actor: Actor, picks: { pageId: string; brandId: string | null; facebook: boolean; instagram: boolean }[]) {
  assert(can.configureSocial(actor), NOT_ALLOWED);
  const pending = await setting<Pending>("social.pending");
  assert(pending && Date.now() - pending.at < 30 * 60_000, "That took a while — paste the access token again and press Find my pages.");
  const pages = JSON.parse(decrypt(pending.enc)) as FoundPage[];
  const wanted = picks.filter((p) => p.facebook || p.instagram);
  assert(wanted.length, "Tick at least one channel to connect.");
  const brandIds = [...new Set(wanted.map((p) => p.brandId).filter(isId))];
  const okBrands = brandIds.length ? (await db.select({ id: brands.id }).from(brands).where(inArray(brands.id, brandIds))).map((b) => b.id) : [];
  let n = 0;
  await db.transaction(async (tx) => {
    for (const pick of wanted) {
      const page = pages.find((p) => p.id === pick.pageId);
      if (!page) continue;
      const brandId = isId(pick.brandId) && okBrands.includes(pick.brandId) ? pick.brandId : null;
      const rows: { platform: SocialPlatform; externalId: string; name: string; username: string | null }[] = [];
      if (pick.facebook) rows.push({ platform: "facebook", externalId: page.id, name: page.name, username: null });
      if (pick.instagram && page.instagram) rows.push({ platform: "instagram", externalId: page.instagram.id, name: page.instagram.name || page.instagram.username || page.name, username: page.instagram.username });
      for (const r of rows) {
        const values = { ...r, brandId, tokenEnc: encrypt(page.token), status: "ok", lastError: null, checkedAt: new Date(), connectedById: actor.id, deletedAt: null };
        await tx
          .insert(socialAccounts)
          .values(values)
          .onConflictDoUpdate({ target: [socialAccounts.platform, socialAccounts.externalId], set: values });
        n++;
      }
    }
    await tx.delete(workspaceSettings).where(eq(workspaceSettings.key, "social.pending"));
    await logActivity(tx, actor, { action: "social_accounts_connected", summary: `${actor.name} connected ${n} social channel${n === 1 ? "" : "s"}.` });
  });
  return n;
}

export async function setAccountBrand(actor: Actor, id: string, brandId: string | null) {
  assert(can.configureSocial(actor), NOT_ALLOWED);
  assert(isId(id), "Channel not found.");
  if (brandId) {
    assert(isId(brandId), "Brand not found.");
    const [b] = await db.select({ id: brands.id }).from(brands).where(eq(brands.id, brandId));
    assert(b, "Brand not found.");
  }
  await db.update(socialAccounts).set({ brandId: brandId || null }).where(eq(socialAccounts.id, id));
}

/** Remove a channel from this system (nothing changes on Facebook / Instagram). Its scheduled posts stop for it. */
export async function disconnectAccount(actor: Actor, id: string) {
  assert(can.configureSocial(actor), NOT_ALLOWED);
  assert(isId(id), "Channel not found.");
  await db.transaction(async (tx) => {
    const [a] = await tx.select().from(socialAccounts).where(eq(socialAccounts.id, id));
    assert(a && !a.deletedAt, "Channel not found.");
    await tx.update(socialAccounts).set({ deletedAt: new Date(), tokenEnc: "" }).where(eq(socialAccounts.id, id));
    await tx
      .update(socialPostTargets)
      .set({ status: "failed", error: "This channel was disconnected before the post went out." })
      .where(and(eq(socialPostTargets.accountId, id), inArray(socialPostTargets.status, ["pending", "processing"])));
    await logActivity(tx, actor, { action: "social_account_removed", brandId: a.brandId, summary: `${actor.name} disconnected the ${a.platform === "instagram" ? "Instagram account" : "Facebook Page"} “${a.name}”.` });
  });
}

/** Ask Meta whether the saved token still works; the answer is stored on the channel. */
export async function checkAccount(actor: Actor, id: string): Promise<string> {
  assert(can.configureSocial(actor), NOT_ALLOWED);
  assert(isId(id), "Channel not found.");
  const [a] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, id));
  assert(a && !a.deletedAt, "Channel not found.");
  try {
    await pingAccount(a.platform as SocialPlatform, a.externalId, decrypt(a.tokenEnc));
    await db.update(socialAccounts).set({ status: "ok", lastError: null, checkedAt: new Date() }).where(eq(socialAccounts.id, id));
    return `“${a.name}” is connected and working.`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    await db.update(socialAccounts).set({ status: "error", lastError: cut(msg, 500), checkedAt: new Date() }).where(eq(socialAccounts.id, id));
    assert(false, `“${a.name}” isn't working: ${msg}`);
  }
}

/** For the queue only: the channel with its token. */
export async function accountWithToken(id: string) {
  const [a] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, id));
  if (!a || a.deletedAt || !a.tokenEnc) return null;
  return { account: a, token: decrypt(a.tokenEnc) };
}

export async function markAccount(id: string, error: string | null) {
  await db.update(socialAccounts).set({ status: error ? "error" : "ok", lastError: error ? cut(error, 500) : null, checkedAt: new Date() }).where(eq(socialAccounts.id, id));
}

/* ------------------------------ Media library ------------------------------ */

export type MediaView = MediaLite & { status: "uploading" | "ready"; brandId: string | null; createdAt: Date; createdBy: string | null; url: string; uses: number; hasThumb: boolean };

const mediaUrl = (id: string) => `/api/social/file/${id}`;

/** A media row without the preview image itself (lists only need to know whether there is one). */
const mediaCols = {
  id: socialMedia.id,
  name: socialMedia.name,
  kind: socialMedia.kind,
  mime: socialMedia.mime,
  size: socialMedia.size,
  width: socialMedia.width,
  height: socialMedia.height,
  status: socialMedia.status,
  brandId: socialMedia.brandId,
  createdById: socialMedia.createdById,
  createdAt: socialMedia.createdAt,
  deletedAt: socialMedia.deletedAt,
  hasThumb: sql<boolean>`${socialMedia.thumb} is not null`,
};
type MediaRow = { id: string; name: string; kind: string; mime: string; size: number; width: number | null; height: number | null };

/** Start an upload: the file then arrives in pieces (`appendUpload`). Nothing is changed on the way — it's stored as sent. */
export async function startUpload(actor: Actor, input: { name: string; size: number; brandId?: string | null; width?: number | null; height?: number | null }) {
  assert(can.scheduleSocial(actor), NOT_ALLOWED);
  const name = cut(path.basename(String(input.name ?? "")).replace(/[\u0000-\u001f\\/:*?"<>|]+/g, " ").trim() || "file", 140);
  const ext = extOf(name);
  const type = MEDIA_TYPES[ext];
  assert(type, "The media library takes JPG and PNG photos and MP4 or MOV videos.");
  const size = Number(input.size);
  assert(Number.isInteger(size) && size > 0, "That file is empty.");
  assert(size <= MAX_MEDIA_BYTES, `That file is ${formatBytes(size)}. The biggest file the library takes is ${formatBytes(MAX_MEDIA_BYTES)}.`);
  const dim = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 && v < 100_000 ? v : null);
  fs.mkdirSync(socialDir(), { recursive: true });
  const [m] = await db
    .insert(socialMedia)
    .values({
      name,
      kind: type.kind,
      mime: type.mime,
      size,
      storageKey: `${crypto.randomUUID()}.${ext}`,
      publicKey: crypto.randomBytes(24).toString("hex"),
      brandId: isId(input.brandId) ? input.brandId : null,
      width: dim(input.width),
      height: dim(input.height),
      createdById: actor.id,
    })
    .returning();
  fs.writeFileSync(path.join(socialDir(), m.storageKey), "");
  return { id: m.id };
}

/** The first bytes must look like what the extension says (a renamed file is refused). */
function looksLike(mime: string, head: Buffer) {
  if (mime === "image/jpeg") return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  if (mime === "image/png") return head.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return ["ftyp", "moov", "mdat", "wide", "free", "skip"].includes(head.subarray(4, 8).toString("latin1"));
}

/** Add the next piece. Returns how much has arrived, so the browser continues from there after a hiccup. */
export async function appendUpload(actor: Actor, id: string, offset: number, bytes: Buffer): Promise<{ received: number; done: boolean }> {
  assert(can.scheduleSocial(actor), NOT_ALLOWED);
  assert(isId(id), "Upload not found.");
  const [m] = await db.select().from(socialMedia).where(eq(socialMedia.id, id));
  assert(m && !m.deletedAt && m.createdById === actor.id, "Upload not found.");
  if (m.status === "ready") return { received: m.size, done: true };
  // A piece sent twice (a retry after a lost answer): say where we are instead of writing it again.
  if (offset !== m.received) return { received: m.received, done: false };
  assert(bytes.length > 0 && m.received + bytes.length <= m.size, "The upload doesn't match the file. Start it again.");
  const file = path.join(socialDir(), m.storageKey);
  if (offset === 0 && !looksLike(m.mime, bytes.subarray(0, 12))) {
    await db.update(socialMedia).set({ deletedAt: new Date() }).where(eq(socialMedia.id, id));
    fs.rmSync(file, { force: true });
    assert(false, `“${m.name}” isn't really a ${m.kind === "image" ? "JPG / PNG photo" : "MP4 / MOV video"}.`);
  }
  await fs.promises.appendFile(file, bytes);
  const received = m.received + bytes.length;
  const done = received === m.size;
  await db.update(socialMedia).set({ received, status: done ? "ready" : "uploading" }).where(eq(socialMedia.id, id));
  return { received, done };
}

/** The library, newest first. With a brand: that brand's files and the ones that belong to no brand. */
export async function listMedia(opts: { brandId?: string | null; kind?: "image" | "video" | null; limit?: number } = {}): Promise<MediaView[]> {
  const rows = await db
    .select({ m: mediaCols, by: users.name })
    .from(socialMedia)
    .leftJoin(users, eq(users.id, socialMedia.createdById))
    .where(and(isNull(socialMedia.deletedAt), eq(socialMedia.status, "ready"), opts.brandId ? or(eq(socialMedia.brandId, opts.brandId), isNull(socialMedia.brandId)) : undefined, opts.kind ? eq(socialMedia.kind, opts.kind) : undefined))
    .orderBy(desc(socialMedia.createdAt))
    .limit(opts.limit ?? 300);
  const used = await db.select({ ids: socialPosts.mediaIds }).from(socialPosts).where(isNull(socialPosts.deletedAt));
  const count = new Map<string, number>();
  for (const u of used) for (const id of u.ids) count.set(id, (count.get(id) ?? 0) + 1);
  return rows.map(({ m, by }) => ({ ...lite(m), status: "ready", brandId: m.brandId, createdAt: m.createdAt, createdBy: by, url: mediaUrl(m.id), uses: count.get(m.id) ?? 0, hasThumb: !!m.hasThumb }));
}

const lite = (m: MediaRow): MediaLite => ({ id: m.id, kind: m.kind as "image" | "video", mime: m.mime, size: m.size, width: m.width, height: m.height, name: m.name });

export async function setMediaBrand(actor: Actor, id: string, brandId: string | null) {
  assert(can.scheduleSocial(actor), NOT_ALLOWED);
  assert(isId(id) && (!brandId || isId(brandId)), "File not found.");
  await db.update(socialMedia).set({ brandId: brandId || null }).where(eq(socialMedia.id, id));
}

/** Delete a file from the library and from disk. Refused while a post that hasn't gone out yet still uses it. */
export async function deleteMedia(actor: Actor, id: string) {
  assert(can.scheduleSocial(actor), NOT_ALLOWED);
  assert(isId(id), "File not found.");
  const [m] = await db.select().from(socialMedia).where(eq(socialMedia.id, id));
  assert(m && !m.deletedAt, "File not found.");
  const waiting = await db
    .select({ id: socialPosts.id })
    .from(socialPosts)
    .where(and(isNull(socialPosts.deletedAt), inArray(socialPosts.status, ["draft", "scheduled", "publishing"]), sql`${id}::uuid = ANY(${socialPosts.mediaIds})`));
  assert(!waiting.length, `“${m.name}” is in ${waiting.length === 1 ? "a post" : `${waiting.length} posts`} that hasn't gone out yet. Remove it from there first.`);
  await db.update(socialMedia).set({ deletedAt: new Date() }).where(eq(socialMedia.id, id));
  fs.rmSync(path.join(socialDir(), m.storageKey), { force: true });
}

/**
 * Keep a small preview of a file (made in the browser right after the upload). It is what the calendar and the
 * lists show, and it stays after the file itself has been removed from the server.
 */
export async function setMediaThumb(actor: Actor, id: string, dataUrl: string) {
  assert(can.scheduleSocial(actor), NOT_ALLOWED);
  assert(isId(id), "File not found.");
  assert(typeof dataUrl === "string" && dataUrl.length <= 120_000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(dataUrl), "That preview can't be used.");
  await db.update(socialMedia).set({ thumb: dataUrl }).where(and(eq(socialMedia.id, id), eq(socialMedia.createdById, actor.id)));
}

/** The preview image (also for files that were removed from the server). */
export async function readThumb(id: string): Promise<Buffer | null> {
  if (!isId(id)) return null;
  const [m] = await db.select({ thumb: socialMedia.thumb }).from(socialMedia).where(eq(socialMedia.id, id));
  const b64 = m?.thumb?.match(/^data:image\/jpeg;base64,(.+)$/)?.[1];
  return b64 ? Buffer.from(b64, "base64") : null;
}

/** How long a file stays on the server once its post is out everywhere (Meta may still be fetching a large video). */
export const KEEP_AFTER_PUBLISH_MS = 24 * 3_600_000;
/** A post that failed and nobody came back to: its files are let go after this long. */
export const KEEP_UNRESOLVED_MS = 14 * 24 * 3_600_000;
/** A file that was uploaded but never put in a post. */
export const KEEP_UNUSED_MS = 30 * 24 * 3_600_000;

/**
 * Free the server's disk: remove the photos and videos whose posts are already published (a day later), files
 * nobody used for a month, and uploads that never finished. Only the file goes — the post, its numbers, its live
 * link and the small preview all stay. Returns how many files and bytes were removed. Safe to repeat.
 */
export async function cleanupMedia(now = new Date()): Promise<{ files: number; bytes: number }> {
  const media = await db.select({ id: socialMedia.id, size: socialMedia.size, status: socialMedia.status, storageKey: socialMedia.storageKey, createdAt: socialMedia.createdAt }).from(socialMedia).where(isNull(socialMedia.deletedAt));
  if (!media.length) return { files: 0, bytes: 0 };
  const posts = await db.select({ id: socialPosts.id, mediaIds: socialPosts.mediaIds, status: socialPosts.status, updatedAt: socialPosts.updatedAt }).from(socialPosts).where(isNull(socialPosts.deletedAt));
  const published = await db.select({ postId: socialPostTargets.postId, at: socialPostTargets.publishedAt }).from(socialPostTargets).where(eq(socialPostTargets.status, "published"));
  const lastOut = new Map<string, number>();
  for (const t of published) if (t.at) lastOut.set(t.postId, Math.max(lastOut.get(t.postId) ?? 0, t.at.getTime()));
  /** Is this post finished with its files? */
  const done = (p: (typeof posts)[number]) =>
    p.status === "published" ? now.getTime() - (lastOut.get(p.id) ?? p.updatedAt.getTime()) > KEEP_AFTER_PUBLISH_MS : (p.status === "failed" || p.status === "partial") && now.getTime() - p.updatedAt.getTime() > KEEP_UNRESOLVED_MS;
  const gone: typeof media = [];
  for (const m of media) {
    const age = now.getTime() - m.createdAt.getTime();
    const uses = posts.filter((p) => p.mediaIds.includes(m.id));
    if (m.status !== "ready" ? age > 24 * 3_600_000 : uses.length ? uses.every(done) : age > KEEP_UNUSED_MS) gone.push(m);
  }
  if (!gone.length) return { files: 0, bytes: 0 };
  let bytes = 0;
  await db.transaction(async (tx) => {
    await tx.update(socialMedia).set({ deletedAt: now }).where(inArray(socialMedia.id, gone.map((m) => m.id)));
    for (const m of gone) if (m.status === "ready") bytes += m.size;
    await logActivity(tx, null, { action: "social_media_cleaned", summary: `${gone.length} photo${gone.length === 1 ? "" : "s"} / video${gone.length === 1 ? "" : "s"} of published posts were removed from the server (${formatBytes(bytes)} freed). The posts and their numbers stay.` });
  });
  for (const m of gone) if (/^[0-9a-f-]{36}\.[a-z0-9]+$/.test(m.storageKey)) fs.rmSync(path.join(socialDir(), m.storageKey), { force: true });
  return { files: gone.length, bytes };
}

/** How much disk the library uses right now. */
export async function mediaUsage(): Promise<{ files: number; bytes: number }> {
  const [r] = await db.select({ files: sql<number>`count(*)::int`, bytes: sql<number>`coalesce(sum(${socialMedia.size}), 0)::float8` }).from(socialMedia).where(and(isNull(socialMedia.deletedAt), eq(socialMedia.status, "ready")));
  return { files: r?.files ?? 0, bytes: Number(r?.bytes ?? 0) };
}

/** A file to serve: to signed-in people, or to Meta when the link carries the file's key. */
export async function readMedia(id: string): Promise<{ m: typeof socialMedia.$inferSelect; file: string } | null> {
  if (!isId(id)) return null;
  const [m] = await db.select().from(socialMedia).where(eq(socialMedia.id, id));
  if (!m || m.deletedAt || m.status !== "ready" || !/^[0-9a-f-]{36}\.[a-z0-9]+$/.test(m.storageKey)) return null;
  const file = path.join(socialDir(), m.storageKey);
  return fs.existsSync(file) ? { m, file } : null;
}

export function keyMatches(m: { publicKey: string }, key: string | null) {
  if (!key || key.length !== m.publicKey.length) return false;
  return crypto.timingSafeEqual(Buffer.from(key), Buffer.from(m.publicKey));
}

/* ------------------------------ Posts ------------------------------ */

export type TargetView = {
  id: string;
  accountId: string;
  platform: SocialPlatform;
  accountName: string;
  status: "pending" | "processing" | "published" | "failed";
  permalink: string | null;
  error: string | null;
  publishedAt: Date | null;
  metrics: SocialMetrics | null;
  metricsAt: Date | null;
  metricsError: string | null;
};
export type PostView = {
  id: string;
  brandId: string | null;
  brand: { id: string; name: string; color: string; slug: string } | null;
  kind: PostKind;
  caption: string;
  options: PostOptions;
  status: PostStatus;
  /** ISO instant, and the same moment as a Cairo day + time (what the calendar uses). */
  scheduledAt: string | null;
  day: string | null;
  time: string | null;
  media: (MediaLite & { url: string; gone?: boolean; hasThumb?: boolean })[];
  targets: TargetView[];
  createdBy: string | null;
  updatedAt: Date;
};

async function hydrate(rows: (typeof socialPosts.$inferSelect)[]): Promise<PostView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const mediaIds = [...new Set(rows.flatMap((r) => r.mediaIds))];
  const [targets, media, brandRows, people] = await Promise.all([
    db
      .select({ t: socialPostTargets, platform: socialAccounts.platform, accountName: socialAccounts.name })
      .from(socialPostTargets)
      .innerJoin(socialAccounts, eq(socialAccounts.id, socialPostTargets.accountId))
      .where(inArray(socialPostTargets.postId, ids)),
    mediaIds.length ? db.select(mediaCols).from(socialMedia).where(inArray(socialMedia.id, mediaIds)) : Promise.resolve([]),
    db.select({ id: brands.id, name: brands.name, color: brands.color, slug: brands.slug }).from(brands),
    db.select({ id: users.id, name: users.name }).from(users),
  ]);
  return rows.map((p) => ({
    id: p.id,
    brandId: p.brandId,
    brand: brandRows.find((b) => b.id === p.brandId) ?? null,
    kind: (POST_KINDS as readonly string[]).includes(p.kind) ? (p.kind as PostKind) : "post",
    caption: p.caption,
    options: (p.options ?? {}) as PostOptions,
    status: p.status as PostStatus,
    scheduledAt: p.scheduledAt?.toISOString() ?? null,
    day: p.scheduledAt ? cairoDate(p.scheduledAt) : null,
    time: p.scheduledAt ? formatTime(p.scheduledAt) : null,
    media: p.mediaIds
      .map((id) => media.find((m) => m.id === id))
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map((m) => ({ ...lite(m), url: mediaUrl(m.id), gone: !!m.deletedAt, hasThumb: !!m.hasThumb })),
    targets: targets
      .filter((t) => t.t.postId === p.id)
      .map(({ t, platform, accountName }) => ({
        id: t.id,
        accountId: t.accountId,
        platform: platform as SocialPlatform,
        accountName,
        status: t.status as TargetView["status"],
        permalink: t.permalink,
        error: t.error,
        publishedAt: t.publishedAt,
        metrics: (t.metrics as SocialMetrics | null) ?? null,
        metricsAt: t.metricsAt,
        metricsError: t.metricsError,
      }))
      .sort((a, b) => a.platform.localeCompare(b.platform) || a.accountName.localeCompare(b.accountName)),
    createdBy: people.find((u) => u.id === p.createdById)?.name ?? null,
    updatedAt: p.updatedAt,
  }));
}

/** Posts between two instants (the calendar). */
export async function getPosts(opts: { from: Date; to: Date; brandId?: string | null }): Promise<PostView[]> {
  const rows = await db
    .select()
    .from(socialPosts)
    .where(and(isNull(socialPosts.deletedAt), gte(socialPosts.scheduledAt, opts.from), lte(socialPosts.scheduledAt, opts.to), opts.brandId ? eq(socialPosts.brandId, opts.brandId) : undefined))
    .orderBy(asc(socialPosts.scheduledAt));
  return hydrate(rows);
}

/** Drafts that have no day yet (shown beside the calendar). */
export async function getUndatedDrafts(brandId?: string | null): Promise<PostView[]> {
  const rows = await db
    .select()
    .from(socialPosts)
    .where(and(isNull(socialPosts.deletedAt), isNull(socialPosts.scheduledAt), brandId ? eq(socialPosts.brandId, brandId) : undefined))
    .orderBy(desc(socialPosts.updatedAt))
    .limit(50);
  return hydrate(rows);
}

export async function getPost(id: string): Promise<PostView | null> {
  if (!isId(id)) return null;
  const rows = await db.select().from(socialPosts).where(and(eq(socialPosts.id, id), isNull(socialPosts.deletedAt)));
  return (await hydrate(rows))[0] ?? null;
}

/** The numbers over time for each channel of a post (oldest first). */
export async function getSnapshots(targetIds: string[]): Promise<{ targetId: string; at: Date; data: SocialMetrics }[]> {
  if (!targetIds.length) return [];
  const rows = await db.select().from(socialMetricSnapshots).where(inArray(socialMetricSnapshots.targetId, targetIds)).orderBy(asc(socialMetricSnapshots.at));
  return rows.map((r) => ({ targetId: r.targetId, at: r.at, data: r.data as SocialMetrics }));
}

/** Published posts in a period, for Analytics. */
export async function getPublished(opts: { from: Date; to: Date; brandId?: string | null }): Promise<PostView[]> {
  const rows = await db
    .select()
    .from(socialPosts)
    .where(and(isNull(socialPosts.deletedAt), inArray(socialPosts.status, ["published", "partial"]), gte(socialPosts.scheduledAt, opts.from), lte(socialPosts.scheduledAt, opts.to), opts.brandId ? eq(socialPosts.brandId, opts.brandId) : undefined))
    .orderBy(desc(socialPosts.scheduledAt))
    .limit(500);
  return hydrate(rows);
}

export type PostInput = {
  id?: string | null;
  brandId: string | null;
  kind: PostKind;
  caption: string;
  mediaIds: string[];
  accountIds: string[];
  /** Cairo day "YYYY-MM-DD" and time "HH:MM" (both empty on a draft without a date). */
  day: string | null;
  time: string | null;
  options: PostOptions;
  /** draft = keep it; schedule = goes out at day + time; now = goes out right away. */
  mode: "draft" | "schedule" | "now";
};

const EDITABLE: PostStatus[] = ["draft", "scheduled", "failed"];

/** Create or change a post. Returns its id and whether the queue should run now. */
export async function savePost(actor: Actor, input: PostInput): Promise<{ id: string; message: string; kick: boolean }> {
  assert(can.scheduleSocial(actor), NOT_ALLOWED);
  const kind: PostKind = (POST_KINDS as readonly string[]).includes(input.kind) ? input.kind : "post";
  const caption = String(input.caption ?? "").replace(/\r\n/g, "\n").trim();
  const mediaIds = [...new Set((input.mediaIds ?? []).filter(isId))].slice(0, 20);
  const accountIds = [...new Set((input.accountIds ?? []).filter(isId))];
  const brandId = isId(input.brandId) ? input.brandId : null;
  const options: PostOptions = { shareToFeed: input.options?.shareToFeed !== false };
  const mode = input.mode === "now" || input.mode === "schedule" ? input.mode : "draft";

  const media = mediaIds.length ? await db.select(mediaCols).from(socialMedia).where(and(inArray(socialMedia.id, mediaIds), isNull(socialMedia.deletedAt), eq(socialMedia.status, "ready"))) : [];
  assert(media.length === mediaIds.length, "One of the files is no longer in the media library. Remove it from the post.");
  const accounts = accountIds.length ? await db.select().from(socialAccounts).where(and(inArray(socialAccounts.id, accountIds), isNull(socialAccounts.deletedAt))) : [];
  assert(accounts.length === accountIds.length, "One of the channels is no longer connected.");
  // A post always belongs to one brand, and that brand must have an account connected.
  assert(brandId, "Choose the brand first.");
  const [brand] = await db.select({ name: brands.name }).from(brands).where(and(eq(brands.id, brandId), isNull(brands.deletedAt)));
  assert(brand, "That brand doesn't exist any more.");
  const own = await db.select({ id: socialAccounts.id }).from(socialAccounts).where(and(eq(socialAccounts.brandId, brandId), isNull(socialAccounts.deletedAt)));
  assert(own.length, `${brand.name} isn't connected yet. Connect its Facebook Page in Configuration first.`);
  assert(accounts.every((a) => a.brandId === brandId), `A post for ${brand.name} can only go to ${brand.name}'s own channels.`);

  let when: Date | null = null;
  if (mode === "now") when = new Date();
  else if (input.day || input.time) {
    assert(isValidISODate(input.day), "Choose the day.");
    assert(isValidTime(input.time), "Choose the time (for example 18:30).");
    when = fromCairoLocal(`${input.day}T${input.time}`);
  }
  if (mode === "schedule") {
    assert(when, "Choose the day and time it should go out.");
    assert(when.getTime() > Date.now() - 2 * 60_000, "That time has already passed. Choose a later time, or press Post now.");
  }
  if (mode !== "draft") {
    const problems = checkPost({ kind, caption, media: mediaIds.map((id) => lite(media.find((m) => m.id === id)!)), platforms: [...new Set(accounts.map((a) => a.platform as SocialPlatform))] });
    assert(!problems.length, problems[0]);
    if (media.length) {
      const base = await publicBase();
      assert(base && looksPublic(base), "Photos and videos can't be sent yet: set this system's public address in Configuration (Meta downloads the files from it).");
    }
  }

  const status: PostStatus = mode === "draft" ? "draft" : "scheduled";
  const id = await db.transaction(async (tx) => {
    let postId = input.id ?? null;
    if (postId) {
      assert(isId(postId), "Post not found.");
      const [old] = await tx.select().from(socialPosts).where(eq(socialPosts.id, postId)).for("update");
      assert(old && !old.deletedAt, "Post not found.");
      assert(EDITABLE.includes(old.status as PostStatus), old.status === "publishing" ? "This post is going out right now." : "This post is already published — it can't be changed from here.");
      await tx.update(socialPosts).set({ brandId, kind, caption, mediaIds, options, scheduledAt: when, status, updatedById: actor.id, updatedAt: new Date() }).where(eq(socialPosts.id, postId));
    } else {
      const [p] = await tx.insert(socialPosts).values({ brandId, kind, caption, mediaIds, options, scheduledAt: when, status, createdById: actor.id, updatedById: actor.id }).returning({ id: socialPosts.id });
      postId = p.id;
    }
    // Channels: keep the ones that stay (a failed one gets another go), drop the rest, add the new ones.
    const existing = await tx.select().from(socialPostTargets).where(eq(socialPostTargets.postId, postId));
    for (const t of existing) {
      if (t.status === "published") continue;
      if (!accountIds.includes(t.accountId)) {
        await tx.delete(socialPostTargets).where(eq(socialPostTargets.id, t.id));
      } else {
        await tx.update(socialPostTargets).set({ status: "pending", state: {}, error: null, claimedAt: null }).where(eq(socialPostTargets.id, t.id));
      }
    }
    const fresh = accountIds.filter((a) => !existing.some((t) => t.accountId === a));
    if (fresh.length) await tx.insert(socialPostTargets).values(fresh.map((accountId) => ({ postId: postId!, accountId })));
    const names = accounts.map((a) => `${a.platform === "instagram" ? "Instagram" : "Facebook"} ${a.name}`).join(", ");
    await logActivity(tx, actor, {
      action: mode === "draft" ? "social_post_saved" : "social_post_scheduled",
      brandId,
      summary:
        mode === "draft"
          ? `${actor.name} saved a social ${kind} as a draft${caption ? `: “${cut(caption, 60)}”` : "."}`
          : `${actor.name} ${mode === "now" ? "sent" : `scheduled for ${cairoDate(when!)} ${formatTime(when!)}`} a social ${kind} to ${names}${caption ? `: “${cut(caption, 60)}”` : "."}`,
    });
    return postId;
  });
  return { id, kick: mode === "now", message: mode === "draft" ? "Draft saved." : mode === "now" ? "Sending it now — it shows as Published in a moment." : `Scheduled for ${formatTime(when!)}.` };
}

/** Drag on the calendar: another day and/or time. Only posts that haven't gone out. */
export async function movePost(actor: Actor, id: string, day: string, time: string | null) {
  assert(can.scheduleSocial(actor), NOT_ALLOWED);
  assert(isId(id), "Post not found.");
  assert(isValidISODate(day), "That isn't a day.");
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(socialPosts).where(eq(socialPosts.id, id)).for("update");
    assert(p && !p.deletedAt, "Post not found.");
    assert(p.status === "draft" || p.status === "scheduled" || p.status === "failed", "This post has already gone out, so it stays on its day.");
    const t = isValidTime(time) ? time : p.scheduledAt ? formatTime(p.scheduledAt) : "12:00";
    const when = fromCairoLocal(`${day}T${t}`);
    assert(when, "That isn't a day.");
    assert(p.status === "draft" || when.getTime() > Date.now(), "That time has already passed — drop it on a later time.");
    await tx.update(socialPosts).set({ scheduledAt: when, updatedById: actor.id, updatedAt: new Date() }).where(eq(socialPosts.id, id));
    await logActivity(tx, actor, { action: "social_post_moved", brandId: p.brandId, summary: `${actor.name} moved a social ${p.kind} to ${day} ${t}${p.caption ? `: “${cut(p.caption, 60)}”` : "."}` });
  });
}

/** Take a post off the calendar. A published one stays on Facebook / Instagram — only this system forgets it. */
export async function deletePost(actor: Actor, id: string) {
  assert(can.scheduleSocial(actor), NOT_ALLOWED);
  assert(isId(id), "Post not found.");
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(socialPosts).where(eq(socialPosts.id, id)).for("update");
    assert(p && !p.deletedAt, "Post not found.");
    assert(p.status !== "publishing", "This post is going out right now. Try again in a minute.");
    await tx.update(socialPosts).set({ deletedAt: new Date(), updatedById: actor.id }).where(eq(socialPosts.id, id));
    await tx.update(socialPostTargets).set({ status: "failed", error: "The post was deleted." }).where(and(eq(socialPostTargets.postId, id), inArray(socialPostTargets.status, ["pending", "processing"])));
    await logActivity(tx, actor, { action: "social_post_deleted", brandId: p.brandId, summary: `${actor.name} deleted a ${p.status} social ${p.kind}${p.caption ? `: “${cut(p.caption, 60)}”` : "."}` });
  });
}

/** Try the channels that failed once more, now. */
export async function retryPost(actor: Actor, id: string) {
  assert(can.scheduleSocial(actor), NOT_ALLOWED);
  assert(isId(id), "Post not found.");
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(socialPosts).where(eq(socialPosts.id, id)).for("update");
    assert(p && !p.deletedAt, "Post not found.");
    assert(p.status === "failed" || p.status === "partial", "Nothing to try again on this post.");
    await tx.update(socialPostTargets).set({ status: "pending", state: {}, error: null, claimedAt: null }).where(and(eq(socialPostTargets.postId, id), eq(socialPostTargets.status, "failed")));
    await tx.update(socialPosts).set({ status: "scheduled", updatedById: actor.id, updatedAt: new Date() }).where(eq(socialPosts.id, id));
    await logActivity(tx, actor, { action: "social_post_retry", brandId: p.brandId, summary: `${actor.name} sent a social ${p.kind} again after it didn't publish.` });
  });
}
