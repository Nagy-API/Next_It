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
export const STAGE_PROGRESS = ["not_started", "processing", "adjusting", "waiting_approval", "changes_requested", "scheduled", "paused"] as const;
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
  /** Shown instead of "Manager" next to the name when set (e.g. "IT"). */
  roleLabel: text("role_label"),
  /** Profile photo as a small data URL (resized in the browser before upload). */
  avatar: text("avatar"),
  avatarUpdatedAt: ts("avatar_updated_at"),
  /** Last time this person opened Team chat (for the unread badge). */
  chatReadAt: ts("chat_read_at"),
  /** Last time the app heard from this person (online dot in chat and the team list). */
  lastSeenAt: ts("last_seen_at"),
  /** Birthday as "MM-DD" (optional, set in My account): a small celebration on the day. */
  birthday: text("birthday"),
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
  /** Deleted from the sidebar and every list (soft: its history stays in the database and the Activity log). */
  deletedAt: ts("deleted_at"),
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
    /** Pre-production extras (all optional): how many people appear, what to rent / buy, and whether it's ready. */
    shootPeople: integer("shoot_people"),
    shootRentals: text("shoot_rentals"),
    shootRentalsReady: boolean("shoot_rentals_ready").notNull().default(false),
    shootPurchases: text("shoot_purchases"),
    shootPurchasesReady: boolean("shoot_purchases_ready").notNull().default(false),
    /** Until when the shoot runs ("HH:MM"), notes for the crew (what to wear, who to call) and who goes. */
    shootEndTime: text("shoot_end_time"),
    shootNotes: text("shoot_notes"),
    shootCrewIds: uuid("shoot_crew_ids").array().notNull().default(sql`'{}'::uuid[]`),
    /** urgent | high | normal | low (optional, e.g. set when a manager gives it as a task). */
    priority: text("priority"),
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
    /** The day the person plans to do it (progress "scheduled"). */
    scheduledFor: date("scheduled_for", { mode: "string" }),
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
    /** Extra options sent with the same version (e.g. two designs to choose from). */
    altUrls: text("alt_urls").array().notNull().default(sql`'{}'::text[]`),
    /** The option the reviewer picked when approving (url of the main or an extra option). */
    chosenUrl: text("chosen_url"),
  },
  (t) => [uniqueIndex("versions_stage_number_uq").on(t.stageId, t.number), index("versions_item_idx").on(t.itemId)],
);

/* ------------------------------------------------------------------ */
/* Time on a step: from "In progress" / "Adjusting" until it's sent      */
/* ------------------------------------------------------------------ */

export const workSessions = pgTable(
  "work_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => stages.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => contentItems.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    /** processing | adjusting */
    kind: text("kind").notNull(),
    startedAt: ts("started_at").notNull(),
    endedAt: ts("ended_at"),
    /** Why it stopped: sent (waiting approval) | done | status | paused | auto_paused | returned | reassigned */
    endReason: text("end_reason"),
    /** Set when someone allowed to (Settings → Access: "Edit worked time") corrected the times. */
    editedById: uuid("edited_by_id").references(() => users.id),
    editedAt: ts("edited_at"),
  },
  (t) => [index("work_sessions_user_idx").on(t.userId, t.startedAt), index("work_sessions_stage_idx").on(t.stageId), index("work_sessions_item_idx").on(t.itemId)],
);

/* ------------------------------------------------------------------ */
/* Files & links attached to content or to a task                         */
/* ------------------------------------------------------------------ */

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id").references(() => contentItems.id),
    taskId: uuid("task_id").references(() => tasks.id),
    /** A task in a Space (workflow builder). */
    workTaskId: uuid("work_task_id").references(() => workTasks.id),
    /** Sent with a comment (shown under it). */
    commentId: uuid("comment_id").references(() => comments.id),
    workTaskCommentId: uuid("work_task_comment_id").references(() => workTaskComments.id),
    /** Sent in Team chat (an image, a PDF…). */
    chatMessageId: uuid("chat_message_id").references(() => chatMessages.id),
    /** In someone's private notebook: only its owner can open it. */
    privateNoteId: uuid("private_note_id").references(() => privateNotes.id),
    /** On a brand's month plan (more links and files next to the month's Canva / Drive). */
    planId: uuid("plan_id").references(() => contentPlans.id),
    /** file | link */
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    url: text("url"),
    mime: text("mime"),
    size: integer("size"),
    /** File name on disk (in the files folder next to the database); never a path from the user. */
    storageKey: text("storage_key"),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("attachments_item_idx").on(t.itemId), index("attachments_task_idx").on(t.taskId), index("attachments_work_task_idx").on(t.workTaskId)],
);

