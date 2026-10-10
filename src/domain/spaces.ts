/**
 * Spaces: the workflow builder. Pure definitions (no database): status kinds, priorities, field types,
 * templates and the automation catalogue. Server logic is in src/server/spaces.ts.
 *
 * A space (a department, a client, a team…) has its own statuses, columns (fields), folders and lists.
 * Tasks live in lists, can have subtasks, people, a priority, dates, files, comments and a clock.
 */
import type { TemplateCategory } from "./pages";

export const STATUS_KINDS = {
  open: { label: "Not started", hint: "Waiting to be picked up" },
  active: { label: "In progress", hint: "Being worked on: the clock runs" },
  review: { label: "Review", hint: "Waiting for someone to check it" },
  done: { label: "Done", hint: "Finished" },
  closed: { label: "Closed", hint: "Cancelled or won't do" },
} as const;
export type StatusKind = keyof typeof STATUS_KINDS;
export const STATUS_KIND_LIST = Object.keys(STATUS_KINDS) as StatusKind[];
export const isFinishedKind = (k: string) => k === "done" || k === "closed";

export const PRIORITIES = {
  urgent: { label: "Urgent", color: "#e5484d", rank: 0 },
  high: { label: "High", color: "#f59e0b", rank: 1 },
  normal: { label: "Normal", color: "#3b82f6", rank: 2 },
  low: { label: "Low", color: "#94a3b8", rank: 3 },
} as const;
export type Priority = keyof typeof PRIORITIES;
export const PRIORITY_LIST = Object.keys(PRIORITIES) as Priority[];

/**
 * Column types (the "+ Column" picker shows them by group, like ClickUp). Computed ones (formula, rollup,
 * tasks, progress_auto, files) are worked out from the task and never typed in.
 */
export const FIELD_TYPES = {
  text: { label: "Text", hint: "A short line", group: "Basic" },
  textarea: { label: "Text area", hint: "Long notes, a description", group: "Basic" },
  number: { label: "Number", hint: "Amounts, counts", group: "Basic" },
  money: { label: "Money", hint: "Budget, price (EGP)", group: "Basic" },
  date: { label: "Date", hint: "A day", group: "Basic" },
  checkbox: { label: "Checkbox", hint: "Yes / no", group: "Basic" },
  dropdown: { label: "Dropdown", hint: "Pick one of your options", group: "Choice" },
  labels: { label: "Labels", hint: "Pick several of your options", group: "Choice" },
  rating: { label: "Rating", hint: "1 to 5 stars", group: "Choice" },
  voting: { label: "Voting", hint: "Everyone votes; the count shows", group: "Choice" },
  person: { label: "People", hint: "Someone on the team", group: "Contact" },
  email: { label: "Email", hint: "An email address", group: "Contact" },
  phone: { label: "Phone", hint: "A phone number", group: "Contact" },
  link: { label: "Website", hint: "A web address", group: "Contact" },
  location: { label: "Location", hint: "An address, opens in Maps", group: "Contact" },
  progress: { label: "Progress (manual)", hint: "0–100% you set", group: "Progress" },
  progress_auto: { label: "Progress (auto)", hint: "From the subtasks done", group: "Progress" },
  tasks: { label: "Tasks", hint: "Subtasks done / total", group: "Progress" },
  signature: { label: "Signature", hint: "Sign off with your name and time", group: "Progress" },
  button: { label: "Button", hint: "One click: done, a status, or take it", group: "Smart" },
  formula: { label: "Formula", hint: "Math on number columns, e.g. {Budget} * 1.14", group: "Smart" },
  relationship: { label: "Relationship", hint: "Link to other tasks in this space", group: "Smart" },
  rollup: { label: "Rollup", hint: "Sum / count a column of the linked tasks", group: "Smart" },
  files: { label: "Files", hint: "How many files are attached", group: "Smart" },
} as const;
export const FIELD_GROUPS = ["Basic", "Choice", "Contact", "Progress", "Smart"] as const;
/** Worked out by the system: nobody types a value. */
export const COMPUTED_FIELDS = ["formula", "rollup", "tasks", "progress_auto", "files", "button"] as const;
export const isComputedField = (t: string) => (COMPUTED_FIELDS as readonly string[]).includes(t);
/** Extra settings some columns need (stored in space_fields.config). */
export type FieldConfig = {
  /** formula: e.g. "{Budget} * 1.14" — column names in braces, + - * / ( ) and numbers. */
  formula?: string;
  /** rollup: the relationship column, the number column on the linked tasks, and how to combine. */
  relationFieldId?: string;
  targetFieldId?: string;
  fn?: "sum" | "avg" | "min" | "max" | "count";
  /** button: what one click does. */
  action?: "done" | "status" | "take";
  statusId?: string;
  buttonLabel?: string;
};
export type FieldType = keyof typeof FIELD_TYPES;
export const FIELD_TYPE_LIST = Object.keys(FIELD_TYPES) as FieldType[];
export type FieldOption = { id: string; label: string; color: string };

