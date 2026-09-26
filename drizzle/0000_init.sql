CREATE TYPE "public"."content_type" AS ENUM('reel', 'static', 'carousel', 'story');--> statement-breakpoint
CREATE TYPE "public"."platform_status" AS ENUM('not_planned', 'pending', 'scheduled', 'published', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."stage_kind" AS ENUM('content', 'media', 'design', 'social', 'delivery');--> statement-breakpoint
CREATE TYPE "public"."stage_status" AS ENUM('waiting', 'active', 'done');--> statement-breakpoint
CREATE TYPE "public"."team" AS ENUM('leadership', 'content', 'media', 'design', 'social', 'account');--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"summary" text NOT NULL,
	"item_id" uuid,
	"brand_id" uuid,
	"project_id" uuid,
	"client_id" uuid,
	"subject_user_id" uuid,
	"stage_kind" "stage_kind",
	"field" text,
	"old_value" text,
	"new_value" text,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"color" text DEFAULT '#3B82F6' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"default_creator_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "brands_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"tag" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"type" "content_type" NOT NULL,
	"plan_id" uuid,
	"project_id" uuid,
	"canva_url" text,
	"drive_url" text,
	"posting_date" date,
	"posting_time" text,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" uuid,
	CONSTRAINT "content_items_owner_ck" CHECK (("content_items"."plan_id" is null) <> ("content_items"."project_id" is null))
);
--> statement-breakpoint
CREATE TABLE "content_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" uuid,
	CONSTRAINT "content_plans_month_ck" CHECK ("content_plans"."month" between 1 and 12)
);
--> statement-breakpoint
CREATE TABLE "item_platforms" (
	"item_id" uuid NOT NULL,
	"platform_id" uuid NOT NULL,
	"status" "platform_status" DEFAULT 'pending' NOT NULL,
	"date" date,
	"time" text,
	"live_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_id" uuid,
	CONSTRAINT "item_platforms_item_id_platform_id_pk" PRIMARY KEY("item_id","platform_id")
);
--> statement-breakpoint
CREATE TABLE "platforms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platforms_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" uuid
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"kind" "stage_kind" NOT NULL,
	"credited_user_id" uuid,
	"completed_by_id" uuid NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"deadline" date,
	"late_days" integer DEFAULT 0 NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"excused" boolean DEFAULT false NOT NULL,
	"excused_by_id" uuid,
	"excused_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"kind" "stage_kind" NOT NULL,
	"position" integer NOT NULL,
	"status" "stage_status" DEFAULT 'waiting' NOT NULL,
	"assignee_id" uuid,
	"original_deadline" date,
	"deadline" date,
	"shift_days" integer DEFAULT 0 NOT NULL,
	"shift_reason" text,
	"propagated_delay_days" integer DEFAULT 0 NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"activated_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"completed_by_id" uuid,
	"returned_at" timestamp with time zone,
	"returned_by_id" uuid,
	"return_note" text,
	"late_excused_at" timestamp with time zone,
	"late_excused_by_id" uuid
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"teams" "team"[] DEFAULT '{}'::team[] NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deactivated_at" timestamp with time zone,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_item_id_content_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."content_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_default_creator_id_users_id_fk" FOREIGN KEY ("default_creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_item_id_content_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."content_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_plan_id_content_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."content_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_cancelled_by_id_users_id_fk" FOREIGN KEY ("cancelled_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_plans" ADD CONSTRAINT "content_plans_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_plans" ADD CONSTRAINT "content_plans_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_platforms" ADD CONSTRAINT "item_platforms_item_id_content_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."content_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_platforms" ADD CONSTRAINT "item_platforms_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_platforms" ADD CONSTRAINT "item_platforms_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_completions" ADD CONSTRAINT "stage_completions_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_completions" ADD CONSTRAINT "stage_completions_item_id_content_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."content_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_completions" ADD CONSTRAINT "stage_completions_credited_user_id_users_id_fk" FOREIGN KEY ("credited_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_completions" ADD CONSTRAINT "stage_completions_completed_by_id_users_id_fk" FOREIGN KEY ("completed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_completions" ADD CONSTRAINT "stage_completions_excused_by_id_users_id_fk" FOREIGN KEY ("excused_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_item_id_content_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."content_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_completed_by_id_users_id_fk" FOREIGN KEY ("completed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_returned_by_id_users_id_fk" FOREIGN KEY ("returned_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_late_excused_by_id_users_id_fk" FOREIGN KEY ("late_excused_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_item_idx" ON "activity_log" USING btree ("item_id","at");--> statement-breakpoint
CREATE INDEX "activity_at_idx" ON "activity_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "activity_actor_idx" ON "activity_log" USING btree ("actor_id","at");--> statement-breakpoint
CREATE INDEX "activity_brand_idx" ON "activity_log" USING btree ("brand_id","at");--> statement-breakpoint
CREATE INDEX "comments_item_idx" ON "comments" USING btree ("item_id","created_at");--> statement-breakpoint
CREATE INDEX "content_items_plan_idx" ON "content_items" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "content_items_project_idx" ON "content_items" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "content_items_posting_idx" ON "content_items" USING btree ("posting_date");--> statement-breakpoint
CREATE UNIQUE INDEX "content_plans_brand_month_uq" ON "content_plans" USING btree ("brand_id","year","month");--> statement-breakpoint
CREATE INDEX "projects_client_idx" ON "projects" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stage_completions_user_idx" ON "stage_completions" USING btree ("credited_user_id","completed_at");--> statement-breakpoint
CREATE INDEX "stage_completions_stage_idx" ON "stage_completions" USING btree ("stage_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stages_item_kind_uq" ON "stages" USING btree ("item_id","kind");--> statement-breakpoint
CREATE INDEX "stages_assignee_idx" ON "stages" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "stages_status_idx" ON "stages" USING btree ("status");