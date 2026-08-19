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
  const { readFileSync, readdirSync } = await import('node:fs');

  const client = new PGlite('.data/pg');
  closePglite = () => client.close();

  // Apply every generated migration. `create table` statements are guarded by
  // the catch so a warm data directory is left exactly as it was.
  const dir = new URL('./migrations/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const applied = await client
    .query<{ n: number }>(`select count(*)::int as n from information_schema.tables where table_name = 'boards'`)
    .then((r) => r.rows[0].n > 0)
    .catch(() => false);

  if (!applied) {
    for (const file of files) {
      const sql = readFileSync(new URL(file, dir), 'utf-8');
      for (const stmt of sql.split('--> statement-breakpoint')) {
        const s = stmt.trim();
        if (s) await client.exec(s);
      }
    }
    console.log(`▲ PGlite: הוחלו ${files.length} מיגרציות ב-.data/pg`);
  }

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
