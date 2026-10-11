/**
 * My notebook: each person's private notes (text, links, files). Only the owner can see, change or open them —
 * not managers, not admins; every function checks the owner. Not in the Activity log (it's private by design).
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { privateNotes } from "@/db/schema";
import type { Actor } from "./activity";
import { attachmentsFor, type AttachmentView } from "./attachments";
import { assert } from "./errors";

const HEX = /^#[0-9a-fA-F]{6}$/;
const UUID = /^[0-9a-f-]{36}$/i;

export type NotebookNote = { id: string; title: string; body: string; color: string | null; pinned: boolean; updatedAt: string; files: AttachmentView[] };

export async function myNotes(userId: string): Promise<NotebookNote[]> {
  const rows = await db
    .select()
    .from(privateNotes)
    .where(and(eq(privateNotes.userId, userId), isNull(privateNotes.deletedAt)))
    .orderBy(desc(privateNotes.pinned), desc(privateNotes.updatedAt))
    .limit(300);
  const files = await attachmentsFor({ privateNoteIds: rows.map((r) => r.id) });
  return rows.map((r) => ({ id: r.id, title: r.title, body: r.body, color: r.color, pinned: r.pinned, updatedAt: r.updatedAt.toISOString(), files: files.get(r.id) ?? [] }));
}

async function own(actor: Actor, id: string) {
  assert(UUID.test(id), "Note not found.");
  const [n] = await db.select().from(privateNotes).where(eq(privateNotes.id, id));
  assert(n && !n.deletedAt && n.userId === actor.id, "Note not found.");
  return n;
}

export async function createNote(actor: Actor, input: { title?: string; body?: string } = {}) {
  const [n] = await db
    .insert(privateNotes)
    .values({ userId: actor.id, title: (input.title ?? "").trim().slice(0, 140), body: (input.body ?? "").slice(0, 20_000) })
    .returning();
  return n;
}

export async function saveNote(actor: Actor, id: string, patch: { title?: string; body?: string; color?: string | null; pinned?: boolean }) {
  await own(actor, id);
  const set: Partial<typeof privateNotes.$inferInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined) set.title = patch.title.trim().slice(0, 140);
  if (patch.body !== undefined) set.body = patch.body.slice(0, 20_000);
  if (patch.color !== undefined) set.color = patch.color && HEX.test(patch.color) ? patch.color : null;
  if (patch.pinned !== undefined) set.pinned = !!patch.pinned;
  await db.update(privateNotes).set(set).where(eq(privateNotes.id, id));
}

export async function deleteNote(actor: Actor, id: string) {
  await own(actor, id);
  await db.update(privateNotes).set({ deletedAt: new Date() }).where(eq(privateNotes.id, id));
}