export const SPACE_COLORS = ["#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#E0569B", "#06B6D4", "#EF4444", "#84CC16", "#F97316", "#14B8A6", "#6366F1", "#0EA5E9"];
const C = { gray: "#94a3b8", blue: "#3b82f6", violet: "#8b5cf6", amber: "#f59e0b", green: "#10b981", red: "#e5484d", teal: "#14b8a6", pink: "#e0569b", indigo: "#6366f1" };

/* ------------------------------------------------------------------ */
/* Automations                                                          */
/* ------------------------------------------------------------------ */

export const TRIGGERS = {
  task_created: { label: "A task is created", needsStatus: false },
  status_changed: { label: "The status changes to…", needsStatus: true },
  assignee_added: { label: "Someone is assigned", needsStatus: false },
  priority_changed: { label: "The priority changes to…", needsStatus: false },
  subtasks_done: { label: "All subtasks are done", needsStatus: false },
  due_date_passed: { label: "The due date passes (not done)", needsStatus: false },
} as const;
export type TriggerType = keyof typeof TRIGGERS;
export const TRIGGER_LIST = Object.keys(TRIGGERS) as TriggerType[];

export const ACTIONS = {
  set_status: { label: "Change the status to…" },
  assign: { label: "Assign to…" },
  unassign_all: { label: "Remove everyone assigned" },
  notify: { label: "Notify…" },
  set_priority: { label: "Set the priority to…" },
  set_due_in_days: { label: "Set the due date to N days from now" },
  move_to_list: { label: "Move to the list…" },
  add_subtasks: { label: "Add a checklist of subtasks" },
  add_comment: { label: "Post a comment" },
  parent_status: { label: "Change the parent task's status to…" },
} as const;
export type ActionType = keyof typeof ACTIONS;
export const ACTION_LIST = Object.keys(ACTIONS) as ActionType[];

/** Statuses and lists are referred to by name inside templates and by id once created. */
export type Trigger = { type: TriggerType; statusId?: string | null; listId?: string | null; priority?: Priority | null };
export type Action =
  | { type: "set_status"; statusId: string }
  | { type: "parent_status"; statusId: string }
  | { type: "assign"; userIds: string[] }
  | { type: "unassign_all" }
  | { type: "notify"; to: "assignees" | "creator" | "people"; userIds?: string[]; message?: string }
  | { type: "set_priority"; priority: Priority }
  | { type: "set_due_in_days"; days: number }
  | { type: "move_to_list"; listId: string }
  | { type: "add_subtasks"; titles: string[] }
  | { type: "add_comment"; text: string };

/* ------------------------------------------------------------------ */
/* Templates                                                            */
/* ------------------------------------------------------------------ */

type TStatus = { name: string; color: string; kind: StatusKind };
type TField = { name: string; type: FieldType; options?: string[]; config?: FieldConfig };
type TAutomation = { name: string; trigger: { type: TriggerType; status?: string; priority?: Priority }; actions: ({ type: "set_status" | "parent_status"; status: string } | { type: "add_subtasks"; titles: string[] } | { type: "notify"; to: "assignees" | "creator"; message?: string } | { type: "set_priority"; priority: Priority } | { type: "set_due_in_days"; days: number } | { type: "add_comment"; text: string })[] };
export type SpaceTemplate = {
  key: string;
  /** The template library shelf. */
  category?: TemplateCategory;
  name: string;
  icon: string;
  color: string;
  description: string;
  statuses: TStatus[];
  fields: TField[];
  folders: { name: string; lists: string[] }[];
  lists: string[];
  automations: TAutomation[];
};

