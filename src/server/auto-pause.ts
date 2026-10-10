/**
 * Automatic pause: a clock left running (In progress / Adjusting) stops by itself at the workspace's pause time
 * (Settings → Workspace, default 21:00 Cairo), so a forgotten clock never counts the night. The step shows
 * "Paused"; the person presses In progress to continue. A clock started after that time pauses at midnight.
 * The same 5-minute job runs the Spaces automations that wait for a due date to pass.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { contentItems, contentPlans, projects, stages, workSessions, workTaskSessions } from "@/db/schema";
import { STAGE_META, TIMED_PROGRESS } from "@/domain/workflow";
import { addDays, cairoDate, startOfCairoDay } from "@/lib/dates";
import { logActivity } from "./activity";
import { getWorkspace } from "./settings";
import { fireDueAutomations } from "./spaces";

/** When a clock that started at `startedAt` pauses itself, for a pause time "HH:MM". */
export function pauseInstant(startedAt: Date, at: string): Date {
  const [h, m] = at.split(":").map(Number);
  const day = cairoDate(startedAt);
  const today = new Date(startOfCairoDay(day).getTime() + (h * 60 + m) * 60_000);
  return startedAt < today ? today : startOfCairoDay(addDays(day, 1));
}

/** Pause every clock that ran past the pause time. Returns how many steps were paused. Safe to repeat. */
export async function autoPauseClocks(now = new Date()): Promise<number> {
  const { autoPauseAt } = await getWorkspace();
  if (!autoPauseAt) return 0;
  const open = await db.select().from(workSessions).where(isNull(workSessions.endedAt));
  let paused = 0;
  for (const s of open) {
    const at = pauseInstant(s.startedAt, autoPauseAt);
    if (at > now) continue;
    await db.transaction(async (tx) => {
      const closed = await tx
        .update(workSessions)
        .set({ endedAt: at, endReason: "auto_paused" })
        .where(and(eq(workSessions.id, s.id), isNull(workSessions.endedAt)))
        .returning({ id: workSessions.id });
      if (!closed.length) return;
      const [st] = await tx.select().from(stages).where(eq(stages.id, s.stageId)).for("update");
      if (!st || st.status !== "active" || !TIMED_PROGRESS.includes(st.progress)) return;
      const still = await tx.select({ id: workSessions.id }).from(workSessions).where(and(eq(workSessions.stageId, st.id), isNull(workSessions.endedAt)));
      if (still.length) return;
      await tx.update(stages).set({ progress: "paused", progressAt: at }).where(eq(stages.id, st.id));
      const [item] = await tx
        .select({ title: contentItems.title, projectId: contentItems.projectId, brandId: contentPlans.brandId, clientId: projects.clientId })
        .from(contentItems)
        .leftJoin(contentPlans, eq(contentPlans.id, contentItems.planId))
        .leftJoin(projects, eq(projects.id, contentItems.projectId))
        .where(eq(contentItems.id, st.itemId));
      await logActivity(tx, null, {
        action: "stage_progress",
        itemId: st.itemId,
        projectId: item?.projectId ?? null,
        brandId: item?.brandId ?? null,
        clientId: item?.clientId ?? null,
        subjectUserId: s.userId,
        stageKind: st.kind,
        field: "progress",
        oldValue: st.progress,
        newValue: "paused",
        summary: `The clock on ${STAGE_META[st.kind].label} for “${item?.title ?? "an item"}” paused itself at ${autoPauseAt} (still running at the end of the day).`,
        at,
      });
      paused++;
    });
  }
  // Clocks on Space tasks stop too (the task keeps its status; the clock button starts it again).
  const openTasks = await db.select().from(workTaskSessions).where(isNull(workTaskSessions.endedAt));
  for (const s of openTasks) {
    const at = pauseInstant(s.startedAt, autoPauseAt);
    if (at > now) continue;
    await db.update(workTaskSessions).set({ endedAt: at, endReason: "auto_paused" }).where(and(eq(workTaskSessions.id, s.id), isNull(workTaskSessions.endedAt)));
    paused++;
  }
  return paused;
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Started once by prepareDatabase(): checks every 5 minutes. */
export function startAutoPause() {
  if (timer) return;
  const tick = async () => {
    await autoPauseClocks().catch((e) => console.error("Auto pause failed:", e));
    await fireDueAutomations().catch((e) => console.error("Due-date automations failed:", e));
  };
  timer = setInterval(tick, 5 * 60_000);
  timer.unref?.();
  void tick();
}
