/**
 * Who can do what. Kept deliberately small and role-based:
 * each team does its own step; managers run the work; the admin can do everything.
 *
 *  - Managers (Shahenda, Ammar, Ayman, Assem): give tasks to anyone, choose who does a step, set deadlines,
 *    see the dashboard and the activity log, approve versions.
 *  - Content team: plans the month, edits content details, sends work to production, approves versions.
 *  - Media / Design: do and submit their step (for any brand or one-off project).
 *  - Social: publishes and edits platform details.
 *  - Deadlines lock once set — only the admin can change one.
 *  - Everyone: can comment, chat, take unassigned work of their team, and send work back with a note.
 */
import type { StageKind, Team } from "@/db/schema";
import { STAGE_META } from "./workflow";

export type Who = { id: string; isAdmin?: boolean; isManager?: boolean; teams?: readonly Team[] | readonly string[] };

const has = (w: Who, t: Team) => !!w.teams?.includes(t);
export const isManager = (w: Who) => !!w.isAdmin || !!w.isManager;

export const can = {
  /** Finish / submit a step. Your own step, your team's step, or admin. Delivery: account, content or managers. */
  doStage(w: Who, stage: { kind: StageKind; assigneeId?: string | null }) {
    if (w.isAdmin || stage.assigneeId === w.id) return true;
    if (stage.kind === "delivery") return has(w, "account") || has(w, "content") || isManager(w);
    const team = STAGE_META[stage.kind].team;
    return !!team && has(w, team);
  },
  /** Choose who does a step (anyone can still take unassigned work of their own team). */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  assign(w: Who, stage?: { kind: StageKind }) {
    return isManager(w);
  },
  /** Put an empty deadline on a step. Changing an existing one is admin-only (see workflow). */
  setDeadline(w: Who) {
    return isManager(w);
  },
  /** Deadlines lock once set; only the CEO/admin can correct one. */
  changeDeadline(w: Who) {
    return !!w.isAdmin;
  },
  excuseLateness(w: Who) {
    return !!w.isAdmin;
  },
  /** Approve a version (v1, v2…) or ask for changes: managers and the Content team. */
  review(w: Who) {
    return isManager(w) || has(w, "content");
  },
  /** Add content, change title/type/Canva link, delete/restore items. */
  editContent(w: Who) {
    return isManager(w) || has(w, "content");
  },
  /** Posting date/time — content plans it, social may move it. */
  editPostingDate(w: Who) {
    return isManager(w) || has(w, "content") || has(w, "social");
  },
  /** Shoot date, time, duration and place. */
  planShoot(w: Who) {
    return isManager(w) || has(w, "media") || has(w, "content");
  },
  /** Platform status, dates and live links. */
  publish(w: Who) {
    return isManager(w) || has(w, "social");
  },
  sendBack() {
    return true;
  },
  /** Give a task to anyone (one-off or repeating). */
  giveTasks(w: Who) {
    return isManager(w);
  },
  /** Dashboard, everyone's numbers, Excel exports of the whole agency. */
  seeDashboard(w: Who) {
    return isManager(w);
  },
  seeActivity(w: Who) {
    return isManager(w);
  },
  manageBrands(w: Who) {
    return !!w.isAdmin;
  },
  manageProjects(w: Who) {
    return isManager(w) || has(w, "content");
  },
  managePeople(w: Who) {
    return !!w.isAdmin;
  },
};

export const NOT_ALLOWED = "You don't have permission to do that. Ask a manager (Shahenda, Ammar, Ayman or Assem).";
