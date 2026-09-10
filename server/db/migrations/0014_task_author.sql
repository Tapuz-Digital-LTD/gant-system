-- Who opened this task.
--
-- Boards and events have recorded their author since the beginning; tasks never
-- did. In a kickoff meeting somebody hands out ten pieces of work, and "who
-- asked for this" is the first question the person doing it has — right after
-- "what exactly does it mean".
--
-- Nullable, because every task that already exists has no answer, and inventing
-- one is worse than admitting it.
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;
