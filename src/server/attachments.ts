/**
 * Files (PDF, Word, Excel, images, short videos…) and document links attached to content or to a task.
 *
 * Files live on disk OUTSIDE the app folder (redeploys replace the app folder), next to the database:
 * ~/nexora-ops-data-files in production, ./local-data-files locally. The database only keeps the name, type,
 * size and a random file name; the original name is never used as a path. Only signed-in people can open them.
 */
import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db, databaseMode, type Tx } from "@/db";
import { attachments, contentItems, tasks, type Attachment } from "@/db/schema";
import { isManager } from "@/domain/permissions";
import { logActivity, type Actor } from "./activity";
import { assert } from "./errors";
import { loadItemCtx, normalizeUrl, truncate } from "./workflow";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Allowed files, by extension → the type we serve them as (never what the browser claims). */
const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  rtf: "application/rtf",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  mp4: "video/mp4",
  mov: "video/quicktime",
  zip: "application/zip",
};
export const ACCEPT = Object.keys(TYPES)
  .map((e) => `.${e}`)
  .join(",");

/** Shown in the browser (images, PDF, audio, video); everything else downloads. */
export function opensInline(mime: string | null) {
  return !!mime && /^(image\/(png|jpeg|webp|gif)|application\/pdf|audio\/|video\/)/.test(mime);
}

export function filesDir() {
  if (process.env.FILES_DIR) return path.resolve(process.env.FILES_DIR);
  const mode = databaseMode();
  if (mode.kind === "local") return `${mode.dir}-files`;
  return process.env.NODE_ENV === "production" ? path.join(os.homedir(), "nexora-ops-data-files") : path.resolve(process.cwd(), "local-data-files");
}

function cleanName(name: string) {
  const base = path.basename(name).replace(/[\u0000-\u001f\\/:*?"<>|]+/g, " ").trim();
  return truncate(base || "file", 120);
}

/** Who may add to / see the attachments of a task: its person, who gave it, or a manager. */
async function assertTaskAccess(tx: Tx, actor: Actor, taskId: string) {
  const [t] = await tx.select({ assigneeId: tasks.assigneeId, createdById: tasks.createdById, deletedAt: tasks.deletedAt }).from(tasks).where(eq(tasks.id, taskId));
  assert(t && !t.deletedAt, "Task not found.");
  assert(t.assigneeId === actor.id || t.createdById === actor.id || isManager(actor), "This task isn't yours.");
}

type Target = { itemId?: string | null; taskId?: string | null };

async function checkTarget(tx: Tx, actor: Actor, target: Target) {
  if (target.itemId) {
    const ctx = await loadItemCtx(tx, target.itemId, false);
    return ctx;
  }
  if (target.taskId) await assertTaskAccess(tx, actor, target.taskId);
  return null;
}

/**
 * Save an uploaded file. Without a target it waits ("pending") until the form it was picked in is sent
 * (Give a task / Add content), then `linkPending` attaches it.
 */
export async function saveFile(actor: Actor, file: File, target: Target = {}): Promise<Attachment> {
  assert(file && typeof file.arrayBuffer === "function", "Choose a file.");
  assert(file.size > 0, "That file is empty.");
  assert(file.size <= MAX_FILE_BYTES, "That file is bigger than 25 MB. Put it on Google Drive and attach the link instead.");
  const ext = path.extname(file.name).slice(1).toLowerCase();
  const mime = TYPES[ext];
  assert(mime, "That kind of file can't be attached. Use PDF, Word, Excel, PowerPoint, images, audio, short videos or ZIP — or attach a link.");
  const key = `${crypto.randomUUID()}.${ext}`;
  const dir = filesDir();
  fs.mkdirSync(dir, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  const tmp = path.join(dir, `.${key}.tmp`);
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, path.join(dir, key));
  try {
    return await db.transaction(async (tx) => {
      const ctx = await checkTarget(tx, actor, target);
      const [a] = await tx
        .insert(attachments)
        .values({ itemId: target.itemId || null, taskId: target.taskId || null, kind: "file", name: cleanName(file.name), mime, size: file.size, storageKey: key, createdById: actor.id })
        .returning();
      if (ctx) await logActivity(tx, actor, { action: "attachment_added", itemId: ctx.item.id, brandId: ctx.brandId, projectId: ctx.projectId, clientId: ctx.clientId, summary: `${actor.name} attached “${a.name}”.` });
      return a;
    });
  } catch (e) {
    fs.rmSync(path.join(dir, key), { force: true });
    throw e;
  }
}

export async function addLink(actor: Actor, input: { url: string; name?: string | null } & Target): Promise<Attachment> {
  const url = normalizeUrl(input.url);
  assert(url, "Paste the link.");
  const name = input.name?.trim() || new URL(url).hostname.replace(/^www\./, "");
  return db.transaction(async (tx) => {
    const ctx = await checkTarget(tx, actor, input);
    const [a] = await tx
      .insert(attachments)
      .values({ itemId: input.itemId || null, taskId: input.taskId || null, kind: "link", name: truncate(name, 120), url, createdById: actor.id })
      .returning();
    if (ctx) await logActivity(tx, actor, { action: "attachment_added", itemId: ctx.item.id, brandId: ctx.brandId, projectId: ctx.projectId, clientId: ctx.clientId, summary: `${actor.name} attached a link: ${a.name}.` });
    return a;
  });
}

/** Attach files picked in a form (Give a task / Add content) to everything that form created. */
export async function linkPendingTx(tx: Tx, actor: Actor, ids: string[], targets: Target[]) {
  const clean = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (!clean.length || !targets.length) return;
  const pending = await tx
    .select()
    .from(attachments)
    .where(and(inArray(attachments.id, clean), eq(attachments.createdById, actor.id), isNull(attachments.itemId), isNull(attachments.taskId), isNull(attachments.deletedAt)));
  for (const a of pending) {
    const [first, ...rest] = targets;
    await tx.update(attachments).set({ itemId: first.itemId ?? null, taskId: first.taskId ?? null }).where(eq(attachments.id, a.id));
    // The same file for every person / item: one copy on disk, one row each.
    for (const t of rest) {
      await tx.insert(attachments).values({ itemId: t.itemId ?? null, taskId: t.taskId ?? null, kind: a.kind, name: a.name, url: a.url, mime: a.mime, size: a.size, storageKey: a.storageKey, createdById: actor.id, createdAt: a.createdAt });
    }
  }
}

export async function linkPending(actor: Actor, ids: string[], targets: Target[]) {
  if (!ids.length || !targets.length) return;
  await db.transaction((tx) => linkPendingTx(tx, actor, ids, targets));
}

export async function removeAttachment(actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const [a] = await tx.select().from(attachments).where(eq(attachments.id, id));
    assert(a && !a.deletedAt, "Already removed.");
    assert(a.createdById === actor.id || isManager(actor), "Only the person who attached it (or a manager) can remove it.");
    await tx.update(attachments).set({ deletedAt: new Date() }).where(eq(attachments.id, id));
    if (a.itemId) {
      const [i] = await tx.select({ id: contentItems.id }).from(contentItems).where(eq(contentItems.id, a.itemId));
      if (i) {
        const ctx = await loadItemCtx(tx, a.itemId, false);
        await logActivity(tx, actor, { action: "attachment_removed", itemId: a.itemId, brandId: ctx.brandId, projectId: ctx.projectId, clientId: ctx.clientId, summary: `${actor.name} removed “${a.name}”.` });
      }
    }
    // The file stays on disk (other rows may share it, and the history keeps its name).
    return true;
  });
}