/* ------------------------------------------------------------------ */
/* Team notes (like Instagram notes): a short line for 12 hours           */
/* ------------------------------------------------------------------ */

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    text: text("text").notNull(),
    color: text("color").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("notes_expires_idx").on(t.expiresAt)],
);

/** Reminders in the bell (late / due / posting soon) someone already saw and cleared. */
export const alertDismissals = pgTable(
  "alert_dismissals",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    alertId: text("alert_id").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.alertId] })],
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
    /** urgent | high | normal | low (optional). */
    priority: text("priority"),
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
export type WorkSession = typeof workSessions.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type Note = typeof notes.$inferSelect;


/* ------------------------------------------------------------------ */
/* Access: per-person changes to the default permissions                 */
/* ------------------------------------------------------------------ */

export const permissionOverrides = pgTable(
  "permission_overrides",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    /** A key from PERMISSIONS in src/domain/permissions.ts */
    key: text("key").notNull(),
    allow: boolean("allow").notNull(),
    updatedById: uuid("updated_by_id").references(() => users.id),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

/* ------------------------------------------------------------------ */
/* Workspace settings (name, colours, logos, modules…) — no code needed  */
/* ------------------------------------------------------------------ */

export const workspaceSettings = pgTable("workspace_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedById: uuid("updated_by_id").references(() => users.id),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Big updates: what the management wants everyone to see (a meeting today, a thank you…), big on the Overview. */
export const announcements = pgTable("announcements", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Optional headline; `text` is the message. */
  title: text("title"),
  /** Pinned updates stay on top until unpinned. */
  pinned: boolean("pinned").notNull().default(false),
  text: text("text").notNull(),
  emoji: text("emoji"),
  color: text("color").notNull(),
  createdById: uuid("created_by_id")
    .notNull()
    .references(() => users.id),
  createdAt: ts("created_at").notNull().defaultNow(),
  expiresAt: ts("expires_at"),
  deletedAt: ts("deleted_at"),
});

/* ------------------------------------------------------------------ */
/* Spaces: the workflow builder (departments, statuses, lists, tasks)    */
/* ------------------------------------------------------------------ */

export const spaces = pgTable("spaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  /** An emoji shown as the space's icon. */
  icon: text("icon"),
  description: text("description"),
  /** Private: only its members (and people with "See every space") see it. */
  isPrivate: boolean("is_private").notNull().default(false),
  /** Optional: the brand this space belongs to (its tasks show on the brand page). */
  brandId: uuid("brand_id").references(() => brands.id),
  position: integer("position").notNull().default(0),
  createdById: uuid("created_by_id").references(() => users.id),
  createdAt: ts("created_at").notNull().defaultNow(),
  archivedAt: ts("archived_at"),
});

export const spaceMembers = pgTable(
  "space_members",
  {
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    /** member (works on tasks) | viewer (sees only) */
    role: text("role").notNull().default("member"),
  },
  (t) => [primaryKey({ columns: [t.spaceId, t.userId] })],
);

export const spaceStatuses = pgTable(
  "space_statuses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id),
    name: text("name").notNull(),
    color: text("color").notNull(),
    /** open (not started) | active (being worked on: the clock runs) | review | done | closed (cancelled) */
    kind: text("kind").notNull(),
    position: integer("position").notNull().default(0),
    archivedAt: ts("archived_at"),
  },
  (t) => [index("space_statuses_space_idx").on(t.spaceId)],
);

export const folders = pgTable(
  "folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
    archivedAt: ts("archived_at"),
  },
  (t) => [index("folders_space_idx").on(t.spaceId)],
);

export const lists = pgTable(
  "lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id),
    folderId: uuid("folder_id").references(() => folders.id),
    name: text("name").notNull(),
    color: text("color"),
    description: text("description"),
    position: integer("position").notNull().default(0),
    createdById: uuid("created_by_id").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
    archivedAt: ts("archived_at"),
  },
  (t) => [index("lists_space_idx").on(t.spaceId)],
);

