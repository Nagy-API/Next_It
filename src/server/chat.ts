/** Team chat: one shared room, @mentions notify people. */
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { attachments, chatMessages, contentItems, users } from "@/db/schema";
import { isManager } from "@/domain/permissions";
import type { Actor } from "./activity";
import { attachmentsFor, linkPendingTx, type AttachmentView } from "./attachments";
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

export async function postChatMessage(actor: Actor, input: { body: string; itemId?: string | null; attachmentIds?: string[]; now?: Date }) {
  const body = input.body.trim();
  const fileIds = (input.attachmentIds ?? []).slice(0, 10);
  assert(body || fileIds.length, "Write a message.");
  assert(body.length <= 4000, "That message is too long.");
  const now = input.now ?? new Date();
  typing.delete(actor.id);
  return db.transaction(async (tx) => {
    const people = await tx.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true));
    const mentions = findMentions(body, people).filter((id) => id !== actor.id);
    const [m] = await tx.insert(chatMessages).values({ authorId: actor.id, body, mentions, itemId: input.itemId || null, createdAt: now }).returning();
    // Files picked in the composer were uploaded first (waiting, only visible to their owner); now they belong to the message.
    if (fileIds.length) await linkPendingTx(tx, actor, fileIds, [{ chatMessageId: m.id }]);
    await tx.update(users).set({ chatReadAt: now }).where(eq(users.id, actor.id));
    if (mentions.length) {
      await notify(tx, actor, mentions, {
        kind: "mention",
        title: `${actor.name} mentioned you in Team chat`,
        body: body ? (body.length > 140 ? `${body.slice(0, 139)}…` : body) : "Sent a file",
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
  const at = new Date();
  await db.transaction(async (tx) => {
    await tx.update(chatMessages).set({ deletedAt: at }).where(eq(chatMessages.id, messageId));
    // Its files go with it (they stop opening for everyone).
    await tx.update(attachments).set({ deletedAt: at }).where(and(eq(attachments.chatMessageId, messageId), isNull(attachments.deletedAt)));
  });
}

export type ChatFile = Omit<AttachmentView, "createdAt">;

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
  const files = await attachmentsFor({ chatMessageIds: rows.map((r) => r.id) });
  const clean = (f: AttachmentView): ChatFile => ({ id: f.id, kind: f.kind, name: f.name, href: f.href, mime: f.mime, size: f.size, createdById: f.createdById, commentId: f.commentId });
  return rows.reverse().map((r) => ({ ...r, files: (files.get(r.id) ?? []).map(clean) }));
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

/* ------------------------- Presence and typing ------------------------- */

/** Who is typing right now (kept in memory for a few seconds; one app process). */
const typing = new Map<string, { name: string; until: number }>();

export function setTyping(userId: string, name: string) {
  typing.set(userId, { name, until: Date.now() + 6000 });
}

export function typingNow(exceptId: string) {
  const now = Date.now();
  const out: string[] = [];
  for (const [id, t] of typing) {
    if (t.until < now) typing.delete(id);
    else if (id !== exceptId) out.push(t.name);
  }
  return out;
}

/** People the app heard from in the last 2 minutes. */
export async function onlineIds(now = new Date()) {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.isActive, true), gt(users.lastSeenAt, new Date(now.getTime() - 120_000))));
  return rows.map((r) => r.id);
}

/** Last time each person was seen ("seen 2h ago" in chat). */
export async function lastSeen() {
  return db.select({ id: users.id, at: users.lastSeenAt }).from(users).where(eq(users.isActive, true));
}
