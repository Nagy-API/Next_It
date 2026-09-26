/**
 * Who can do what. Kept deliberately small and role-based:
 * each team does its own step; admins (Shahenda / IT) can do everything.
 *
 *  - Content team: plans the month, edits content details, sends work to production.
 *  - Media / Design: do and submit their step (for any brand or one-off project).
 *  - Social: publishes and edits platform details.
 *  - Managers (CEO, account management): set deadlines (locked once set — only the admin can change one),
 *    request changes, deliver one-off work.
 *  - Everyone: can comment, and can send work back with a note when something is wrong.
 */
import type { StageKind, Team } from "@/db/schema";
import { STAGE_META } from "./workflow";

export type Who = { id: string; isAdmin?: boolean; teams?: readonly Team[] | readonly string[] };

const has = (w: Who, t: Team) => !!w.teams?.includes(t);
const manager = (w: Who) => !!w.isAdmin || has(w, "leadership") || has(w, "account");

export const can = {
  /** Finish / submit a step. Your own step, your team's step, or admin. Delivery: account or content. */
  doStage(w: Who, stage: { kind: StageKind; assigneeId?: string | null }) {
    if (w.isAdmin || stage.assigneeId === w.id) return true;
    if (stage.kind === "delivery") return has(w, "account") || has(w, "content") || has(w, "leadership");
    const team = STAGE_META[stage.kind].team;
    return !!team && has(w, team);
  },
  /** Choose who in a team does a step: that team, managers, or whoever is handing it over (checked separately). */
  assign(w: Who, stage: { kind: StageKind }) {
    if (manager(w)) return true;
    const team = STAGE_META[stage.kind].team;
    return !!team && has(w, team);
  },
  /** Put an empty deadline on a step. Changing an existing one is admin-only (see workflow). */
  setDeadline(w: Who) {
    return manager(w);
  },
  /** Deadlines lock once set; only the CEO/admin can correct one. */
  changeDeadline(w: Who) {
    return !!w.isAdmin;
  },
  excuseLateness(w: Who) {
    return !!w.isAdmin;
  },
  /** Add content, change title/type/Canva link, cancel/restore items. */
  editContent(w: Who) {
    return manager(w) || has(w, "content");
  },
  /** Posting date/time — content plans it, social may move it. */
  editPostingDate(w: Who) {
    return manager(w) || has(w, "content") || has(w, "social");
  },
  /** Platform status, dates and live links. */
  publish(w: Who) {
    return manager(w) || has(w, "social");
  },
  sendBack() {
    return true;
  },
  manageBrands(w: Who) {
    return !!w.isAdmin;
  },
  manageProjects(w: Who) {
    return manager(w) || has(w, "content");
  },
  managePeople(w: Who) {
    return !!w.isAdmin;
  },
};

export const NOT_ALLOWED = "You don't have permission to do that. Ask your team lead or Shahenda.";
