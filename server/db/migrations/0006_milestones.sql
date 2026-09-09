-- Idempotent on purpose.
--
-- The production database was given three of these columns by hand on
-- 2026-08-31, under a migration name that was never committed. A plain
-- ADD COLUMN IF NOT EXISTS then fails on the first one that already exists, the transaction
-- rolls back, and the two genuinely missing columns never arrive — which is
-- what took event creation and event listing down.
--
-- IF NOT EXISTS makes this file safe to run against a database in any of those
-- states: one that has none of them, one that has some, one that has all.
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "work_start_date" date;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "review_date" date;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "freeze_date" date;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "announce_date" date;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "campaign_end_date" date;
