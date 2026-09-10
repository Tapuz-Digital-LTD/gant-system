-- Things hanging off a task: a link to a brief, a shared drive folder, a spec.
--
-- `kind` exists so an uploaded file can join later without a second table and a
-- second set of routes. Today every row is a link, which needs no storage
-- service and works the moment it is pasted — a Drive or Dropbox URL is how
-- most of this material is already shared.
CREATE TABLE IF NOT EXISTS "task_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "task_id" uuid NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "kind" text NOT NULL DEFAULT 'link',
  -- What a person calls it. Falls back to the host when nobody types a name.
  "title" text NOT NULL,
  "url" text NOT NULL,
  "added_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "task_attachments_task_idx" ON "task_attachments" ("task_id", "created_at");
