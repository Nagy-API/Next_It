import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Enums                                                                */
/* ------------------------------------------------------------------ */

export const TEAMS = ["leadership", "content", "media", "design", "social", "account"] as const;
export const teamEnum = pgEnum("team", TEAMS);

export const CONTENT_TYPES = ["reel", "static", "carousel", "story"] as const;
export const contentTypeEnum = pgEnum("content_type", CONTENT_TYPES);

/**
 * A workflow stage. `shooting` = pre-production, `media` = post-production (editing).
 * `delivery` is the final hand-over step for one-off project work.
 */
export const STAGE_KINDS = ["content", "shooting", "media", "design", "social", "delivery"] as const;
export const stageKindEnum = pgEnum("stage_kind", STAGE_KINDS);

/** waiting = previous stage not delivered yet, active = current stage, done = completed. */
export const STAGE_STATUSES = ["waiting", "active", "done"] as const;
export const stageStatusEnum = pgEnum("stage_status", STAGE_STATUSES);

/** Where the person doing a step is with it (same statuses as the old tracker). Done = the step is completed. */
export const STAGE_PROGRESS = ["not_started", "processing", "adjusting", "waiting_approval"] as const;
export const stageProgressEnum = pgEnum("stage_progress", STAGE_PROGRESS);

export const PLATFORM_STATUSES = ["not_planned", "pending", "scheduled", "published", "cancelled"] as const;
export const platformStatusEnum = pgEnum("platform_status", PLATFORM_STATUSES);

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/* ------------------------------------------------------------------ */
/* People & auth                                                       */
/* ------------------------------------------------------------------ */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  name: text("name").notNull(),
  title: text("title"),
  teams: teamEnum("teams").array().notNull().default(sql`'{}'::team[]`),
  isAdmin: boolean("is_admin").notNull().default(false),
  /** Managers assign work, set deadlines, see the dashboard and the activity log. */
  isManager: boolean("is_manager").notNull().default(false),
  /** Profile photo as a small data URL (resized in the browser before upload). */
  avatar: text("avatar"),
  avatarUpdatedAt: ts("avatar_updated_at"),
  /** Last time this person opened Team chat (for the unread badge). */
  chatReadAt: ts("chat_read_at"),
  isActive: boolean("is_active").notNull().default(true),
  passwordHash: text("password_hash").notNull(),
  /** Set for new accounts and admin resets: the person must choose their own password before doing anything else. */
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  passwordChangedAt: ts("password_changed_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  deactivatedAt: ts("deactivated_at"),
});

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the session token. The raw token only ever lives in the cookie. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Every sign-in attempt (for lock-outs after repeated failures, and for the security record). */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    username: text("username").notNull(),
    ip: text("ip"),
    success: boolean("success").notNull(),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("login_attempts_user_idx").on(t.username, t.at), index("login_attempts_ip_idx").on(t.ip, t.at)],
);

/* ------------------------------------------------------------------ */
/* Recurring brands & monthly plans                                    */
/* ------------------------------------------------------------------ */

export const brands = pgTable("brands", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  color: text("color").notNull().default("#3B82F6"),
  isActive: boolean("is_active").notNull().default(true),
  defaultCreatorId: uuid("default_creator_id").references(() => users.id),
  /** Default people for the other teams on this brand (work goes straight to them; can be changed per item). */
  defaultShootId: uuid("default_shoot_id").references(() => users.id),
  defaultMediaId: uuid("default_media_id").references(() => users.id),
  defaultDesignId: uuid("default_design_id").references(() => users.id),
  defaultSocialId: uuid("default_social_id").references(() => users.id),
  createdAt: ts("created_at").notNull().defaultNow(),
  archivedAt: ts("archived_at"),
});

