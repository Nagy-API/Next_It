/** Each person's own order for their work in My tasks (drag to reorder). Only affects what they see. */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { personalOrder } from "@/db/schema";
import type { Actor } from "./activity";
import { assert } from "./errors";

const KEY = /^(item|task|space):[0-9a-f-]{36}$/i;

export async function getOrder(userId: string, keys: string[]) {
  const ok = keys.filter((k) => KEY.test(k));
  if (!ok.length) return new Map<string, number>();
  const rows = await db.select().from(personalOrder).where(and(eq(personalOrder.userId, userId), inArray(personalOrder.key, ok)));
  return new Map(rows.map((r) => [r.key, r.position]));
}

/** Saves the list in this order (first = top). */
export async function saveOrder(actor: Actor, keys: string[]) {
  const ok = [...new Set(keys)].filter((k) => KEY.test(k)).slice(0, 300);
  assert(ok.length, "Nothing to order.");
  await db.transaction(async (tx) => {
    await tx.delete(personalOrder).where(and(eq(personalOrder.userId, actor.id), inArray(personalOrder.key, ok)));
    await tx.insert(personalOrder).values(ok.map((key, position) => ({ userId: actor.id, key, position })));
  });
}

/** Back to the automatic order (by day). */
export async function resetOrder(actor: Actor, keys: string[]) {
  const ok = keys.filter((k) => KEY.test(k)).slice(0, 300);
  if (!ok.length) return;
  await db.delete(personalOrder).where(and(eq(personalOrder.userId, actor.id), inArray(personalOrder.key, ok)));
}

/** Sort by my order when I set one; items I never placed keep the automatic order after them. */
export function applyOrder<T>(list: T[], keyOf: (x: T) => string, order: Map<string, number>) {
  if (!list.some((x) => order.has(keyOf(x)))) return { list, custom: false };
  const idx = new Map(list.map((x, i) => [x, i]));
  const sorted = [...list].sort((a, b) => (order.get(keyOf(a)) ?? 10_000 + idx.get(a)!) - (order.get(keyOf(b)) ?? 10_000 + idx.get(b)!));
  return { list: sorted, custom: true };
}
