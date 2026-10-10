ALTER TYPE "public"."stage_progress" ADD VALUE 'paused';--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"text" text NOT NULL,
	"emoji" text,
	"color" text NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "automations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"trigger" jsonb NOT NULL,
	"actions" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"runs" integer DEFAULT 0 NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dashboards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"scope" jsonb NOT NULL,
	"widgets" jsonb NOT NULL,
	"owner_id" uuid NOT NULL,
	"shared" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"folder_id" uuid,
	"name" text NOT NULL,
	"color" text,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "permission_overrides" (
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"allow" boolean NOT NULL,
	"updated_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permission_overrides_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "space_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "space_members" (
	"space_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	CONSTRAINT "space_members_space_id_user_id_pk" PRIMARY KEY("space_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "space_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"kind" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"icon" text,
	"description" text,
	"is_private" boolean DEFAULT false NOT NULL,
	"brand_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "work_task_assignees" (
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "work_task_assignees_task_id_user_id_pk" PRIMARY KEY("task_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "work_task_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "work_task_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text
);
--> statement-breakpoint
CREATE TABLE "work_task_values" (
	"task_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"value" jsonb,
	CONSTRAINT "work_task_values_task_id_field_id_pk" PRIMARY KEY("task_id","field_id")
);
--> statement-breakpoint
CREATE TABLE "work_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"parent_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status_id" uuid NOT NULL,
	"priority" text,
	"start_date" date,
	"due_date" date,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workspace_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "work_task_id" uuid;--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "shoot_people" integer;--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "shoot_rentals" text;--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "shoot_rentals_ready" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "shoot_purchases" text;--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "shoot_purchases_ready" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "work_sessions" ADD COLUMN "edited_by_id" uuid;--> statement-breakpoint
ALTER TABLE "work_sessions" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_overrides" ADD CONSTRAINT "permission_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_overrides" ADD CONSTRAINT "permission_overrides_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_fields" ADD CONSTRAINT "space_fields_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_statuses" ADD CONSTRAINT "space_statuses_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_task_assignees" ADD CONSTRAINT "work_task_assignees_task_id_work_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."work_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_task_assignees" ADD CONSTRAINT "work_task_assignees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_task_comments" ADD CONSTRAINT "work_task_comments_task_id_work_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."work_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_task_comments" ADD CONSTRAINT "work_task_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_task_sessions" ADD CONSTRAINT "work_task_sessions_task_id_work_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."work_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_task_sessions" ADD CONSTRAINT "work_task_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_task_values" ADD CONSTRAINT "work_task_values_task_id_work_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."work_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_task_values" ADD CONSTRAINT "work_task_values_field_id_space_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."space_fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_status_id_space_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."space_statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automations_space_idx" ON "automations" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "folders_space_idx" ON "folders" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "lists_space_idx" ON "lists" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "space_fields_space_idx" ON "space_fields" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "space_statuses_space_idx" ON "space_statuses" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "work_task_assignees_user_idx" ON "work_task_assignees" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "work_task_comments_task_idx" ON "work_task_comments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "work_task_sessions_task_idx" ON "work_task_sessions" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "work_task_sessions_user_idx" ON "work_task_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "work_tasks_list_idx" ON "work_tasks" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "work_tasks_space_idx" ON "work_tasks" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "work_tasks_parent_idx" ON "work_tasks" USING btree ("parent_id");--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_work_task_id_work_tasks_id_fk" FOREIGN KEY ("work_task_id") REFERENCES "public"."work_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_edited_by_id_users_id_fk" FOREIGN KEY ("edited_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_work_task_idx" ON "attachments" USING btree ("work_task_id");