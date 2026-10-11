/**
 * The people side: Big updates (the management's news, big on the Overview), the daily message, emoji reactions,
 * kudos between teammates, today's mood and birthdays. Nothing here touches the work itself.
 */
import { and, desc, eq, gt, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { announcements, contentItems, kudos, moods, notifications, reactions, stageCompletions, tasks, users, workSessions } from "@/db/schema";
import { can } from "@/domain/permissions";
import { dailyLine } from "@/lib/cheer";
import { addDays, cairoDate, startOfCairoDay, todayISO, weekRange } from "@/lib/dates";
import { logActivity, type Actor } from "./activity";
import { assert } from "./errors";
import { notify } from "./notify";
import { getWorkspace } from "./settings";

const HEX = /^#[0-9a-fA-F]{6}$/;
export const REACTIONS = ["👍", "❤️", "🎉", "😂", "🔥", "👏", "🙏", "😮"];
type Kind = "announcement" | "chat" | "kudos";

/* ------------------------------ Big updates ------------------------------ */

export async function getUpdates(viewerId: string, now = new Date()) {
  const rows = await db
    .select({ id: announcements.id, title: announcements.title, text: announcements.text, emoji: announcements.emoji, color: announcements.color, pinned: announcements.pinned, createdAt: announcements.createdAt, expiresAt: announcements.expiresAt, by: users.name, byId: users.id })
    .from(announcements)
    .innerJoin(users, eq(users.id, announcements.createdById))
    .where(and(isNull(announcements.deletedAt), or(isNull(announcements.expiresAt), gt(announcements.expiresAt, now))))
    .orderBy(desc(announcements.pinned), desc(announcements.createdAt))
    .limit(8);
  const r = await reactionsFor("announcement", rows.map((x) => x.id), viewerId);
  return rows.map((x) => ({ ...x, reactions: r.get(x.id) ?? [] }));
}

export async function postUpdate(actor: Actor, input: { title?: string | null; text: string; emoji?: string | null; color?: string | null; pinned?: boolean; days?: number }, now = new Date()) {
  assert(can.postUpdates(actor), "Only people allowed to post Big updates can do that (Settings → Access).");
  const text = input.text.trim().slice(0, 1500);
  assert(text, "Write the update.");
  const days = Math.max(0, Math.min(60, Math.round(input.days ?? 3)));
  return db.transaction(async (tx) => {
    const [a] = await tx
      .insert(announcements)
      .values({
        title: input.title?.trim().slice(0, 120) || null,
        text,
        emoji: input.emoji?.trim().slice(0, 12) || null,
        color: input.color && HEX.test(input.color) ? input.color : "#3b82f6",
        pinned: !!input.pinned,
        createdById: actor.id,
        createdAt: now,
        expiresAt: days ? new Date(now.getTime() + days * 86_400_000) : null,
      })
      .returning();
    const everyone = await tx.select({ id: users.id }).from(users).where(eq(users.isActive, true));
    await notify(tx, actor, everyone.map((u) => u.id), { kind: "task", title: a.title ?? "Big update", body: text.slice(0, 140), href: "/overview#updates", at: now });
    await logActivity(tx, actor, { action: "update_posted", summary: `${actor.name} posted a Big update: “${a.title ?? text.slice(0, 80)}”.` });
    return a;
  });
}

export async function removeUpdate(actor: Actor, id: string) {
  assert(can.postUpdates(actor), "Only people allowed to post Big updates can do that.");
  await db.transaction(async (tx) => {
    const [a] = await tx.select().from(announcements).where(eq(announcements.id, id));
    assert(a && !a.deletedAt, "Already removed.");
    await tx.update(announcements).set({ deletedAt: new Date() }).where(eq(announcements.id, id));
    await logActivity(tx, actor, { action: "update_removed", summary: `${actor.name} removed the Big update “${a.title ?? a.text.slice(0, 60)}”.` });
  });
}

export async function pinUpdate(actor: Actor, id: string, pinned: boolean) {
  assert(can.postUpdates(actor), "Only people allowed to post Big updates can do that.");
  await db.update(announcements).set({ pinned }).where(eq(announcements.id, id));
}

/* ------------------------------ Daily message ------------------------------ */

/** The line at the top of every page today: from Settings → Messages (one per day, in turn), else a friendly default. */
export async function dailyMessage(name: string, day = todayISO()) {
  const ws = await getWorkspace();
  const lines = ws.dailyMessages.filter(Boolean);
  if (!lines.length) return dailyLine(name, day);
  const n = Math.floor(startOfCairoDay(day).getTime() / 86_400_000);
  return lines[((n % lines.length) + lines.length) % lines.length];
}

/* -------------------------------- Reactions -------------------------------- */

export async function reactionsFor(kind: Kind, ids: string[], viewerId: string) {
  const out = new Map<string, { emoji: string; count: number; mine: boolean; names: string[] }[]>();
  if (!ids.length) return out;
  const rows = await db
    .select({ targetId: reactions.targetId, emoji: reactions.emoji, userId: reactions.userId, name: users.name })
    .from(reactions)
    .innerJoin(users, eq(users.id, reactions.userId))
    .where(and(eq(reactions.targetKind, kind), inArray(reactions.targetId, ids)))
    .orderBy(reactions.createdAt);
  for (const r of rows) {
    const list = out.get(r.targetId) ?? [];
    let e = list.find((x) => x.emoji === r.emoji);
    if (!e) list.push((e = { emoji: r.emoji, count: 0, mine: false, names: [] }));
    e.count++;
    e.names.push(r.name);
    if (r.userId === viewerId) e.mine = true;
    out.set(r.targetId, list);
  }
  return out;
}

/** Add or remove my reaction. */
export async function toggleReaction(actor: Actor, kind: Kind, targetId: string, emoji: string) {
  assert(["announcement", "chat", "kudos"].includes(kind), "Unknown.");
  assert(/^[0-9a-f-]{36}$/i.test(targetId), "Unknown.");
  assert(REACTIONS.includes(emoji) || /^\p{Extended_Pictographic}/u.test(emoji), "Pick an emoji.");
  const e = emoji.slice(0, 8);
  const where = and(eq(reactions.targetKind, kind), eq(reactions.targetId, targetId), eq(reactions.userId, actor.id), eq(reactions.emoji, e));
  const [cur] = await db.select().from(reactions).where(where);
  if (cur) await db.delete(reactions).where(where);
  else await db.insert(reactions).values({ targetKind: kind, targetId, userId: actor.id, emoji: e }).onConflictDoNothing();
  return !cur;
}

/* ---------------------------------- Kudos ---------------------------------- */

export async function giveKudos(actor: Actor, input: { toId: string; emoji: string; text: string }) {
  const text = input.text.trim().slice(0, 280);
  assert(text, "Say what you're thankful for.");
  assert(input.toId !== actor.id, "Kudos are for someone else.");
  return db.transaction(async (tx) => {
    const [to] = await tx.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.id, input.toId), eq(users.isActive, true)));
    assert(to, "Pick a teammate.");
    const [k] = await tx.insert(kudos).values({ fromId: actor.id, toId: to.id, emoji: input.emoji?.slice(0, 8) || "🌟", text }).returning();
    await notify(tx, actor, [to.id], { kind: "mention", title: `${actor.name} thanked you`, body: text, href: "/overview#kudos" });
    return k;
  });
}

