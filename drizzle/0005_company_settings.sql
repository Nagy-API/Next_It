CREATE TABLE "company_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text,
	"app_name" text,
	"admin_contact" text,
	"primary_color" text,
	"dark_color" text,
	"logo" text,
	"mark" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