const BASIC: TStatus[] = [
  { name: "To do", color: C.gray, kind: "open" },
  { name: "In progress", color: C.blue, kind: "active" },
  { name: "Review", color: C.violet, kind: "review" },
  { name: "Done", color: C.green, kind: "done" },
];

export const SPACE_TEMPLATES: SpaceTemplate[] = [
  {
    key: "blank",
    category: "Project management",
    name: "Simple board",
    icon: "✅",
    color: "#3B82F6",
    description: "To do, In progress, Review, Done. Start simple and add what you need.",
    statuses: BASIC,
    fields: [],
    folders: [],
    lists: ["Tasks"],
    automations: [{ name: "Finished subtasks send the task to Review", trigger: { type: "subtasks_done" }, actions: [{ type: "set_status", status: "Review" }] }],
  },
  {
    key: "marketing",
    category: "Marketing",
    name: "Marketing campaigns",
    icon: "📣",
    color: "#E0569B",
    description: "Plan campaigns from brief to launch, with budget, channel and results.",
    statuses: [
      { name: "Idea", color: C.gray, kind: "open" },
      { name: "Brief", color: C.amber, kind: "open" },
      { name: "In production", color: C.blue, kind: "active" },
      { name: "Client review", color: C.violet, kind: "review" },
      { name: "Live", color: C.teal, kind: "active" },
      { name: "Done", color: C.green, kind: "done" },
      { name: "Cancelled", color: C.red, kind: "closed" },
    ],
    fields: [
      { name: "Channel", type: "labels", options: ["Instagram", "TikTok", "Facebook", "Google Ads", "Email", "Influencers"] },
      { name: "Budget", type: "money" },
      { name: "Brief link", type: "link" },
      { name: "Results", type: "text" },
    ],
    folders: [{ name: "Campaigns", lists: ["Q4 campaigns", "Always on"] }],
    lists: ["Ideas backlog"],
    automations: [
      { name: "A new brief gets a launch checklist", trigger: { type: "status_changed", status: "Brief" }, actions: [{ type: "add_subtasks", titles: ["Write the brief", "Agree the budget", "Book the creators", "Approve the creatives", "Launch"] }] },
      { name: "Client review tells the creator", trigger: { type: "status_changed", status: "Client review" }, actions: [{ type: "notify", to: "creator", message: "Ready for client review" }] },
    ],
  },
  {
    key: "hiring",
    category: "HR",
    name: "Hiring (HR)",
    icon: "🧑‍💼",
    color: "#10B981",
    description: "Every candidate from application to offer, with CV, phone and rating.",
    statuses: [
      { name: "Applied", color: C.gray, kind: "open" },
      { name: "Screening", color: C.amber, kind: "active" },
      { name: "Interview", color: C.blue, kind: "active" },
      { name: "Offer", color: C.violet, kind: "review" },
      { name: "Hired", color: C.green, kind: "done" },
      { name: "Rejected", color: C.red, kind: "closed" },
    ],
    fields: [
      { name: "Role", type: "dropdown", options: ["Video editor", "Designer", "Content creator", "Account manager", "Intern"] },
      { name: "Phone", type: "phone" },
      { name: "Email", type: "email" },
      { name: "CV / portfolio", type: "link" },
      { name: "Rating", type: "rating" },
      { name: "Expected salary", type: "money" },
    ],
    folders: [],
    lists: ["Candidates"],
    automations: [
      { name: "Interview: prepare it", trigger: { type: "status_changed", status: "Interview" }, actions: [{ type: "add_subtasks", titles: ["Book the interview", "Send the task", "Write feedback"] }, { type: "set_due_in_days", days: 3 }] },
      { name: "Hired: welcome checklist", trigger: { type: "status_changed", status: "Hired" }, actions: [{ type: "add_subtasks", titles: ["Contract signed", "Create their account", "Add them to the team chat", "First-week plan"] }] },
    ],
  },
  {
    key: "sales",
    category: "Sales & CRM",
    name: "Sales pipeline",
    icon: "💼",
    color: "#F59E0B",
    description: "Leads to deals: value, source, next follow-up.",
    statuses: [
      { name: "Lead", color: C.gray, kind: "open" },
      { name: "Contacted", color: C.amber, kind: "active" },
      { name: "Proposal sent", color: C.blue, kind: "review" },
      { name: "Negotiation", color: C.violet, kind: "active" },
      { name: "Won", color: C.green, kind: "done" },
      { name: "Lost", color: C.red, kind: "closed" },
    ],
    fields: [
      { name: "Deal value", type: "money" },
      { name: "Source", type: "dropdown", options: ["Instagram", "Referral", "Website", "Cold call", "Event"] },
      { name: "Contact phone", type: "phone" },
      { name: "Contact email", type: "email" },
      { name: "Next follow-up", type: "date" },
    ],
    folders: [],
    lists: ["Pipeline"],
    automations: [{ name: "Proposal sent: follow up in 3 days", trigger: { type: "status_changed", status: "Proposal sent" }, actions: [{ type: "set_due_in_days", days: 3 }, { type: "set_priority", priority: "high" }] }],
  },
  {
    key: "events",
    category: "Creative",
    name: "Events & shoots",
    icon: "🎬",
    color: "#8B5CF6",
    description: "Productions and events: location, crew, budget, run of show.",
    statuses: [
      { name: "Planning", color: C.gray, kind: "open" },
      { name: "Booking", color: C.amber, kind: "active" },
      { name: "Ready", color: C.teal, kind: "review" },
      { name: "Happening", color: C.blue, kind: "active" },
      { name: "Wrapped", color: C.green, kind: "done" },
      { name: "Cancelled", color: C.red, kind: "closed" },
    ],
    fields: [
      { name: "Location", type: "text" },
      { name: "Crew size", type: "number" },
      { name: "Budget", type: "money" },
      { name: "Equipment ready", type: "checkbox" },
    ],
    folders: [{ name: "This season", lists: ["Shoots", "Events"] }],
    lists: [],
    automations: [{ name: "Booking: the usual checklist", trigger: { type: "status_changed", status: "Booking" }, actions: [{ type: "add_subtasks", titles: ["Book the location", "Confirm the crew", "Rent the equipment", "Buy the props", "Send the call sheet"] }] }],
  },
  {
    key: "support",
    category: "Support",
    name: "Client requests",
    icon: "🎧",
    color: "#06B6D4",
    description: "Requests and issues from clients, by priority, with a clear owner.",
    statuses: [
      { name: "New", color: C.gray, kind: "open" },
      { name: "Working on it", color: C.blue, kind: "active" },
      { name: "Waiting for client", color: C.amber, kind: "review" },
      { name: "Solved", color: C.green, kind: "done" },
      { name: "Closed", color: C.red, kind: "closed" },
    ],
    fields: [
      { name: "Client", type: "text" },
      { name: "Type", type: "dropdown", options: ["Change request", "Question", "Complaint", "New idea"] },
    ],
    folders: [],
    lists: ["Requests"],
    automations: [
      { name: "Urgent requests are due tomorrow", trigger: { type: "priority_changed", priority: "urgent" }, actions: [{ type: "set_due_in_days", days: 1 }] },
      { name: "Solved: tell whoever asked", trigger: { type: "status_changed", status: "Solved" }, actions: [{ type: "notify", to: "creator", message: "Solved" }] },
    ],
  },
  {
    key: "sprint",
    category: "IT & Engineering",
    name: "Product / IT sprints",
    icon: "🛠️",
    color: "#6366F1",
    description: "Backlog, sprint, testing and release, with estimates.",
    statuses: [
      { name: "Backlog", color: C.gray, kind: "open" },
      { name: "To do", color: C.amber, kind: "open" },
      { name: "In progress", color: C.blue, kind: "active" },
      { name: "Testing", color: C.violet, kind: "review" },
      { name: "Released", color: C.green, kind: "done" },
    ],
    fields: [
      { name: "Estimate (hours)", type: "number" },
      { name: "Area", type: "labels", options: ["Website", "App", "Server", "Design"] },
      { name: "Done", type: "progress" },
    ],
    folders: [{ name: "Sprints", lists: ["Sprint 1", "Sprint 2"] }],
    lists: ["Backlog"],
    automations: [{ name: "Ready for testing tells the creator", trigger: { type: "status_changed", status: "Testing" }, actions: [{ type: "notify", to: "creator", message: "Ready to test" }] }],
  },
];

export const templateByKey = (key: string | null | undefined) => SPACE_TEMPLATES.find((t) => t.key === key) ?? SPACE_TEMPLATES[0];
