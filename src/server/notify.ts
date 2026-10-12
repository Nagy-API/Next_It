/**
 * In-app notifications. Written in the same transaction as the change that caused them,
 * so a notification never exists for something that didn't happen.
 */
import { and, arrayContains, eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { notifications, users, type StageKind, type Team } from "@/db/schema";
import { STAGE_META } from "@/domain/workflow";
import type { Actor } from "./activity";

export type NotificationKind = "new_task" | "sent_back" | "comment" | "reply" | "assigned" | "deadline" | "finished" | "review" | "approved" | "task" | "chat" | "mention" | "social_failed";

/** Whose task list a step shows up in when nobody is assigned. */
export const STAGE_TEAM: Record<StageKind, Team> = { content: "content", shooting: "media", media: "media", design: "design", social: "social", delivery: "account", approval: "account" };

export async function notify(
  tx: Tx,
  actor: Actor | null,
  userIds: (string | null | undefined)[],
  n: { kind: NotificationKind; title: string; body?: string | null; itemId?: string | null; href?: string | null; at?: Date },
) {
  const ids = [...new Set(userIds.filter((u): u is string => !!u && u !== actor?.id))];
  if (!ids.length) return;
  await tx.insert(notifications).values(
    ids.map((userId) => ({
      userId,
      kind: n.kind,
      title: n.title,
      body: n.body ?? null,
      itemId: n.itemId ?? null,
      href: n.href ?? null,
      actorId: actor?.id ?? null,
      ...(n.at ? { createdAt: n.at } : {}),
    })),
  );
}

/** Active members of the team that does this step. */
export async function teamMembers(tx: Tx, kind: StageKind): Promise<string[]> {
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.isActive, true), arrayContains(users.teams, [STAGE_TEAM[kind]])));
  return rows.map((r) => r.id);
}

/** The assignee if there is one, otherwise everyone in the team. */
export async function stageAudience(tx: Tx, kind: StageKind, assigneeId: string | null): Promise<string[]> {
  return assigneeId ? [assigneeId] : teamMembers(tx, kind);
}

/**
 * The default person for a step when nothing else is set: if a team has exactly one
 * active member (e.g. one graphic designer), work goes straight to them.
 */
export async function soleTeamMember(tx: Tx, kind: StageKind): Promise<string | null> {
  const ids = await teamMembers(tx, kind);
  return ids.length === 1 ? ids[0] : null;
}

export function stageLabel(kind: StageKind) {
  return STAGE_META[kind].label;
}

