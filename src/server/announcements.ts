/** Message of the day: one pinned line everyone sees at the top of every page until it expires or is cleared. */
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { announcements, users } from "@/db/schema";
import { can } from "@/domain/permissions";
import { logActivity, type Actor } from "./activity";
import { assert } from "./errors";

const HEX = /^#[0-9a-fA-F]{6}$/;

export async function currentAnnouncement(now = new Date()) {
  const [a] = await db
    .select({ id: announcements.id, text: announcements.text, emoji: announcements.emoji, color: announcements.color, createdAt: announcements.createdAt, expiresAt: announcements.expiresAt, by: users.name })
    .from(announcements)
    .innerJoin(users, eq(users.id, announcements.createdById))
    .where(and(isNull(announcements.deletedAt), or(isNull(announcements.expiresAt), gt(announcements.expiresAt, now))))
    .orderBy(desc(announcements.createdAt))
    .limit(1);
  return a ?? null;
}

/** hours: how long it stays (0 = until someone clears it). Posting replaces the current one. */
export async function postAnnouncement(actor: Actor, input: { text: string; emoji?: string | null; color?: string | null; hours?: number }, now = new Date()) {
  assert(can.announce(actor), "Only people allowed to post the message of the day can do that.");
  const text = input.text.trim().slice(0, 280);
  assert(text, "Write the message.");
  const hours = Math.max(0, Math.min(24 * 14, Math.round(input.hours ?? 24)));
  return db.transaction(async (tx) => {
    await tx.update(announcements).set({ deletedAt: now }).where(isNull(announcements.deletedAt));
    const [a] = await tx
      .insert(announcements)
      .values({ text, emoji: input.emoji?.trim().slice(0, 8) || null, color: input.color && HEX.test(input.color) ? input.color : "#3b82f6", createdById: actor.id, createdAt: now, expiresAt: hours ? new Date(now.getTime() + hours * 3_600_000) : null })
      .returning();
    await logActivity(tx, actor, { action: "announcement_posted", summary: `${actor.name} posted the message of the day: “${text}”.` });
    return a;
  });
}

export async function clearAnnouncement(actor: Actor) {
  assert(can.announce(actor), "Only people allowed to post the message of the day can do that.");
  await db.transaction(async (tx) => {
    await tx.update(announcements).set({ deletedAt: new Date() }).where(isNull(announcements.deletedAt));
    await logActivity(tx, actor, { action: "announcement_cleared", summary: `${actor.name} cleared the message of the day.` });
  });
}