export async function getKudos(viewerId: string, limit = 12) {
  const rows = await db
    .select({ id: kudos.id, emoji: kudos.emoji, text: kudos.text, createdAt: kudos.createdAt, fromId: kudos.fromId, toId: kudos.toId })
    .from(kudos)
    .where(isNull(kudos.deletedAt))
    .orderBy(desc(kudos.createdAt))
    .limit(limit);
  const people = await db.select({ id: users.id, name: users.name }).from(users);
  const r = await reactionsFor("kudos", rows.map((x) => x.id), viewerId);
  return rows.map((k) => ({ ...k, from: people.find((p) => p.id === k.fromId)?.name ?? "Someone", to: people.find((p) => p.id === k.toId)?.name ?? "Someone", reactions: r.get(k.id) ?? [] }));
}

export async function removeKudos(actor: Actor, id: string) {
  const [k] = await db.select().from(kudos).where(eq(kudos.id, id));
  assert(k && !k.deletedAt, "Already removed.");
  assert(k.fromId === actor.id || can.postUpdates(actor), "Only who wrote it can remove it.");
  await db.update(kudos).set({ deletedAt: new Date() }).where(eq(kudos.id, id));
}

/* ---------------------------------- Mood ----------------------------------- */

export const MOODS = ["🤩", "😄", "🙂", "😐", "😴", "🤯", "🤒"];

export async function setMood(actor: Actor, emoji: string | null, day = todayISO()) {
  if (!emoji) {
    await db.delete(moods).where(and(eq(moods.userId, actor.id), eq(moods.day, day)));
    return;
  }
  assert(MOODS.includes(emoji), "Pick one of the moods.");
  await db.insert(moods).values({ userId: actor.id, day, emoji }).onConflictDoUpdate({ target: [moods.userId, moods.day], set: { emoji, createdAt: new Date() } });
}

export async function teamMoods(day = todayISO()) {
  return db.select({ userId: moods.userId, emoji: moods.emoji, name: users.name }).from(moods).innerJoin(users, eq(users.id, moods.userId)).where(eq(moods.day, day));
}

/* -------------------------------- Birthdays -------------------------------- */

export async function setBirthday(actor: Actor, mmdd: string | null) {
  if (mmdd) {
    const m = mmdd.match(/^(\d{2})-(\d{2})$/);
    assert(m && Number(m[1]) >= 1 && Number(m[1]) <= 12 && Number(m[2]) >= 1 && Number(m[2]) <= 31, "Pick the day and month.");
  }
  await db.update(users).set({ birthday: mmdd || null }).where(eq(users.id, actor.id));
}

