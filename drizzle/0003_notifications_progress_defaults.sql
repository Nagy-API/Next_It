CREATE TYPE "public"."stage_progress" AS ENUM('not_started', 'processing', 'adjusting', 'waiting_approval');--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"item_id" uuid,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "default_media_id" uuid;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "default_design_id" uuid;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "default_social_id" uuid;--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "slide_number" integer;--> statement-breakpoint
ALTER TABLE "content_plans" ADD COLUMN "canva_url" text;--> statement-breakpoint
ALTER TABLE "content_plans" ADD COLUMN "drive_folder_url" text;--> statement-breakpoint
ALTER TABLE "stages" ADD COLUMN "progress" "stage_progress" DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "stages" ADD COLUMN "progress_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_item_id_content_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."content_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_default_media_id_users_id_fk" FOREIGN KEY ("default_media_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_default_design_id_users_id_fk" FOREIGN KEY ("default_design_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_default_social_id_users_id_fk" FOREIGN KEY ("default_social_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;