/** Team chat: one shared room, @mentions notify people. */
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { chatMessages, contentItems, users } from "@/db/schema";
import { isManager } from "@/domain/permissions";
import type { Actor } from "./activity";
import { assert } from "./errors";
import { notify } from "./notify";

/** People mentioned as @Name (first name or full name, case-insensitive), plus @everyone. */
export function findMentions(body: string, people: { id: string; name: string }[]): string[] {
  const text = ` ${body.toLowerCase()} `;
  if (/(^|\s)@(everyone|all|team)\b/.test(text)) return people.map((p) => p.id);
  const hits = new Set<string>();
  // Longest names first so "@Ahmed Ali" wins over "@Ahmed".
  for (const p of [...people].sort((a, b) => b.name.length - a.name.length)) {
    const n = p.name.toLowerCase();
    const first = n.split(/\s+/)[0];
    for (const cand of [n, first]) {
      const i = text.indexOf(`@${cand}`);
      if (i >= 0 && !/[\p{L}\p{N}]/u.test(text[i + cand.length + 1] ?? " ")) {
        hits.add(p.id);
        break;
      }
    }
  }
  return [...hits];
}

export async function postChatMessage(actor: Actor, input: { body: string; itemId?: string | null; now?: Date }) {
  const body = input.body.trim();
  assert(body, "Write a message.");
  assert(body.length <= 4000, "That message is too long.");
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const people = await tx.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true));
    const mentions = findMentions(body, people).filter((id) => id !== actor.id);
    const [m] = await tx.insert(chatMessages).values({ authorId: actor.id, body, mentions, itemId: input.itemId || null, createdAt: now }).returning();
    await tx.update(users).set({ chatReadAt: now }).where(eq(users.id, actor.id));
    if (mentions.length) {
      await notify(tx, actor, mentions, {
        kind: "mention",
        title: `${actor.name} mentioned you in Team chat`,
        body: body.length > 140 ? `${body.slice(0, 139)}…` : body,
        href: `/chat#m-${m.id}`,
        at: now,
      });
    }
    return m;
  });
}

export async function deleteChatMessage(actor: Actor, messageId: string) {
  const [m] = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId));
  assert(m && !m.deletedAt, "Message not found.");
  assert(m.authorId === actor.id || isManager(actor), "You can only delete your own messages.");
  await db.update(chatMessages).set({ deletedAt: new Date() }).where(eq(chatMessages.id, messageId));
}

export async function getChatMessages(opts: { after?: Date; before?: Date; limit?: number } = {}) {
  const rows = await db
    .select({
      id: chatMessages.id,
      body: chatMessages.body,
      createdAt: chatMessages.createdAt,
      authorId: chatMessages.authorId,
      authorName: users.name,
      mentions: chatMessages.mentions,
      itemId: chatMessages.itemId,
      itemTitle: contentItems.title,
    })
    .from(chatMessages)
    .innerJoin(users, eq(users.id, chatMessages.authorId))
    .leftJoin(contentItems, eq(contentItems.id, chatMessages.itemId))
    .where(
      and(
        isNull(chatMessages.deletedAt),
        opts.after ? gt(chatMessages.createdAt, opts.after) : undefined,
        opts.before ? lt(chatMessages.createdAt, opts.before) : undefined,
      ),
    )
    .orderBy(desc(chatMessages.createdAt))
    .limit(opts.limit ?? 80);
  return rows.reverse();
}

export async function markChatRead(userId: string) {
  await db.update(users).set({ chatReadAt: new Date() }).where(eq(users.id, userId));
}

export async function unreadChatCount(userId: string) {
  const [u] = await db.select({ at: users.chatReadAt }).from(users).where(eq(users.id, userId));
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(chatMessages)
    .where(and(isNull(chatMessages.deletedAt), sql`${chatMessages.authorId} <> ${userId}`, u?.at ? gt(chatMessages.createdAt, u.at) : undefined));
  return n;
}
