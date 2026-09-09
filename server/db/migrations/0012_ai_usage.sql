-- What the assistant has cost today, per person.
--
-- The throttle it replaces lived in a module-level array, which means it reset
-- on every cold start and was counted separately by every warm instance. On
-- serverless that is not a limit, it is a suggestion: ten instances allow ten
-- times the traffic, and a restart forgives everything.
--
-- One row per person per day. Small, and it never needs history — a cleanup can
-- drop old days whenever somebody cares.
CREATE TABLE IF NOT EXISTS "ai_usage" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "day" date NOT NULL,
  "calls" integer NOT NULL DEFAULT 0,
  -- Tokens as the provider reported them, so a spend question has an answer
  -- that does not require guessing from the call count.
  "input_tokens" bigint NOT NULL DEFAULT 0,
  "output_tokens" bigint NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "day")
);