export const contentPlans = pgTable(
  "content_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    /** The month's Canva presentation (one link for all items; each item has a slide number). */
    canvaUrl: text("canva_url"),
    /** The month's Google Drive folder where final files are uploaded. */
    driveFolderUrl: text("drive_folder_url"),
    createdAt: ts("created_at").notNull().defaultNow(),
    createdById: uuid("created_by_id").references(() => users.id),
  },
  (t) => [
    uniqueIndex("content_plans_brand_month_uq").on(t.brandId, t.year, t.month),
    check("content_plans_month_ck", sql`${t.month} between 1 and 12`),
  ],
);

/* ------------------------------------------------------------------ */
/* One-off clients & projects                                          */
/* ------------------------------------------------------------------ */

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  notes: text("notes"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    name: text("name").notNull(),
    notes: text("notes"),
    /** The content creator responsible for this project (default for its content steps). */
    ownerId: uuid("owner_id").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
    createdById: uuid("created_by_id").references(() => users.id),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("projects_client_idx").on(t.clientId)],
);

/* ------------------------------------------------------------------ */
/* Content items & workflow                                            */
/* ------------------------------------------------------------------ */

export const contentItems = pgTable(
  "content_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    type: contentTypeEnum("type").notNull(),
    planId: uuid("plan_id").references(() => contentPlans.id),
    projectId: uuid("project_id").references(() => projects.id),
    canvaUrl: text("canva_url"),
    /** Latest/current output. Previous values live in the activity log. */
    driveUrl: text("drive_url"),
    postingDate: date("posting_date", { mode: "string" }),
    postingTime: text("posting_time"),
    /** Slide/page number in the month's Canva presentation. */
    slideNumber: integer("slide_number"),
    /** Pre-production: when and how long the shoot is. */
    shootDate: date("shoot_date", { mode: "string" }),
    shootTime: text("shoot_time"),
    shootDuration: text("shoot_duration"),
    shootLocation: text("shoot_location"),
    completedAt: ts("completed_at"),
    cancelledAt: ts("cancelled_at"),
    cancelledById: uuid("cancelled_by_id").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
    createdById: uuid("created_by_id").references(() => users.id),
    /** Set when a manager gave this as a task ("Give a task" + brand): an EXTRA on top of the month's plan. */
    extraRequestedById: uuid("extra_requested_by_id").references(() => users.id),
  },
  (t) => [
    index("content_items_plan_idx").on(t.planId),
    index("content_items_project_idx").on(t.projectId),
    index("content_items_posting_idx").on(t.postingDate),
    check("content_items_owner_ck", sql`(${t.planId} is null) <> (${t.projectId} is null)`),
  ],
);

export const stages = pgTable(
  "stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => contentItems.id),
    kind: stageKindEnum("kind").notNull(),
    position: integer("position").notNull(),
    status: stageStatusEnum("status").notNull().default("waiting"),
    assigneeId: uuid("assignee_id").references(() => users.id),
    /** The deadline a person last chose manually. */
    originalDeadline: date("original_deadline", { mode: "string" }),
    /** Operational deadline = original + upstream delay shifts. */
    deadline: date("deadline", { mode: "string" }),
    shiftDays: integer("shift_days").notNull().default(0),
    shiftReason: text("shift_reason"),
    /** How many days of this stage's own lateness have already been pushed downstream. */
    propagatedDelayDays: integer("propagated_delay_days").notNull().default(0),
    /** 1 for the first pass; +1 every time work is returned to this stage. */
    round: integer("round").notNull().default(1),
    progress: stageProgressEnum("progress").notNull().default("not_started"),
    progressAt: ts("progress_at"),
    activatedAt: ts("activated_at"),
    completedAt: ts("completed_at"),
    completedById: uuid("completed_by_id").references(() => users.id),
    returnedAt: ts("returned_at"),
    returnedById: uuid("returned_by_id").references(() => users.id),
    returnNote: text("return_note"),
    lateExcusedAt: ts("late_excused_at"),
    lateExcusedById: uuid("late_excused_by_id").references(() => users.id),
  },
  (t) => [
    uniqueIndex("stages_item_kind_uq").on(t.itemId, t.kind),
    index("stages_assignee_idx").on(t.assigneeId),
    index("stages_status_idx").on(t.status),
  ],
);

