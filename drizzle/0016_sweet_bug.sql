ALTER TYPE "public"."content_type" ADD VALUE 'other';--> statement-breakpoint
ALTER TYPE "public"."stage_kind" ADD VALUE 'approval';--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "approver_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "approved_by_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "return_note" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "returned_by_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "returned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_returned_by_id_users_id_fk" FOREIGN KEY ("returned_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;