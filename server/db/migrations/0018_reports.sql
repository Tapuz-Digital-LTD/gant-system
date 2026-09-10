-- Saved reports and dashboards.
--
-- A saved report holds a *definition*, never a result: the numbers are
-- recomputed on every open, so a report opened in March and again in June
-- answers the same question about different data instead of showing March.
--
-- The definition is jsonb rather than columns because `server/reports/model.ts`
-- is what decides its shape, and it gains a measure without a migration. The
-- column is never queried into — it goes back out to the same validator it
-- came in through.
CREATE TABLE IF NOT EXISTS "saved_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "definition" jsonb NOT NULL,
  -- How it is drawn. One of CHART_KINDS; the query does not read it.
  "chart" text NOT NULL DEFAULT 'bar',
  -- Who made it. This product shares boards, so every saved report is visible
  -- to the whole workspace — the owner decides who may *change* it, not who may
  -- see it. SET NULL rather than CASCADE: a report somebody built should not
  -- disappear from everyone else's dashboard the day they leave.
  "owner_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "pinned" boolean NOT NULL DEFAULT false,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "saved_reports_order_idx"
  ON "saved_reports" ("pinned" DESC, "position", "created_at");--> statement-breakpoint

-- One dashboard per person, holding an ordered list of {savedReportId, size}.
--
-- The layout is a person's own arrangement of reports everybody can see, which
-- is why this row cascades when they go and the reports do not.
CREATE TABLE IF NOT EXISTS "dashboards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "layout" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

-- One per person, enforced rather than assumed: a second row would make
-- "your dashboard" a question with two answers and no way to pick.
CREATE UNIQUE INDEX IF NOT EXISTS "dashboards_owner_idx" ON "dashboards" ("owner_id");
