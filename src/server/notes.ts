/**
 * Team notes, like Instagram notes: a short line (emojis welcome) on a colour, shown with the person's photo at
 * the top of the Overview for 12 hours. One note per person: a new one replaces the old one.
 */
import "server-only";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notes, users } from "@/db/schema";
import { isManager } from "@/domain/permissions";
import type { Actor } from "./activity";
import { assert } from "./errors";

export const NOTE_HOURS = 12;
export const NOTE_MAX = 80;
export const NOTE_COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#0ea5e9", "#f43f5e", "#0b1639"] as const;

export async function postNote(actor: Actor, text: string, color: string, now = new Date()) {
  const t = text.replace(/\s+/g, " ").trim();
  assert(t, "Write something first.");
  assert([...t].length <= NOTE_MAX, `Keep it short: ${NOTE_MAX} characters at most.`);
  assert((NOTE_COLORS as readonly string[]).includes(color), "Pick one of the colours.");
  return db.transaction(async (tx) => {
    await tx
      .update(notes)
      .set({ deletedAt: now })
      .where(and(eq(notes.userId, actor.id), isNull(notes.deletedAt), gt(notes.expiresAt, now)));
    const [n] = await tx
      .insert(notes)
      .values({ userId: actor.id, text: t, color, createdAt: now, expiresAt: new Date(now.getTime() + NOTE_HOURS * 3_600_000) })
      .returning();
    return n;
  });
}

export async function removeNote(actor: Actor, noteId: string) {
  const [n] = await db.select().from(notes).where(eq(notes.id, noteId));
  assert(n && !n.deletedAt, "That note is already gone.");
  assert(n.userId === actor.id || isManager(actor), "You can only remove your own note.");
  await db.update(notes).set({ deletedAt: new Date() }).where(eq(notes.id, noteId));
}

export type NoteView = { id: string; userId: string; name: string; text: string; color: string; createdAt: Date; expiresAt: Date };

export async function activeNotes(now = new Date()): Promise<NoteView[]> {
  return db
    .select({ id: notes.id, userId: notes.userId, name: users.name, text: notes.text, color: notes.color, createdAt: notes.createdAt, expiresAt: notes.expiresAt })
    .from(notes)
    .innerJoin(users, eq(users.id, notes.userId))
    .where(and(isNull(notes.deletedAt), gt(notes.expiresAt, now), eq(users.isActive, true)))
    .orderBy(asc(notes.createdAt));
}