/** Append-only fact table: one row every time a stage is completed. Powers fair insights. */
export const stageCompletions = pgTable(
  "stage_completions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => stages.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => contentItems.id),
    kind: stageKindEnum("kind").notNull(),
    /** Who the work is credited to: the assignee at completion time, else whoever completed it. */
    creditedUserId: uuid("credited_user_id").references(() => users.id),
    completedById: uuid("completed_by_id")
      .notNull()
      .references(() => users.id),
    completedAt: ts("completed_at").notNull(),
    deadline: date("deadline", { mode: "string" }),
    lateDays: integer("late_days").notNull().default(0),
    round: integer("round").notNull().default(1),
    excused: boolean("excused").notNull().default(false),
    excusedById: uuid("excused_by_id").references(() => users.id),
    excusedAt: ts("excused_at"),
  },
  (t) => [
    index("stage_completions_user_idx").on(t.creditedUserId, t.completedAt),
    index("stage_completions_stage_idx").on(t.stageId),
  ],
);

/* ------------------------------------------------------------------ */
/* Platforms                                                            */
/* ------------------------------------------------------------------ */

export const platforms = pgTable("platforms", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const itemPlatforms = pgTable(
  "item_platforms",
  {
    itemId: uuid("item_id")
      .notNull()
      .references(() => contentItems.id),
    platformId: uuid("platform_id")
      .notNull()
      .references(() => platforms.id),
    status: platformStatusEnum("status").notNull().default("pending"),
    date: date("date", { mode: "string" }),
    time: text("time"),
    liveUrl: text("live_url"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    updatedById: uuid("updated_by_id").references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.platformId] })],
);

/* ------------------------------------------------------------------ */
/* Comments & immutable activity log                                   */
/* ------------------------------------------------------------------ */

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => contentItems.id),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    /** Optional context label, e.g. "Returned to Content". */
    tag: text("tag"),
    /** Replies point at the comment they answer (one level of threading). */
    parentId: uuid("parent_id"),
    /** The person this comment is addressed to — it shows up in their tasks until resolved. */
    mentionUserId: uuid("mention_user_id").references(() => users.id),
    resolvedAt: ts("resolved_at"),
    resolvedById: uuid("resolved_by_id").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    index("comments_item_idx").on(t.itemId, t.createdAt),
    index("comments_parent_idx").on(t.parentId),
    index("comments_mention_idx").on(t.mentionUserId, t.resolvedAt),
  ],
);

/**
 * Every meaningful change. A database trigger (see drizzle/0001_activity_log_immutable.sql)
 * rejects UPDATE, DELETE and TRUNCATE so history cannot be rewritten through the app.
 */
export const activityLog = pgTable(
  "activity_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: ts("at").notNull().defaultNow(),
    actorId: uuid("actor_id").references(() => users.id),
    action: text("action").notNull(),
    summary: text("summary").notNull(),
    itemId: uuid("item_id").references(() => contentItems.id),
    brandId: uuid("brand_id").references(() => brands.id),
    projectId: uuid("project_id").references(() => projects.id),
    clientId: uuid("client_id").references(() => clients.id),
    subjectUserId: uuid("subject_user_id").references(() => users.id),
    stageKind: stageKindEnum("stage_kind"),
    field: text("field"),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    meta: jsonb("meta"),
  },
  (t) => [
    index("activity_item_idx").on(t.itemId, t.at),
    index("activity_at_idx").on(t.at),
    index("activity_actor_idx").on(t.actorId, t.at),
    index("activity_brand_idx").on(t.brandId, t.at),
  ],
);

