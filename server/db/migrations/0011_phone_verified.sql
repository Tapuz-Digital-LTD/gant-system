-- Whether a person has proved they hold the number on their account.
--
-- The number itself already lives in `users.phone` (0009). Better Auth's phone
-- plugin wants a column called `phone_number`; it is pointed at the existing
-- one instead, because two columns for one fact is how the next person writes
-- to the wrong one — the same mistake `launch_date` was.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone_verified" boolean NOT NULL DEFAULT false;

-- One account per number. Signing in by phone means the number has to identify
-- exactly one person, and a partial index leaves the many NULLs alone.
CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_unique" ON "users" ("phone") WHERE "phone" IS NOT NULL;
