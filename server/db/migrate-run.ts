/** Applies every generated migration to DATABASE_URL. Idempotent. */
import dotenv from 'dotenv';
import { readFileSync, readdirSync } from 'node:fs';
import { Pool } from 'pg';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });

/*
 * Schema changes go down a direct connection, never a transaction pooler.
 *
 * A pooler hands the same server connection to whoever asks next, so anything
 * left on it — a SET, a session state — leaks. DDL also does not belong in
 * transaction pooling. Neon and Vercel both publish an unpooled URL alongside
 * the pooled one; use it when it exists.
 */
const url =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.EU_DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.EU_POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL;

if (!url) throw new Error('DATABASE_URL is not set');

const pooled = url === process.env.DATABASE_URL && /-pooler\./.test(url);
console.log(
  pooled
    ? '⚠️  רץ דרך מאגד חיבורים. עדיף להגדיר DATABASE_URL_UNPOOLED'
    : `▲ חיבור ישיר: ${url.replace(/\/\/[^@]*@/, '//***@').slice(0, 55)}…`
);

const pool = new Pool({ connectionString: url, max: 1 });
const dir = new URL('./migrations/', import.meta.url);

await pool.query(`create table if not exists _migrations (
  name text primary key,
  applied_at timestamptz not null default now()
)`);

const done = new Set((await pool.query<{ name: string }>('select name from _migrations')).rows.map((r) => r.name));

for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  if (done.has(file)) {
    console.log(`· ${file} — כבר הוחל`);
    continue;
  }
  const client = await pool.connect();
  try {
    await client.query('begin');
    for (const stmt of readFileSync(new URL(file, dir), 'utf-8').split('--> statement-breakpoint')) {
      const s = stmt.trim();
      if (s) await client.query(s);
    }
    await client.query('insert into _migrations (name) values ($1)', [file]);
    await client.query('commit');
    console.log(`✓ ${file}`);
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

await pool.end();
console.log('המיגרציות הושלמו');
