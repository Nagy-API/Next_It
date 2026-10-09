ALTER TYPE "public"."stage_progress" ADD VALUE 'changes_requested';--> statement-breakpoint
ALTER TYPE "public"."stage_progress" ADD VALUE 'scheduled';--> statement-breakpoint
CREATE TABLE "alert_dismissals" (
	"user_id" uuid NOT NULL,
	"alert_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_dismissals_user_id_alert_id_pk" PRIMARY KEY("user_id","alert_id")
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid,
	"task_id" uuid,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"mime" text,
	"size" integer,
	"storage_key" text,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"text" text NOT NULL,
	"color" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "work_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text
);
--> statement-breakpoint
ALTER TABLE "stages" ADD COLUMN "scheduled_for" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role_label" text;--> statement-breakpoint
ALTER TABLE "versions" ADD COLUMN "alt_urls" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "versions" ADD COLUMN "chosen_url" text;--> statement-breakpoint
ALTER TABLE "alert_dismissals" ADD CONSTRAINT "alert_dismissals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_item_id_content_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."content_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_item_id_content_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."content_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_item_idx" ON "attachments" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "attachments_task_idx" ON "attachments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "notes_expires_idx" ON "notes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "work_sessions_user_idx" ON "work_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "work_sessions_stage_idx" ON "work_sessions" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "work_sessions_item_idx" ON "work_sessions" USING btree ("item_id");