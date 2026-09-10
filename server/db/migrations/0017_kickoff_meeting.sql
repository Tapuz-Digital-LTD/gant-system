-- ישיבת התנעה: the meeting where the work is handed out.
--
-- It is not `work_start_date` (a period's beginning, drawn as the bar's edge)
-- and it is not `kickoff_date` (the campaign reaching customers). In the real
-- planning data the gap between this meeting and the go-live is two to six
-- months, so folding it into either one would have destroyed the distinction
-- the whole product is about.
--
-- Nullable and never derived, exactly like every other milestone.
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "kickoff_meeting_date" date;--> statement-breakpoint

-- Where this row came from, when it came from outside.
--
-- Null for everything a person typed, and unconstrained: two campaigns may
-- legitimately share a name and a day, and the database is not the place to
-- argue about that.
--
-- Set by the importer to a key derived from the source file's own identity for
-- the row — not from its position, because the same activity appears on three
-- sheets at three different row numbers. Re-importing the file therefore
-- matches the row it created last time and updates it, and the unique index
-- makes doubling a board impossible rather than merely unlikely.
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "source_key" text;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "events_source_key_idx"
  ON "events" ("board_id", "source_key")
  WHERE "source_key" IS NOT NULL;