/** Columns a space adds to its tasks: text, number, date, dropdown, checkbox, link, email, person, rating, money. */
export const spaceFields = pgTable(
  "space_fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id),
    name: text("name").notNull(),
    type: text("type").notNull(),
    /** Dropdown choices: [{ id, label, color }] */
    options: jsonb("options").notNull().default(sql`'[]'::jsonb`),
    /** Extra settings for smart columns (formula, rollup, button…): see FieldConfig in domain/spaces.ts. */
    config: jsonb("config"),
    position: integer("position").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
    archivedAt: ts("archived_at"),
  },
  (t) => [index("space_fields_space_idx").on(t.spaceId)],
);

export const workTasks = pgTable(
  "work_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id),
    listId: uuid("list_id")
      .notNull()
      .references(() => lists.id),
    /** A subtask's parent. */
    parentId: uuid("parent_id"),
    title: text("title").notNull(),
    description: text("description"),
    statusId: uuid("status_id")
      .notNull()
      .references(() => spaceStatuses.id),
    /** urgent | high | normal | low (or none) */
    priority: text("priority"),
    startDate: date("start_date", { mode: "string" }),
    dueDate: date("due_date", { mode: "string" }),
    position: integer("position").notNull().default(0),
    createdById: uuid("created_by_id").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    statusAt: ts("status_at"),
    completedAt: ts("completed_at"),
    /** When the "due date passes" automations ran for the current due date (cleared when it changes). */
    dueFiredAt: ts("due_fired_at"),
    archivedAt: ts("archived_at"),
  },
  (t) => [index("work_tasks_list_idx").on(t.listId), index("work_tasks_space_idx").on(t.spaceId), index("work_tasks_parent_idx").on(t.parentId)],
);

export const workTaskAssignees = pgTable(
  "work_task_assignees",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => workTasks.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId] }), index("work_task_assignees_user_idx").on(t.userId)],
);

export const workTaskValues = pgTable(
  "work_task_values",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => workTasks.id),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => spaceFields.id),
    value: jsonb("value"),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.fieldId] })],
);

export const workTaskComments = pgTable(
  "work_task_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => workTasks.id),
    authorId: uuid("author_id").references(() => users.id),
    body: text("body").notNull(),
    /** Written by an automation or the system (not a person). */
    system: boolean("system").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("work_task_comments_task_idx").on(t.taskId)],
);

/** The clock on a Space task: runs while its status is an "active" one and the person works on it. */
export const workTaskSessions = pgTable(
  "work_task_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => workTasks.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    startedAt: ts("started_at").notNull(),
    endedAt: ts("ended_at"),
    endReason: text("end_reason"),
  },
  (t) => [index("work_task_sessions_task_idx").on(t.taskId), index("work_task_sessions_user_idx").on(t.userId, t.startedAt)],
);

/** "When this happens → do that" rules of a space. */
export const automations = pgTable(
  "automations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id),
    name: text("name").notNull(),
    /** { type: "task_created" | "status_changed" | "all_subtasks_done" | "due_passed" | "assignee_added" | "priority_changed", statusId?, listId? } */
    trigger: jsonb("trigger").notNull(),
    /** [{ type: "set_status" | "assign" | "unassign_all" | "notify" | "set_priority" | "set_due_in_days" | "move_to_list" | "add_subtasks" | "add_comment" | "complete_parent", … }] */
    actions: jsonb("actions").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    runs: integer("runs").notNull().default(0),
    lastRunAt: ts("last_run_at"),
    createdById: uuid("created_by_id").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
    archivedAt: ts("archived_at"),
  },
  (t) => [index("automations_space_idx").on(t.spaceId)],
);

/** Dashboards someone builds: what to count (a space, a folder, a list, or everything) and which cards to show. */
export const dashboards = pgTable("dashboards", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** { spaceId?, folderId?, listId? } — empty = every space the viewer can see */
  scope: jsonb("scope").notNull(),
  /** ["status", "people", "priority", "overdue", "done_weeks", "due_soon", "progress"] */
  widgets: jsonb("widgets").notNull(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
  shared: boolean("shared").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
  archivedAt: ts("archived_at"),
});

export type Space = typeof spaces.$inferSelect;
export type SpaceStatus = typeof spaceStatuses.$inferSelect;
export type SpaceField = typeof spaceFields.$inferSelect;
export type WorkTask = typeof workTasks.$inferSelect;
export type Automation = typeof automations.$inferSelect;
export type Dashboard = typeof dashboards.$inferSelect;


