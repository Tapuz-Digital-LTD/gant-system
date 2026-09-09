/**
 * Does the database this app is pointed at have everything the code expects?
 *
 * READ ONLY. Runs one SELECT against information_schema and nothing else.
 *
 * The unit test in schema.test.ts proves the migration *files* cover the code.
 * This proves a *particular database* has actually had them applied — which is
 * the gap that took production down: the repo was internally consistent, the
 * database was internally consistent, and they disagreed with each other.
 *
 * Run it against production after a deploy that touches the schema:
 *   DATABASE_URL=... npx tsx server/db/check-schema.ts
 */
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { getTableColumns, getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import * as schema from './schema.js';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.log('✅ אין DATABASE_URL — מסד מקומי, אין מה לבדוק מרחוק');
  process.exit(0);
}

const pool = new Pool({ connectionString: url, max: 1 });

/*
 * The read-only guard is a transaction, never a SET.
 *
 * `SET default_transaction_read_only = on` outside a transaction sticks to the
 * server connection underneath, and a transaction pooler then hands that same
 * connection to the next client — including the live application, which then
 * cannot write. START TRANSACTION READ ONLY ends with the transaction and
 * cannot escape into anybody else's session.
 */
const client = await pool.connect();
let rows;
try {
  await client.query('start transaction read only');
  rows = await client.query<{ table_name: string; column_name: string }>(
    `select table_name, column_name from information_schema.columns where table_schema = 'public'`
  );
  await client.query('commit');
} finally {
  client.release();
}

const actual = new Map<string, Set<string>>();
for (const r of rows.rows) {
  if (!actual.has(r.table_name)) actual.set(r.table_name, new Set());
  actual.get(r.table_name)!.add(r.column_name);
}

const missing: string[] = [];
const extra: string[] = [];

for (const table of (Object.values(schema).filter((v) => is(v, PgTable)) as unknown as PgTable[])) {
  const name = getTableName(table);
  const expected = new Set(Object.values(getTableColumns(table)).map((c) => c.name));
  const have = actual.get(name);

  if (!have) {
    missing.push(`טבלה ${name} — לא קיימת בכלל`);
    continue;
  }
  for (const column of expected) if (!have.has(column)) missing.push(`${name}.${column}`);
  // Not a failure: a column nothing reads is dead weight, not an outage.
  for (const column of have) if (!expected.has(column)) extra.push(`${name}.${column}`);
}

await pool.end();

console.log(`מסד: ${url.replace(/\/\/[^@]*@/, '//***@').slice(0, 60)}…\n`);

if (extra.length > 0) {
  console.log('עמודות שקיימות במסד ואף שורת קוד לא קוראת:');
  for (const e of extra) console.log(`  · ${e}`);
  console.log('');
}

if (missing.length > 0) {
  console.error('❌ הקוד מצפה לעמודות שלא קיימות במסד — כל בקשה שנוגעת בהן תיפול ב-500:');
  for (const m of missing) console.error(`  · ${m}`);
  console.error('\nהרץ: npm run db:migrate');
  process.exit(1);
}

console.log('✅ המסד מכיל כל מה שהקוד מצפה לו');
