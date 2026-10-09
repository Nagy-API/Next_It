import type { StageKind } from "@/db/schema";

export type BackTarget = { kind: StageKind; owner: { id: string; name: string } | null };

/** Steps this item can be sent back to (every earlier step; any done step once it's finished). */
export function backTargetsOf(item: { stages: { kind: StageKind; position: number; status: string; assignee: { id: string; name: string } | null; completedBy: { id: string; name: string } | null }[]; completedAt: Date | null; cancelledAt: Date | null }, cur: { position: number } | null): BackTarget[] {
  if (item.cancelledAt) return [];
  return item.stages
    .filter((s) => (cur ? s.position < cur.position : item.completedAt ? s.status === "done" && s.kind !== "social" && s.kind !== "delivery" : false))
    .map((s) => ({ kind: s.kind, owner: s.assignee ?? s.completedBy ?? null }));
}