/** Birthdays today and in the next week. */
export async function upcomingBirthdays(today = todayISO()) {
  const rows = await db.select({ id: users.id, name: users.name, birthday: users.birthday }).from(users).where(and(eq(users.isActive, true), sql`${users.birthday} is not null`));
  const days = Array.from({ length: 8 }, (_, i) => addDays(today, i));
  return rows
    .map((r) => ({ ...r, inDays: days.findIndex((d) => d.slice(5) === r.birthday) }))
    .filter((r) => r.inDays >= 0)
    .sort((a, b) => a.inDays - b.inDays);
}

/* ------------------------------ Star of the week ----------------------------- */

/** Who finished the most steps on time this week (a friendly shout-out, not a ranking page). */
export async function starsOfTheWeek(today = todayISO()) {
  const wk = weekRange(today);
  const rows = await db
    .select({ userId: stageCompletions.creditedUserId, done: sql<number>`count(*)::int`, onTime: sql<number>`count(*) filter (where ${stageCompletions.lateDays} <= 0 or ${stageCompletions.excused})::int` })
    .from(stageCompletions)
    .where(gte(stageCompletions.completedAt, startOfCairoDay(wk.start)))
    .groupBy(stageCompletions.creditedUserId);
  const people = await db.select({ id: users.id, name: users.name, isActive: users.isActive }).from(users);
  return rows
    .map((r) => ({ ...r, name: people.find((p) => p.id === r.userId)?.name ?? "", active: people.find((p) => p.id === r.userId)?.isActive }))
    .filter((r) => r.active && r.onTime > 0)
    .sort((a, b) => b.onTime - a.onTime || b.done - a.done)
    .slice(0, 3);
}

/* ------------------------------ Thank you ----------------------------- */

/** "Thanks!" to the person who handed me the work: a private notification (once per item, person and day). */
export async function thankFor(actor: Actor, input: { itemId: string; toId: string }, now = new Date()) {
  assert(/^[0-9a-f-]{36}$/i.test(input.itemId) && /^[0-9a-f-]{36}$/i.test(input.toId), "Not found.");
  assert(input.toId !== actor.id, "That's you!");
  return db.transaction(async (tx) => {
    const [to] = await tx.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.id, input.toId), eq(users.isActive, true)));
    const [item] = await tx.select({ id: contentItems.id, title: contentItems.title }).from(contentItems).where(eq(contentItems.id, input.itemId));
    assert(to && item, "Not found.");
    const title = `${actor.name} says thank you`;
    const [already] = await tx
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, to.id), eq(notifications.itemId, item.id), eq(notifications.title, title), gte(notifications.createdAt, startOfCairoDay(todayISO(now)))));
    if (already) return { name: to.name, again: true };
    await notify(tx, actor, [to.id], { kind: "mention", title, body: `For handing over “${item.title}”.`, itemId: item.id, at: now });
    await logActivity(tx, actor, { action: "thanked", itemId: item.id, summary: `${actor.name} thanked ${to.name} for “${item.title}”.` });
    return { name: to.name, again: false };
  });
}

/* ------------------------------ My day ----------------------------- */

/** Today for one person: steps finished, to-dos done, time on the clock, and how many working days in a row they finished something. */
export async function myDay(userId: string, now = new Date()) {
  const today = todayISO(now);
  const start = startOfCairoDay(today);
  const [steps] = await db
    .select({ n: sql<number>`count(*)::int`, onTime: sql<number>`count(*) filter (where ${stageCompletions.lateDays} <= 0 or ${stageCompletions.excused})::int`, first: sql<Date | null>`min(${stageCompletions.completedAt})` })
    .from(stageCompletions)
    .where(and(eq(stageCompletions.creditedUserId, userId), gte(stageCompletions.completedAt, start)));
  const [todos] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.assigneeId, userId), isNull(tasks.deletedAt), gte(tasks.doneAt, start)));
  const sessions = await db
    .select({ startedAt: workSessions.startedAt, endedAt: workSessions.endedAt })
    .from(workSessions)
    .where(and(eq(workSessions.userId, userId), or(isNull(workSessions.endedAt), gt(workSessions.endedAt, start))));
  const workedMs = sessions.reduce((sum, w) => sum + Math.max(0, Math.min((w.endedAt ?? now).getTime(), now.getTime()) - Math.max(w.startedAt.getTime(), start.getTime())), 0);
  // The streak: working days (Friday is the weekend) with at least one finished step, counting back from today.
  const since = startOfCairoDay(addDays(today, -90));
  const days = new Set(
    (
      await db
        .select({ day: sql<string>`to_char(${stageCompletions.completedAt} at time zone 'Africa/Cairo', 'YYYY-MM-DD')` })
        .from(stageCompletions)
        .where(and(eq(stageCompletions.creditedUserId, userId), gte(stageCompletions.completedAt, since)))
    ).map((r) => r.day),
  );
  let streak = 0;
  let d = days.has(today) ? today : addDays(today, -1);
  for (let i = 0; i < 90; i++, d = addDays(d, -1)) {
    if (new Date(`${d}T12:00:00Z`).getUTCDay() === 5) continue;
    if (!days.has(d)) break;
    streak++;
  }
  return { steps: steps?.n ?? 0, onTime: steps?.onTime ?? 0, todos: todos?.n ?? 0, workedMs, streak };
}

export function cairoToday(now = new Date()) {
  return cairoDate(now);
}
