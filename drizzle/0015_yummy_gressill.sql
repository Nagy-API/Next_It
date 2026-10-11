CREATE TABLE "private_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"color" text,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "chat_message_id" uuid;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "private_note_id" uuid;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "private_notes" ADD CONSTRAINT "private_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "private_notes_user_idx" ON "private_notes" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_chat_message_id_chat_messages_id_fk" FOREIGN KEY ("chat_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_private_note_id_private_notes_id_fk" FOREIGN KEY ("private_note_id") REFERENCES "public"."private_notes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_plan_id_content_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."content_plans"("id") ON DELETE no action ON UPDATE no action;