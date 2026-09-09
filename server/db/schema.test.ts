// Every column the code reads or writes must exist after the migrations run.
// Run: npx tsx server/db/schema.test.ts
//
// This is the check that was missing when the deployed code started selecting
// work_start_date and announce_date from a production database that had never
// been given them. Every request that touched an event returned 500.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { getTableColumns, getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import * as schema from './schema.ts';

const pg = new PGlite();
const dir = new URL('./migrations/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

for (const file of files) {
  for (const stmt of readFileSync(new URL(file, dir), 'utf-8').split('--> statement-breakpoint')) {
    const s = stmt.trim();
    if (s) await pg.exec(s);
  }
}

/** What the database actually has, after every migration file. */
const actual = new Map<string, Set<string>>();
const rows = await pg.query<{ table_name: string; column_name: string }>(
  `select table_name, column_name from information_schema.columns where table_schema = 'public'`
);
for (const r of rows.rows) {
  if (!actual.has(r.table_name)) actual.set(r.table_name, new Set());
  actual.get(r.table_name)!.add(r.column_name);
}

/** What the code believes it has. */
const tables = (Object.values(schema).filter((v) => is(v, PgTable)) as unknown as PgTable[]);
assert.ok(tables.length > 0, 'the schema module exports tables');

const missing: string[] = [];
for (const table of tables) {
  const name = getTableName(table);
  const columns = Object.values(getTableColumns(table)).map((c) => c.name);
  const have = actual.get(name);

  if (!have) {
    missing.push(`table ${name} — no migration creates it`);
    continue;
  }
  for (const column of columns) {
    if (!have.has(column)) missing.push(`${name}.${column}`);
  }
}

assert.deepEqual(
  missing,
  [],
  `the code expects columns no migration creates:\n  ${missing.join('\n  ')}\n` +
    'Add a migration, or the next deploy returns 500 on every query that touches them.'
);

// Every ADD COLUMN must be idempotent.
//
// Production had been given three of these columns by hand. A plain ADD COLUMN
// aborts on the first one that already exists, the transaction rolls back, and
// the columns that were genuinely missing never arrive. That is what took every
// event query down; this rule is what stops it happening again.
const notIdempotent: string[] = [];
for (const file of files) {
  const sql = readFileSync(new URL(file, dir), 'utf-8');
  for (const line of sql.split('\n')) {
    if (line.trimStart().startsWith('--')) continue;
    if (/add column/i.test(line) && !/add column if not exists/i.test(line)) {
      notIdempotent.push(`${file}: ${line.trim().slice(0, 80)}`);
    }
  }
}

assert.deepEqual(
  notIdempotent,
  [],
  `these ADD COLUMN statements abort when the column is already there:\n  ${notIdempotent.join('\n  ')}\n` +
    'Write ADD COLUMN IF NOT EXISTS.'
);

await pg.close();
console.log(`schema: כל ${tables.length} הטבלאות תואמות למיגרציות ✓`);
