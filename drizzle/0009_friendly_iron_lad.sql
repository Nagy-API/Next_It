ALTER TABLE "tasks" ADD COLUMN "status" text DEFAULT 'todo' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "scheduled_date" date;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "status_at" timestamp with time zone;