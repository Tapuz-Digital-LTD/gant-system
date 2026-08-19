CREATE TYPE "public"."event_status" AS ENUM('todo', 'in_progress', 'ready_kickoff', 'done');--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "status" "event_status" DEFAULT 'todo' NOT NULL;--> statement-breakpoint
CREATE INDEX "events_board_status_idx" ON "events" USING btree ("board_id","status");