/**
 * One-shot import of the prototype's JSON into a real database.
 * Refuses to run against a non-empty database unless --force is given.
 *
 * Usage: DATABASE_URL=... npx tsx server/db/seed.ts [--force]
 */
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { initDb, closeDb } from './client.js';
import { buildRows } from './migrate-from-json.js';
import { boards, events, tasks, checklistItems, comments, users } from './schema.js';
import type { LegacyBoard, LegacyUser } from './migrate-from-json.js';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });

const force = process.argv.includes('--force');
const db = await initDb();

const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(boards);
if (count > 0 && !force) {
  console.error(`בסיס הנתונים כבר מכיל ${count} בחר לוח. הרץ עם --force כדי לדרוס.`);
  await closeDb();
  process.exit(1);
}

const source = JSON.parse(
  readFileSync(new URL('../../data/app-db.json', import.meta.url), 'utf-8')
) as { boards: LegacyBoard[]; users: LegacyUser[] };

const { rows, warnings } = buildRows(source.boards, source.users);

await db.transaction(async (tx) => {
  if (force) {
    // Order matters only for readability — every child cascades from boards.
    await tx.delete(comments);
    await tx.delete(checklistItems);
    await tx.delete(tasks);
    await tx.delete(events);
    await tx.delete(boards);
  }

  if (rows.users.length) await tx.insert(users).values(rows.users).onConflictDoNothing();
  if (rows.boards.length) await tx.insert(boards).values(rows.boards);
  if (rows.events.length) await tx.insert(events).values(rows.events);
  if (rows.tasks.length) {
    await tx.insert(tasks).values(
      rows.tasks.map((t) => ({ ...t, completedAt: t.completedAt ? new Date(t.completedAt) : null }))
    );
  }
  if (rows.checklistItems.length) await tx.insert(checklistItems).values(rows.checklistItems);
  if (rows.comments.length) {
    await tx.insert(comments).values(
      rows.comments.map((c) => ({ ...c, createdAt: new Date(c.createdAt) }))
    );
  }
});

console.log(
  `נטענו: ${rows.boards.length} בחר לוח · ${rows.events.length} אירועים · ` +
    `${rows.tasks.length} משימות · ${rows.users.length} אנשים`
);
if (warnings.length) console.log(`${warnings.length} אזהרות (ראה migrate.test.ts לפירוט)`);

await closeDb();
