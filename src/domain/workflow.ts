/**
 * Pure workflow rules. No database access here — the server layer calls these
 * so the rules can be unit-tested and reused by every screen.
 */
import type { ContentType, PlatformStatus, StageKind, StageStatus, Team } from "@/db/schema";
import { addDays, cairoDate, diffDays, todayISO } from "@/lib/dates";

export type WorkContext = "plan" | "project";

export const STAGE_META: Record<
  StageKind,
  { label: string; short: string; team: Team | null; completeLabel: string; needsDriveLink: boolean }
> = {
  content: { label: "Content", short: "Content", team: "content", completeLabel: "Content is ready", needsDriveLink: false },
  shooting: { label: "Pre-production", short: "Shooting", team: "media", completeLabel: "Shooting done", needsDriveLink: false },
  media: { label: "Post-production", short: "Editing", team: "media", completeLabel: "Submit final video", needsDriveLink: true },
  design: { label: "Graphic Design", short: "Design", team: "design", completeLabel: "Submit design", needsDriveLink: true },
  social: { label: "Social Media", short: "Social", team: "social", completeLabel: "Mark as published", needsDriveLink: false },
  delivery: { label: "Delivery", short: "Delivery", team: null, completeLabel: "Mark as delivered", needsDriveLink: false },
};

export const TYPE_META: Record<ContentType, { label: string; plural: string }> = {
  reel: { label: "Reel", plural: "Reels" },
  static: { label: "Static", plural: "Statics" },
  carousel: { label: "Carousel", plural: "Carousels" },
  story: { label: "Story", plural: "Stories" },
};

export const TEAM_META: Record<Team, { label: string }> = {
  leadership: { label: "Leadership" },
  content: { label: "Content Creation" },
  media: { label: "Media Production" },
  design: { label: "Graphic Design" },
  social: { label: "Social Media" },
  account: { label: "Account Management" },
};

export const PLATFORM_STATUS_META: Record<PlatformStatus, { label: string; targeted: boolean }> = {
  not_planned: { label: "Not planned", targeted: false },
  pending: { label: "Pending", targeted: true },
  scheduled: { label: "Scheduled", targeted: true },
  published: { label: "Published", targeted: true },
  cancelled: { label: "Cancelled", targeted: false },
};

/**
 * The route an item follows is fully determined by its type and whether it is
 * monthly brand content (published by NEXORA) or one-off project work (delivered to the client).
 */
export function routeFor(type: ContentType, context: WorkContext): StageKind[] {
  const production: StageKind[] = type === "reel" ? ["shooting", "media"] : type === "story" ? [] : ["design"];
  const finish: StageKind = context === "plan" ? "social" : "delivery";
  return ["content", ...production, finish];
}

/**
 * Where work can be sent when a stage is finished. Content chooses the team
 * (Media, Graphic Design, or straight to Social/Delivery); later stages have one next step.
 */
export function handoffTargets(from: StageKind, context: WorkContext): StageKind[] {
  const final: StageKind = context === "plan" ? "social" : "delivery";
  if (from === "content") return ["shooting", "media", "design", final];
  if (from === "shooting") return ["media"];
  if (from === "media" || from === "design") return [final];
  return [];
}

/** The route after `from` when work is sent to `target`. */
export function routeAfter(target: StageKind, context: WorkContext): StageKind[] {
  const final: StageKind = context === "plan" ? "social" : "delivery";
  if (target === final) return [final];
  if (target === "shooting") return ["shooting", "media", final];
  return [target, final];
}

/** Steps whose output is a file that goes through versions (v1, v2…) and approval. */
export function isReviewed(kind: StageKind) {
  return kind === "media" || kind === "design";
}

export function finalLabel(context: WorkContext): string {
  return context === "plan" ? "Published" : "Delivered";
}

/* ------------------------------------------------------------------ */
/* Deadlines                                                            */
/* ------------------------------------------------------------------ */

export type StageLike = {
  kind: StageKind;
  position: number;
  status: StageStatus;
  deadline: string | null;
  completedAt: Date | null;
  returnedAt: Date | null;
  round: number;
  lateExcusedAt: Date | null;
};

/** Days late for a completion on `completedDay` against `deadline` (0 when on time or no deadline). */
export function lateDaysFor(completedDay: string, deadline: string | null): number {
  if (!deadline) return 0;
  return Math.max(0, diffDays(completedDay, deadline));
}

/**
 * Does the deadline count for accountability in the current round?
 * First pass: always. After work was returned, the old deadline is stale unless
 * someone set a new one on/after the day it was returned.
 */
export function deadlineApplies(stage: Pick<StageLike, "round" | "deadline" | "returnedAt">): boolean {
  if (!stage.deadline) return false;
  if (stage.round <= 1 || !stage.returnedAt) return true;
  return stage.deadline >= cairoDate(stage.returnedAt);
}

/**
 * How far downstream deadlines must move when a stage is completed.
 * `alreadyPropagated` prevents the same delay being applied twice when a stage is
 * completed again after being returned.
 */
