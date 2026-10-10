/**
 * Who can do what.
 *
 * Every permission has a key and a sensible default rule (by role and team). People who manage access
 * (Settings → Access) can turn any permission on or off for any person; those changes are stored as
 * `permission_overrides` and arrive here as `w.perms`. Nothing needs code to change who may do what.
 *
 * Defaults:
 *  - Admins (owners / IT): everything, including customizing the workspace and managing access.
 *  - Managers: give tasks, choose people, set deadlines, Dashboard / Reports / Activity log, approve versions.
 *  - Content: plans the month, edits content, sends work to production, approves versions.
 *  - Media / Design: do and submit their step. Social: publishing.
 *  - Everyone: comment, chat, take unassigned work, send work back with a note.
 */
import type { StageKind, Team } from "@/db/schema";
import { STAGE_META } from "./workflow";

export type Who = {
  id: string;
  isAdmin?: boolean;
  isManager?: boolean;
  teams?: readonly Team[] | readonly string[];
  /** Per-person changes to the defaults (from Settings → Access): key → allowed. */
  perms?: Readonly<Record<string, boolean>>;
};

const has = (w: Who, t: Team) => !!w.teams?.includes(t);
export const isManager = (w: Who) => !!w.isAdmin || !!w.isManager;
const admin = (w: Who) => !!w.isAdmin;

type Rule = (w: Who) => boolean;
export type PermissionDef = { label: string; hint: string; group: string; rule: Rule };

/** Every permission, grouped for the Access screen. The order here is the order on screen. */
export const PERMISSIONS = {
  // Workspace & access
  "workspace.customize": { group: "Workspace", label: "Customize the workspace", hint: "Name, colours, logos, modules, auto pause", rule: admin },
  "access.manage": { group: "Workspace", label: "Manage access", hint: "Turn these permissions on or off for anyone", rule: admin },
  "people.manage": { group: "Workspace", label: "Manage people", hint: "Create accounts, reset passwords, deactivate", rule: admin },
  "brands.manage": { group: "Workspace", label: "Manage brands", hint: "Create, edit, logos, default people", rule: admin },
  "platforms.manage": { group: "Workspace", label: "Manage platforms", hint: "Instagram, TikTok…", rule: admin },
  "backup.download": { group: "Workspace", label: "Download backups", hint: "A full copy of the data", rule: admin },
  // Spaces (workflow builder)
  "workflow.manage": { group: "Spaces", label: "Build workflows", hint: "Create spaces, statuses, fields, lists and automations", rule: admin },
  "spaces.seeAll": { group: "Spaces", label: "See every space", hint: "Including private ones", rule: admin },
  "spaces.create": { group: "Spaces", label: "Create spaces", hint: "New departments / workspaces", rule: isManager },
  // Managing work
  "tasks.give": { group: "Managing", label: "Give tasks", hint: "To anyone, with or without a brand", rule: isManager },
  "assign": { group: "Managing", label: "Choose who does a step", hint: "Assign or reassign anyone", rule: isManager },
  "deadline.set": { group: "Managing", label: "Set deadlines", hint: "On steps that don't have one", rule: isManager },
  "deadline.change": { group: "Managing", label: "Change set deadlines", hint: "And excuse missed ones", rule: admin },
  "time.edit": { group: "Managing", label: "Edit worked time", hint: "Correct the clock on any step", rule: admin },
  "extra.mark": { group: "Managing", label: "Mark work as extra", hint: "Or not extra", rule: isManager },
  "announce": { group: "Managing", label: "Write the daily message", hint: "The line at the top of every page (Settings → Messages)", rule: admin },
  "updates.post": { group: "Managing", label: "Post Big updates", hint: "Meetings, thanks, news: shown big on the Overview", rule: admin },
  // Seeing numbers
  "dashboard.see": { group: "Numbers", label: "See the Dashboard", hint: "Every brand, team and person", rule: isManager },
  "reports.see": { group: "Numbers", label: "See Reports", hint: "People and brands, any period, Excel", rule: isManager },
  "activity.see": { group: "Numbers", label: "See the Activity log", hint: "Everything that happened", rule: isManager },
  "people.seeNumbers": { group: "Numbers", label: "See everyone's numbers", hint: "Other people's pages and exports", rule: isManager },
  // Content workflow
  "content.edit": { group: "Content", label: "Add and edit content", hint: "Titles, types, links, delete / restore", rule: (w) => isManager(w) || has(w, "content") },
  "versions.review": { group: "Content", label: "Approve versions", hint: "Approve or ask for changes", rule: (w) => isManager(w) || has(w, "content") },
  "postingDate.edit": { group: "Content", label: "Change posting dates", hint: "", rule: (w) => isManager(w) || has(w, "content") || has(w, "social") },
  "shoot.plan": { group: "Content", label: "Plan shoots", hint: "Day, time, place, people, rentals", rule: (w) => isManager(w) || has(w, "media") || has(w, "content") },
  "publish": { group: "Content", label: "Publish", hint: "Platform status, dates and live links", rule: (w) => isManager(w) || has(w, "social") },
  "projects.manage": { group: "Content", label: "Manage one-off projects", hint: "Clients and projects", rule: (w) => isManager(w) || has(w, "content") },
} satisfies Record<string, PermissionDef>;