/* ------------------------------------------------------------------ */
/* Notifications                                                         */
/* ------------------------------------------------------------------ */

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    /** new_task | sent_back | comment | reply | assigned | deadline | finished */
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    itemId: uuid("item_id").references(() => contentItems.id),
    /** Where the notification opens when it isn't about a content item (e.g. /chat, /my-work). */
    href: text("href"),
    actorId: uuid("actor_id").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
    readAt: ts("read_at"),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Versions (post-production & design): v1, v2… each approved or not    */
/* ------------------------------------------------------------------ */

export const VERSION_STATUSES = ["pending", "approved", "changes", "replaced"] as const;

export const versions = pgTable(
  "versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => contentItems.id),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => stages.id),
    kind: stageKindEnum("kind").notNull(),
    number: integer("number").notNull(),
    url: text("url").notNull(),
    note: text("note"),
    submittedById: uuid("submitted_by_id")
      .notNull()
      .references(() => users.id),
    submittedAt: ts("submitted_at").notNull().defaultNow(),
    /** pending → approved | changes (rejected with a note) | replaced (a newer version was sent first) */
    status: text("status").notNull().default("pending"),
    reviewedById: uuid("reviewed_by_id").references(() => users.id),
    reviewedAt: ts("reviewed_at"),
    reviewNote: text("review_note"),
  },
  (t) => [uniqueIndex("versions_stage_number_uq").on(t.stageId, t.number), index("versions_item_idx").on(t.itemId)],
);

/* ------------------------------------------------------------------ */
/* Tasks managers give to anyone (one-off or repeating)                  */
/* ------------------------------------------------------------------ */

/** What someone is doing with a task they were given (done is tasks.doneAt). */
export const TASK_STATUSES = ["todo", "in_progress", "scheduled", "waiting"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const RECURRENCES = ["none", "daily", "weekly", "monthly"] as const;

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    notes: text("notes"),
    assigneeId: uuid("assignee_id")
      .notNull()
      .references(() => users.id),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    brandId: uuid("brand_id").references(() => brands.id),
    dueDate: date("due_date", { mode: "string" }),
    dueTime: text("due_time"),
    /** none | daily | weekly | monthly — finishing a repeating task creates the next one automatically. */
    recurrence: text("recurrence").notNull().default("none"),
    /** All occurrences of a repeating task share the first one's id. */
    seriesId: uuid("series_id"),
    /** What the person is doing with it: todo | in_progress | scheduled | waiting (done = doneAt). */
    status: text("status").notNull().default("todo"),
    /** When they plan to do it (status "scheduled"). */
    scheduledDate: date("scheduled_date", { mode: "string" }),
    statusAt: ts("status_at"),
    doneAt: ts("done_at"),
    doneById: uuid("done_by_id").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("tasks_assignee_idx").on(t.assigneeId, t.doneAt), index("tasks_creator_idx").on(t.createdById)],
);

/* ------------------------------------------------------------------ */
/* Team chat                                                             */
/* ------------------------------------------------------------------ */

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    mentions: uuid("mentions").array().notNull().default(sql`'{}'::uuid[]`),
    /** Optional link to a content item the message is about. */
    itemId: uuid("item_id").references(() => contentItems.id),
    createdAt: ts("created_at").notNull().defaultNow(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("chat_created_idx").on(t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Brand = typeof brands.$inferSelect;
export type ContentItem = typeof contentItems.$inferSelect;
export type Stage = typeof stages.$inferSelect;
export type Platform = typeof platforms.$inferSelect;
export type ItemPlatform = typeof itemPlatforms.$inferSelect;
export type Team = (typeof TEAMS)[number];
export type ContentType = (typeof CONTENT_TYPES)[number];
export type StageKind = (typeof STAGE_KINDS)[number];
export type StageStatus = (typeof STAGE_STATUSES)[number];
export type PlatformStatus = (typeof PLATFORM_STATUSES)[number];
export type StageProgress = (typeof STAGE_PROGRESS)[number];
export type Version = typeof versions.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Recurrence = (typeof RECURRENCES)[number];
