import { activityLog, type StageKind } from "@/db/schema";
import type { Tx } from "@/db";

/** Who is making a change. `isAdmin` unlocks the few admin-only operations (e.g. changing a set deadline). */
export type Actor = { id: string; name: string; isAdmin?: boolean; isManager?: boolean; teams?: readonly string[] };

export type LogEntry = {
  action: string;
  summary: string;
  itemId?: string | null;
  brandId?: string | null;
  projectId?: string | null;
  clientId?: string | null;
  subjectUserId?: string | null;
  stageKind?: StageKind | null;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  meta?: Record<string, unknown> | null;
  at?: Date;
};

/** Append one immutable activity record. Always call inside the same transaction as the change. */
export async function logActivity(tx: Tx, actor: Actor | null, entry: LogEntry) {
  await tx.insert(activityLog).values({
    actorId: actor?.id ?? null,
    action: entry.action,
    summary: entry.summary,
    itemId: entry.itemId ?? null,
    brandId: entry.brandId ?? null,
    projectId: entry.projectId ?? null,
    clientId: entry.clientId ?? null,
    subjectUserId: entry.subjectUserId ?? null,
    stageKind: entry.stageKind ?? null,
    field: entry.field ?? null,
    oldValue: entry.oldValue ?? null,
    newValue: entry.newValue ?? null,
    meta: entry.meta ?? null,
    ...(entry.at ? { at: entry.at } : {}),
  });
}