export type AttachmentView = { id: string; kind: "file" | "link"; name: string; href: string; mime: string | null; size: number | null; createdAt: Date; createdById: string };

function view(a: Attachment): AttachmentView {
  return {
    id: a.id,
    kind: a.kind === "link" ? "link" : "file",
    name: a.name,
    href: a.kind === "link" ? a.url! : `/api/files/${a.id}`,
    mime: a.mime,
    size: a.size,
    createdAt: a.createdAt,
    createdById: a.createdById,
  };
}

export async function attachmentsFor(target: { itemIds?: string[]; taskIds?: string[] }): Promise<Map<string, AttachmentView[]>> {
  const out = new Map<string, AttachmentView[]>();
  const add = (key: string, a: Attachment) => out.set(key, [...(out.get(key) ?? []), view(a)]);
  if (target.itemIds?.length) {
    const rows = await db.select().from(attachments).where(and(inArray(attachments.itemId, target.itemIds), isNull(attachments.deletedAt))).orderBy(asc(attachments.createdAt));
    for (const a of rows) add(a.itemId!, a);
  }
  if (target.taskIds?.length) {
    const rows = await db.select().from(attachments).where(and(inArray(attachments.taskId, target.taskIds), isNull(attachments.deletedAt))).orderBy(asc(attachments.createdAt));
    for (const a of rows) add(a.taskId!, a);
  }
  return out;
}

/** The stored file for /api/files/[id]. */
export async function readAttachment(id: string): Promise<{ a: Attachment; file: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [a] = await db.select().from(attachments).where(eq(attachments.id, id));
  if (!a || a.deletedAt || a.kind !== "file" || !a.storageKey || !/^[0-9a-f-]{36}\.[a-z0-9]+$/.test(a.storageKey)) return null;
  const file = path.join(filesDir(), a.storageKey);
  return fs.existsSync(file) ? { a, file } : null;
}