/* ------------------------------------------------------------------ */
/* Reactions, kudos, moods: the fun side                                 */
/* ------------------------------------------------------------------ */

/** An emoji reaction on a Big update, a chat message or kudos (one row per person + emoji). */
export const reactions = pgTable(
  "reactions",
  {
    /** announcement | chat | kudos */
    targetKind: text("target_kind").notNull(),
    targetId: uuid("target_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    emoji: text("emoji").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.targetKind, t.targetId, t.userId, t.emoji] }), index("reactions_target_idx").on(t.targetKind, t.targetId)],
);

/** "Thank you" from one teammate to another, shown on the Overview wall. */
export const kudos = pgTable(
  "kudos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromId: uuid("from_id")
      .notNull()
      .references(() => users.id),
    toId: uuid("to_id")
      .notNull()
      .references(() => users.id),
    emoji: text("emoji").notNull(),
    text: text("text").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("kudos_created_idx").on(t.createdAt), index("kudos_to_idx").on(t.toId)],
);

/** How each person feels today (one emoji per day, optional). */
export const moods = pgTable(
  "moods",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    day: date("day", { mode: "string" }).notNull(),
    emoji: text("emoji").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

/* ------------------------------------------------------------------ */
/* Personal order in My tasks (each person drags their own)             */
/* ------------------------------------------------------------------ */

export const personalOrder = pgTable(
  "personal_order",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    /** "item:<id>" | "task:<id>" | "space:<id>" */
    key: text("key").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

/* ------------------------------------------------------------------ */
/* Shoots: every planned shoot slot (outside the content plan too)       */
/* ------------------------------------------------------------------ */

/**
 * A shoot slot that isn't a content item's own shoot: an event, a video outside the plan, a client job…
 * Several slots can share a day (Blissify 2–4 pm, OG Hub 6–10 pm). Content items' shoots come from
 * content_items.shoot_* and show on the same schedule.
 */
export const shoots = pgTable(
  "shoots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    brandId: uuid("brand_id").references(() => brands.id),
    day: date("day", { mode: "string" }).notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    location: text("location"),
    people: integer("people"),
    rentals: text("rentals"),
    rentalsReady: boolean("rentals_ready").notNull().default(false),
    purchases: text("purchases"),
    purchasesReady: boolean("purchases_ready").notNull().default(false),
    notes: text("notes"),
    crewIds: uuid("crew_ids").array().notNull().default(sql`'{}'::uuid[]`),
    /** After the shoot: "none" (just shooting) | "edit" (someone edits it) */
    after: text("after").notNull().default("none"),
    editorId: uuid("editor_id").references(() => users.id),
    /** planned | shot | cancelled */
    status: text("status").notNull().default("planned"),
    /** The content item created for editing when it was marked shot. */
    itemId: uuid("item_id").references(() => contentItems.id),
    taskId: uuid("task_id").references(() => tasks.id),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
    shotAt: ts("shot_at"),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("shoots_day_idx").on(t.day)],
);

/* ------------------------------------------------------------------ */
/* Space pages: docs, whiteboards and sheets inside a space              */
/* ------------------------------------------------------------------ */

export const spacePages = pgTable(
  "space_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id),
    folderId: uuid("folder_id").references(() => folders.id),
    /** doc | whiteboard | sheet */
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    icon: text("icon"),
    /** The page itself (blocks / shapes / grid), validated by src/domain/pages.ts. */
    content: jsonb("content").notNull(),
    position: integer("position").notNull().default(0),
    createdById: uuid("created_by_id").references(() => users.id),
    updatedById: uuid("updated_by_id").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    archivedAt: ts("archived_at"),
  },
  (t) => [index("space_pages_space_idx").on(t.spaceId)],
);

export type Shoot = typeof shoots.$inferSelect;
export type SpacePage = typeof spacePages.$inferSelect;

/* ------------------------------------------------------------------ */
/* My notebook: private notes only their owner can see                  */
/* ------------------------------------------------------------------ */

export const privateNotes = pgTable(
  "private_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull().default(""),
    body: text("body").notNull().default(""),
    color: text("color"),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("private_notes_user_idx").on(t.userId)],
);
export type PrivateNote = typeof privateNotes.$inferSelect;
