/**
 * Empties the content tables, and only those.
 *
 * The system has not gone live: every board, event and task in it is sample
 * data. This clears them so employees start on a clean page, and leaves
 * standing everything that is not content — who exists, what they may do, how
 * the workspace is configured, and the migration history.
 *
 * Three things make this safe to run rather than merely reversible:
 *
 *  · It refuses without `--yes`, so it cannot happen by arrow-key.
 *  · It refuses without a backup taken today, so "I meant to back up first"
 *    is not a state this script can be in.
 *  · One transaction. A foreign key it did not expect rolls the whole thing
 *    back rather than leaving half a database.
 *
 *   DATABASE_URL=... npx tsx server/db/backup.ts
 *   DATABASE_URL=... npx tsx server/db/clean-sample-data.ts --yes
 */
import dotenv from 'dotenv';
import { readdirSync, statSync } from 'node:fs';
import { Pool } from 'pg';
import { getTableName } from 'drizzle-orm';
import * as schema from './schema.js';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });

/** Children before parents, so no foreign key has to be argued with. */
const CONTENT = [
  schema.notifications,
  schema.activity,
  schema.checklistItems,
  schema.comments,
  schema.tasks,
  schema.events,
  schema.invites,
  schema.boardMembers,
  schema.boards
].map(getTableName);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('אין DATABASE_URL.');
  process.exit(1);
}

if (!process.argv.includes('--yes')) {
  console.error('פעולה הרסנית. הוסף --yes כדי לאשר.');
  process.exit(1);
}

/*
 * A backup from last week is not a backup for this deletion.
 *
 * The check is deliberately about *today* rather than about a file existing:
 * a stale dump is the most convincing way to believe you are covered.
 */
const recent = (() => {
  try {
    const day = 86_400_000;
    return readdirSync('.backups')
      .filter((f) => f.endsWith('.json'))
      .some((f) => Date.now() - statSync(`.backups/${f}`).mtimeMs < day);
  } catch {
    return false;
  }
})();

if (!recent) {
  console.error('אין גיבוי מהיום ב-.backups/. הרץ קודם: npx tsx server/db/backup.ts');
  process.exit(1);
}

const pool = new Pool({ connectionString: url, max: 1 });
const client = await pool.connect();

try {
  const { rows: who } = await client.query<{ db: string }>('select current_database() as db');
  console.log(`מסד: ${who[0].db}\n`);

  /*
   * Only tables this particular database actually has.
   *
   * A database that has not had every migration applied is missing tables the
   * code knows about — and a table that does not exist has nothing to delete.
   * Aborting the whole cleanup over it would be treating a non-problem as a
   * failure.
   */
  const { rows: existing } = await client.query<{ table_name: string }>(
    `select table_name from information_schema.tables where table_schema = 'public'`
  );
  const present = new Set(existing.map((r) => r.table_name));
  const skipped = CONTENT.filter((t) => !present.has(t));
  if (skipped.length > 0) console.log(`דילוג — לא קיימות במסד הזה: ${skipped.join(', ')}\n`);

  await client.query('begin');

  let total = 0;
  for (const table of CONTENT.filter((t) => present.has(t))) {
    const { rowCount } = await client.query(`delete from "${table}"`);
    total += rowCount ?? 0;
    if (rowCount) console.log(`  נמחקו ${String(rowCount).padStart(5)} מתוך ${table}`);
  }

  await client.query('commit');
  console.log(`\n✅ נוקו ${total} רשומות.`);

  for (const table of [schema.users, schema.rolePermissions, schema.notificationPrefs].map(getTableName)) {
    try {
      const { rows } = await client.query<{ n: string }>(`select count(*)::text as n from "${table}"`);
      console.log(`   ${table} נשאר על ${rows[0].n}`);
    } catch {
      console.log(`   ${table} — לא קיימת במסד הזה`);
    }
  }
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error('\n❌ בוטל, שום דבר לא נמחק:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
