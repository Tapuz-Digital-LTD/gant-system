-- Which kinds of message this organisation has switched on.
--
-- Separate from `notification_defaults`, which is about *what* is worth saying
-- to a person. This is the master switch above all of that: whether a whole
-- channel leaves the building at all.
--
-- It lives in the database rather than in an environment variable because an
-- administrator has to be able to see it and change it without a deploy. The
-- environment variable stays as the outer gate — it decides whether *this
-- deployment* may send at all, which is what keeps a laptop and the test suite
-- silent no matter what is stored here.
ALTER TABLE "workspace_settings"
  ADD COLUMN IF NOT EXISTS "channels" jsonb NOT NULL DEFAULT '{}'::jsonb;
