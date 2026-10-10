/**
 * Correcting worked time (Settings → Access: "Edit worked time"): change when a stretch started / ended, add a
 * stretch someone forgot to clock, or remove a wrong one. Every change is in the activity log with the old and
 * new times, and the row remembers who edited it.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { contentItems, contentPlans, projects, stages, users, workSessions } from "@/db/schema";
import { can } from "@/domain/permissions";
import { STAGE_META } from "@/domain/workflow";
import { formatDateTime, formatDuration } from "@/lib/dates";
import { logActivity, type Actor } from "./activity";
import { assert } from "./errors";
import type { Tx } from "@/db";

const NOT_YOURS = "Only people allowed to edit worked time can do that (Settings → Access).";
const MAX = 24 * 3_600_000;

async function refsFor(tx: Tx, itemId: string) {
  const [r] = await tx
    .select({ title: contentItems.title, projectId: contentItems.projectId, brandId: contentPlans.brandId, clientId: projects.clientId })
    .from(contentItems)
    .leftJoin(contentPlans, eq(contentPlans.id, contentItems.planId))
    .leftJoin(projects, eq(projects.id, contentItems.projectId))
    .where(eq(contentItems.id, itemId));
  return { title: r?.title ?? "an item", refs: { itemId, projectId: r?.projectId ?? null, brandId: r?.brandId ?? null, clientId: r?.clientId ?? null } };
}

function check(start: Date, end: Date | null, now: Date) {
  assert(!Number.isNaN(start.getTime()), "Pick when it started.");
  assert(start <= now, "It can't start in the future.");
  if (end) {
    assert(end > start, "The end must be after the start.");
    assert(end <= now, "It can't end in the future.");
    assert(end.getTime() - start.getTime() <= MAX, "One stretch can be at most 24 hours. Add another one for the next day.");
  }
}

const span = (s: Date, e: Date | null) => `${formatDateTime(s)} → ${e ? formatDateTime(e) : "now"}${e ? ` (${formatDuration(e.getTime() - s.getTime())})` : ""}`;

export async function editWorkSession(actor: Actor, sessionId: string, input: { startedAt: Date; endedAt: Date | null }, now = new Date()) {
  assert(can.editTime(actor), NOT_YOURS);
  return db.transaction(async (tx) => {
    const [w] = await tx.select().from(workSessions).where(eq(workSessions.id, sessionId)).for("update");
    assert(w, "That time entry no longer exists.");
    // A running clock can only get an end, never lose it; a finished one keeps one.
    const endedAt = input.endedAt ?? (w.endedAt ? w.endedAt : null);
    check(input.startedAt, endedAt, now);
    if (w.startedAt.getTime() === input.startedAt.getTime() && (w.endedAt?.getTime() ?? null) === (endedAt?.getTime() ?? null)) return false;
    await tx
      .update(workSessions)
      .set({ startedAt: input.startedAt, endedAt, endReason: endedAt && !w.endedAt ? "edited" : w.endReason, editedById: actor.id, editedAt: now })
      .where(eq(workSessions.id, sessionId));
    const [st] = await tx.select({ kind: stages.kind }).from(stages).where(eq(stages.id, w.stageId));
    const [who] = await tx.select({ name: users.name }).from(users).where(eq(users.id, w.userId));
    const { title, refs } = await refsFor(tx, w.itemId);
    await logActivity(tx, actor, {
      ...refs,
      action: "time_edited",
      subjectUserId: w.userId,
      stageKind: st?.kind ?? null,
      field: "time",
      oldValue: span(w.startedAt, w.endedAt),
      newValue: span(input.startedAt, endedAt),
      summary: `${actor.name} corrected ${who?.name ?? "someone"}'s time on ${st ? STAGE_META[st.kind].label : "a step"} for “${title}”: ${span(w.startedAt, w.endedAt)} became ${span(input.startedAt, endedAt)}.`,
    });
    return true;
  });
}

export async function addWorkSession(actor: Actor, stageId: string, input: { userId: string; startedAt: Date; endedAt: Date }, now = new Date()) {
  assert(can.editTime(actor), NOT_YOURS);
  check(input.startedAt, input.endedAt, now);
  return db.transaction(async (tx) => {
    const [st] = await tx.select().from(stages).where(eq(stages.id, stageId));
    assert(st, "Step not found.");
    assert(st.status !== "waiting", "This step hasn't started yet.");
    const [who] = await tx.select({ name: users.name }).from(users).where(and(eq(users.id, input.userId), eq(users.isActive, true)));
    assert(who, "Pick who worked on it.");
    await tx.insert(workSessions).values({
      stageId,
      itemId: st.itemId,
      userId: input.userId,
      kind: "processing",
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      endReason: "added",
      editedById: actor.id,
      editedAt: now,
    });
    const { title, refs } = await refsFor(tx, st.itemId);
    await logActivity(tx, actor, {
      ...refs,
      action: "time_added",
      subjectUserId: input.userId,
      stageKind: st.kind,
      field: "time",
      newValue: span(input.startedAt, input.endedAt),
      summary: `${actor.name} added time for ${who.name} on ${STAGE_META[st.kind].label} for “${title}”: ${span(input.startedAt, input.endedAt)}.`,
    });
  });
}

export async function deleteWorkSession(actor: Actor, sessionId: string) {
  assert(can.editTime(actor), NOT_YOURS);
  return db.transaction(async (tx) => {
    const [w] = await tx.select().from(workSessions).where(eq(workSessions.id, sessionId)).for("update");
    assert(w, "That time entry no longer exists.");
    assert(w.endedAt, "This clock is running. Set an end first, or ask the person to change their status.");
    await tx.delete(workSessions).where(eq(workSessions.id, sessionId));
    const [st] = await tx.select({ kind: stages.kind }).from(stages).where(eq(stages.id, w.stageId));
    const [who] = await tx.select({ name: users.name }).from(users).where(eq(users.id, w.userId));
    const { title, refs } = await refsFor(tx, w.itemId);
    await logActivity(tx, actor, {
      ...refs,
      action: "time_removed",
      subjectUserId: w.userId,
      stageKind: st?.kind ?? null,
      field: "time",
      oldValue: span(w.startedAt, w.endedAt),
      summary: `${actor.name} removed ${who?.name ?? "someone"}'s time on ${st ? STAGE_META[st.kind].label : "a step"} for “${title}”: ${span(w.startedAt, w.endedAt)}.`,
    });
  });
}
