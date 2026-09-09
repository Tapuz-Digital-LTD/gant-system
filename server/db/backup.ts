/**
 * A complete copy of every table, before anything is deleted.
 *
 * READ ONLY, inside a transaction that cannot escape into the pooler.
 *
 * Everything, not just the tables a cleanup would empty — a backup that only
 * covers what you expected to lose is a backup for the mistake you did not
 * make. Written as JSON because `pg_dump` is not installed here, and a restore
 * from JSON is slow but possible; no restore at all is neither.
 *
 * The file contains session tokens and email addresses. It is written under
 * .backups/, which is gitignored, and it belongs on disk rather than anywhere
 * it might be shared.
 *
 *   DATABASE_URL=... npx tsx server/db/backup.ts
 */
import dotenv from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Pool } from 'pg';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.log('אין DATABASE_URL — אין מה לגבות.');
  process.exit(1);
}

const pool = new Pool({ connectionString: url, max: 1 });
const client = await pool.connect();

try {
  await client.query('start transaction read only');

  const { rows: meta } = await client.query<{ db: string }>('select current_database() as db');
  const { rows: tables } = await client.query<{ table_name: string }>(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`
  );

  const dump: Record<string, unknown[]> = {};
  for (const { table_name } of tables) {
    const { rows } = await client.query(`select * from "${table_name}"`);
    dump[table_name] = rows;
  }

  mkdirSync('.backups', { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = `.backups/${meta[0].db}-${stamp}.json`;

  writeFileSync(
    file,
    JSON.stringify({ database: meta[0].db, takenAt: new Date().toISOString(), tables: dump }, null, 2)
  );

  const total = Object.values(dump).reduce((n, rows) => n + rows.length, 0);
  console.log(`גיבוי נשמר: ${file}`);
  console.log(`  ${tables.length} טבלאות · ${total} רשומות`);
  for (const [name, rows] of Object.entries(dump)) {
    if (rows.length > 0) console.log(`  ${name.padEnd(18)} ${String(rows.length).padStart(6)}`);
  }
} finally {
  await client.query('rollback').catch(() => {});
  client.release();
  await pool.end();
}
