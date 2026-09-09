/**
 * What is actually in this database, before anybody deletes anything.
 *
 * READ ONLY, inside a transaction that cannot escape into the pooler.
 *
 * Two jobs. First, prove which database this is — a cleanup run against a
 * shared or wrong database is not recoverable by saying sorry. Second, split
 * every table into what a sample-data cleanup would remove and what it must
 * leave standing, so the decision is made from a list rather than a hope.
 *
 *   DATABASE_URL=... npx tsx server/db/inventory.ts
 */
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { getTableName } from 'drizzle-orm';
import * as schema from './schema.js';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.log('אין DATABASE_URL — הרץ מול המסד שברצונך לבדוק.');
  process.exit(1);
}

/*
 * Names come from the schema, never from memory.
 *
 * Written by hand the first time, this listed `activity_log`, `session` and
 * `permissions` — three tables that do not exist — and then reported seven real
 * tables as evidence of a shared database. A list of names typed from memory is
 * a list of names that is wrong.
 *
 * Deleted in this order: children before parents, so no foreign key has to be
 * argued with.
 */
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

/** Who exists, what they may do, how the place is set up. Never emptied. */
const KEEP = [
  schema.users,
  schema.rolePermissions,
  schema.notificationPrefs,
  schema.workspaceSettings,
  schema.sessions,
  schema.accounts,
  schema.verifications
].map(getTableName);

/** Drizzle's own bookkeeping. Not ours to classify, and never ours to empty. */
const INFRASTRUCTURE = ['_migrations', '__drizzle_migrations'];

const pool = new Pool({ connectionString: url, max: 1 });
const client = await pool.connect();

try {
  await client.query('start transaction read only');

  const { rows: who } = await client.query<{ db: string; usr: string; host: string }>(
    `select current_database() as db, current_user as usr, inet_server_addr()::text as host`
  );
  console.log('מסד הנתונים');
  console.log(`  שם:        ${who[0].db}`);
  console.log(`  משתמש:     ${who[0].usr}`);
  console.log(`  כתובת:     ${who[0].host ?? '(לא נחשפת)'}`);

  const { rows: tables } = await client.query<{ table_name: string }>(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`
  );
  const names = tables.map((t) => t.table_name);

  /*
   * Is anything else living here?
   *
   * A table this schema has never heard of is the signal that the database is
   * shared with another product — and the moment to stop, not to guess.
   */
  const known = new Set([...CONTENT, ...KEEP, ...INFRASTRUCTURE]);
  const strangers = names.filter((n) => !known.has(n));

  // A table the code declares but the database has not got is a migration that
  // never ran — worth knowing before trusting any count below.
  const declared = Object.values(schema)
    .filter((t): t is typeof schema.users => typeof t === 'object' && t !== null && Symbol.for('drizzle:Name') in t)
    .map(getTableName);
  const missing = declared.filter((n) => !names.includes(n));

  const count = async (t: string) => {
    const { rows } = await client.query<{ n: string }>(`select count(*)::text as n from "${t}"`);
    return Number(rows[0].n);
  };

  console.log('\nיימחק (תוכן שהוזן במערכת)');
  let removed = 0;
  for (const t of CONTENT.filter((t) => names.includes(t))) {
    const n = await count(t);
    removed += n;
    console.log(`  ${t.padEnd(18)} ${String(n).padStart(6)}`);
  }

  console.log('\nיישאר (משתמשים, הרשאות, הגדרות, תשתית)');
  for (const t of KEEP.filter((t) => names.includes(t))) {
    console.log(`  ${t.padEnd(18)} ${String(await count(t)).padStart(6)}`);
  }

  if (strangers.length > 0) {
    console.log('\n⚠️  טבלאות שאינן מוכרות לסכימה הזאת — ייתכן שהמסד משותף:');
    for (const t of strangers) console.log(`  ${t.padEnd(18)} ${String(await count(t)).padStart(6)}`);
  } else {
    console.log('\n✅ כל הטבלאות שייכות למערכת הזאת בלבד. אין סימן למסד משותף.');
  }

  if (missing.length > 0) {
    console.log(`\n⚠️  בקוד קיימות וכאן חסרות — מיגרציה שלא רצה: ${missing.join(', ')}`);
  }

  // The orphan column, and whether anything is actually stored in it.
  const { rows: launch } = await client.query<{ exists: boolean }>(
    `select exists (select 1 from information_schema.columns
       where table_schema='public' and table_name='events' and column_name='launch_date') as exists`
  );
  if (launch[0].exists) {
    const { rows } = await client.query<{ n: string }>(
      `select count(*)::text as n from events where launch_date is not null`
    );
    console.log(`\nlaunch_date: קיימת, ${rows[0].n} שורות עם ערך`);
  } else {
    console.log('\nlaunch_date: לא קיימת במסד הזה');
  }

  console.log(`\nסך הכול למחיקה: ${removed} רשומות`);
} finally {
  await client.query('rollback').catch(() => {});
  client.release();
  await pool.end();
}