export function downstreamShift(lateDays: number, alreadyPropagated: number): number {
  return Math.max(0, lateDays - alreadyPropagated);
}

export function shiftedDeadline(deadline: string, days: number): string {
  return addDays(deadline, days);
}

export type StageHealth =
  | "done_on_time"
  | "done_late"
  | "done_excused"
  | "done"
  | "overdue"
  | "overdue_excused"
  | "due_today"
  | "due_soon"
  | "on_track"
  | "no_deadline"
  | "rework"
  | "blocked"
  | "waiting";

/**
 * The single source of truth for "is this late?".
 * - A stage that hasn't received the work yet is never late: it's blocked/waiting.
 * - No deadline means never late.
 * - Excused lateness is shown but not counted.
 */
export function stageHealth(stage: StageLike, today: string = todayISO()): StageHealth {
  if (stage.status === "done") {
    if (!stage.deadline || !stage.completedAt || !deadlineApplies(stage)) return stage.deadline ? "done" : "done";
    const late = lateDaysFor(cairoDate(stage.completedAt), stage.deadline);
    if (late === 0) return "done_on_time";
    return stage.lateExcusedAt ? "done_excused" : "done_late";
  }
  if (stage.status === "waiting") {
    return stage.deadline && stage.deadline < today ? "blocked" : "waiting";
  }
  // active
  if (!stage.deadline) return stage.round > 1 ? "rework" : "no_deadline";
  if (!deadlineApplies(stage)) return "rework";
  const d = diffDays(stage.deadline, today);
  if (d < 0) return stage.lateExcusedAt ? "overdue_excused" : "overdue";
  if (d === 0) return "due_today";
  if (d <= 2) return "due_soon";
  return "on_track";
}

export function isOverdue(h: StageHealth) {
  return h === "overdue";
}

/* ------------------------------------------------------------------ */
/* Social publishing                                                   */
/* ------------------------------------------------------------------ */

/**
 * Social work is complete once every targeted platform is published
 * (cancelled / not planned platforms don't hold it back) and at least one is live.
 */
export function socialComplete(rows: { status: PlatformStatus }[]): boolean {
  const targeted = rows.filter((r) => PLATFORM_STATUS_META[r.status].targeted);
  return targeted.length > 0 && targeted.every((r) => r.status === "published");
}

/* ------------------------------------------------------------------ */
/* Item-level status                                                    */
/* ------------------------------------------------------------------ */

export type ItemPhase = "cancelled" | "done" | "in_progress";

export function currentStage<T extends { status: StageStatus; position: number }>(stages: T[]): T | null {
  return [...stages].sort((a, b) => a.position - b.position).find((s) => s.status === "active") ?? null;
}

export function itemPhase(item: { cancelledAt: Date | null; completedAt: Date | null }): ItemPhase {
  if (item.cancelledAt) return "cancelled";
  if (item.completedAt) return "done";
  return "in_progress";
}

/** Can work move back to `target`? Only to a stage before the current one (or any stage once finished). */
export function canReturnTo(stages: { kind: StageKind; position: number; status: StageStatus }[], target: StageKind): boolean {
  const t = stages.find((s) => s.kind === target);
  if (!t) return false;
  const cur = currentStage(stages);
  if (!cur) return t.status === "done"; // finished item: any completed stage can be reopened
  return t.position < cur.position;
}

/** Heuristic used by bulk add to pre-fill the type from a Canva page title. */
export function guessTypeFromTitle(title: string): ContentType | null {
  const t = title.toLowerCase();
  if (/\bcarou?sel\b/.test(t)) return "carousel";
  if (/\bstor(y|ies)\b/.test(t)) return "story";
  if (/\b(post|static|poster)\b/.test(t)) return "static";
  if (/\b(reel|video|ugc)\b/.test(t)) return "reel";
  return null;
}

export function parseContentType(v: string | null | undefined): ContentType | null {
  if (!v) return null;
  const t = v.trim().toLowerCase();
  if (["reel", "reels", "video", "r"].includes(t)) return "reel";
  if (["static", "statics", "post", "posts", "s", "image"].includes(t)) return "static";
  if (["carousel", "carousels", "carrousel", "c"].includes(t)) return "carousel";
  if (["story", "stories"].includes(t)) return "story";
  return null;
}

/* ------------------------------------------------------------------ */
/* "New" work: just arrived, not started — always shown first            */
/* ------------------------------------------------------------------ */

const NEW_FOR_MS = 3 * 86_400_000;

/** A step that reached this person in the last 3 days and hasn't been started yet. */
export function isNewWork(i: { current: { activatedAt: Date | null; progress: string } | null }, now = Date.now()) {
  const c = i.current;
  return !!c?.activatedAt && c.progress === "not_started" && now - new Date(c.activatedAt).getTime() < NEW_FOR_MS;
}

/** A manager's to-do given in the last 3 days and not done yet. */
export function isNewTask(t: { doneAt: Date | null; createdAt: Date }, now = Date.now()) {
  return !t.doneAt && now - new Date(t.createdAt).getTime() < NEW_FOR_MS;
}