export type PermissionKey = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

/** The default (by role and team), before any per-person change. */
export function defaultAllowed(w: Who, key: PermissionKey) {
  return PERMISSIONS[key].rule(w);
}

/** What actually applies: a per-person change wins over the default. */
export function allowed(w: Who, key: PermissionKey) {
  const o = w.perms?.[key];
  return typeof o === "boolean" ? o : defaultAllowed(w, key);
}

export const can = {
  /** Finish / submit a step. Your own step, your team's step, or admin. Delivery: account, content or managers. */
  doStage(w: Who, stage: { kind: StageKind; assigneeId?: string | null }) {
    if (w.isAdmin || stage.assigneeId === w.id) return true;
    if (stage.kind === "delivery") return has(w, "account") || has(w, "content") || isManager(w);
    const team = STAGE_META[stage.kind].team;
    return !!team && has(w, team);
  },
  /** Choose who does a step (anyone can still take unassigned work). */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  assign(w: Who, stage?: { kind: StageKind }) {
    return allowed(w, "assign");
  },
  setDeadline(w: Who) {
    return allowed(w, "deadline.set");
  },
  changeDeadline(w: Who) {
    return allowed(w, "deadline.change");
  },
  excuseLateness(w: Who) {
    return allowed(w, "deadline.change");
  },
  review(w: Who) {
    return allowed(w, "versions.review");
  },
  editContent(w: Who) {
    return allowed(w, "content.edit");
  },
  editPostingDate(w: Who) {
    return allowed(w, "postingDate.edit");
  },
  planShoot(w: Who) {
    return allowed(w, "shoot.plan");
  },
  publish(w: Who) {
    return allowed(w, "publish");
  },
  sendBack() {
    return true;
  },
  giveTasks(w: Who) {
    return allowed(w, "tasks.give");
  },
  seeDashboard(w: Who) {
    return allowed(w, "dashboard.see");
  },
  seeReports(w: Who) {
    return allowed(w, "reports.see");
  },
  seeActivity(w: Who) {
    return allowed(w, "activity.see");
  },
  seeEveryone(w: Who) {
    return allowed(w, "people.seeNumbers");
  },
  manageBrands(w: Who) {
    return allowed(w, "brands.manage");
  },
  manageProjects(w: Who) {
    return allowed(w, "projects.manage");
  },
  managePeople(w: Who) {
    return allowed(w, "people.manage");
  },
  managePlatforms(w: Who) {
    return allowed(w, "platforms.manage");
  },
  manageAccess(w: Who) {
    return allowed(w, "access.manage");
  },
  customizeWorkspace(w: Who) {
    return allowed(w, "workspace.customize");
  },
  editTime(w: Who) {
    return allowed(w, "time.edit");
  },
  markExtra(w: Who) {
    return allowed(w, "extra.mark");
  },
  announce(w: Who) {
    return allowed(w, "announce");
  },
  postUpdates(w: Who) {
    return allowed(w, "updates.post");
  },
  /** Download a brand's month plan in Excel (content people and managers). */
  exportPlan(w: Who) {
    return allowed(w, "content.edit") || allowed(w, "reports.see");
  },
  manageWorkflow(w: Who) {
    return allowed(w, "workflow.manage");
  },
  createSpaces(w: Who) {
    return allowed(w, "spaces.create") || allowed(w, "workflow.manage");
  },
  seeAllSpaces(w: Who) {
    return allowed(w, "spaces.seeAll");
  },
  downloadBackup(w: Who) {
    return allowed(w, "backup.download");
  },
  /** Anything in Settings beyond "My account". */
  seeSettings(w: Who) {
    return (["workspace.customize", "access.manage", "people.manage", "brands.manage", "platforms.manage", "workflow.manage", "announce", "updates.post"] as PermissionKey[]).some((k) => allowed(w, k));
  },
};

export const NOT_ALLOWED = "You don't have permission to do that. Ask one of the managers.";
