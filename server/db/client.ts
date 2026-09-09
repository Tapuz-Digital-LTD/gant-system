import { drizzle as drizzleNode } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

let pool: Pool | undefined;
let closePglite: (() => Promise<void>) | undefined;
let db: Database | undefined;

/**
 * Production uses DATABASE_URL over `pg`.
 *
 * Development with no DATABASE_URL falls back to PGlite persisted under
 * `.data/pg` — a genuine Postgres running in-process, so local work exercises
 * the same SQL, the same constraints and the same migrations as production
 * rather than a mock that lies about them.
 */
export async function initDb(): Promise<Database> {
  if (db) return db;

  const url = process.env.DATABASE_URL;

  if (url) {
    pool = new Pool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000
    });
    db = drizzleNode(pool, { schema });
    return db;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is required in production');
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle: drizzlePglite } = await import('drizzle-orm/pglite');
  const { readFileSync, readdirSync, mkdirSync } = await import('node:fs');

  // PGlite creates the leaf directory but not its parents, so a fresh clone
  // dies on ENOENT before the first query.
  mkdirSync('.data/pg', { recursive: true });
  const client = new PGlite('.data/pg');
  closePglite = () => client.close();

  // Same ledger the production runner uses, so a warm data directory picks up
  // new migrations instead of being frozen at whatever shape it was created in.
  const dir = new URL('./migrations/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  await client.exec(`create table if not exists _migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`);

  // A directory created before this ledger existed already has every migration
  // up to 0005 applied; recording them avoids replaying them onto live tables.
  const hasBoards = await client
    .query<{ n: number }>(`select count(*)::int as n from information_schema.tables where table_name = 'boards'`)
    .then((r) => r.rows[0].n > 0);
  const ledger = await client.query<{ n: number }>(`select count(*)::int as n from _migrations`);
  if (hasBoards && ledger.rows[0].n === 0) {
    for (const file of files.filter((f) => f < '0006')) {
      await client.query('insert into _migrations (name) values ($1)', [file]);
    }
  }

  const done = new Set(
    (await client.query<{ name: string }>('select name from _migrations')).rows.map((r) => r.name)
  );

  let count = 0;
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = readFileSync(new URL(file, dir), 'utf-8');
    for (const stmt of sql.split('--> statement-breakpoint')) {
      const s = stmt.trim();
      if (s) await client.exec(s);
    }
    await client.query('insert into _migrations (name) values ($1)', [file]);
    count++;
  }
  if (count) console.log(`▲ PGlite: הוחלו ${count} מיגרציות ב-.data/pg`);

  db = drizzlePglite(client, { schema }) as unknown as Database;
  return db;
}

/** Synchronous accessor for request handlers — initDb must have run at boot. */
export function getDb(): Database {
  if (!db) throw new Error('database not initialised; call initDb() first');
  return db;
}

export function isDatabaseReady(): boolean {
  return Boolean(db);
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  await closePglite?.();
  pool = undefined;
  closePglite = undefined;
  db = undefined;
}

export { schema };
