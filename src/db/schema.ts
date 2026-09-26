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

/** A workflow stage. `delivery` is the final hand-over step for one-off project work. */
export const STAGE_KINDS = ["content", "media", "design", "social", "delivery"] as const;
export const stageKindEnum = pgEnum("stage_kind", STAGE_KINDS);

/** waiting = previous stage not delivered yet, active = current stage, done = completed. */
export const STAGE_STATUSES = ["waiting", "active", "done"] as const;
export const stageStatusEnum = pgEnum("stage_status", STAGE_STATUSES);

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
  isActive: boolean("is_active").notNull().default(true),
  passwordHash: text("password_hash").notNull(),
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
    createdAt: ts("created_at").notNull().defaultNow(),
    createdById: uuid("created_by_id").references(() => users.id),
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
    completedAt: ts("completed_at"),
    cancelledAt: ts("cancelled_at"),
    cancelledById: uuid("cancelled_by_id").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
    createdById: uuid("created_by_id").references(() => users.id),
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
