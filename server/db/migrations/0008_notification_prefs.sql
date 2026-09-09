-- What each person wants to hear about, and how.
CREATE TABLE IF NOT EXISTS "notification_prefs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_user_id_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
--> statement-breakpoint
-- The organisation's own defaults, for people who never open the settings.
-- One row, forever: the primary key can only ever hold `true`.
CREATE TABLE IF NOT EXISTS "workspace_settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"notification_defaults" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_settings_single_row" CHECK ("id")
);
--> statement-breakpoint
-- The clock a "nobody has started this" reminder runs on.
--
-- Set whenever a task changes hands. Backfilled from created_at for tasks that
-- already have an owner, which is exact rather than a guess: until today the
-- interface had no way to set an owner at all, so every existing assignment
-- happened at creation.
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "assigned_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "tasks" SET "assigned_at" = "created_at" WHERE "assignee_id" IS NOT NULL AND "assigned_at" IS NULL;
