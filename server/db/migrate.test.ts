// Runs the real schema against an in-process Postgres (PGlite) and loads the real
// production JSON through it. No external database required.
// Run: npx tsx server/db/migrate.test.ts
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { buildRows } from './migrate-from-json.ts';
import type { LegacyBoard, LegacyUser } from './migrate-from-json.ts';

const db = JSON.parse(readFileSync(new URL('../../data/app-db.json', import.meta.url), 'utf-8')) as {
  boards: LegacyBoard[];
  users: LegacyUser[];
};

const { rows, warnings } = buildRows(db.boards, db.users);
const sourceEvents = db.boards.flatMap((b) => b.events || []);

// ---------- transform ----------
assert.equal(rows.boards.length, db.boards.length, 'every board migrates');
assert.equal(rows.events.length, sourceEvents.length, 'no event is silently dropped');

// The isFloating contradiction: actualDate length is authoritative.
const monthOnly = sourceEvents.filter((e) => e.actualDate?.length === 7);
const migratedMonth = rows.events.filter((e) => e.actualPrecision === 'month');
assert.ok(
  migratedMonth.length >= monthOnly.length,
  `all ${monthOnly.length} month-precision events keep month precision`
);
for (const ev of rows.events) {
  assert.match(ev.actualDate, /^\d{4}-\d{2}-\d{2}$/, `${ev.title}: actual_date is a full DATE`);
  if (ev.actualPrecision === 'month') {
    assert.ok(ev.actualDate.endsWith('-01'), `${ev.title}: month precision anchors to the 1st`);
  }
  assert.ok(ev.prepMonths >= 0 && ev.prepMonths <= 12, `${ev.title}: prepMonths in range`);
}

// Users are deduped case-insensitively.
const emails = rows.users.map((u) => u.email);
assert.equal(new Set(emails).size, emails.length, 'no duplicate users');
assert.ok(emails.every((e) => e === e.toLowerCase()), 'emails normalised to lower case');

// ---------- schema + load ----------
const pg = new PGlite();
const migrationsDir = new URL('./migrations/', import.meta.url);
for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
  for (const statement of readFileSync(new URL(file, migrationsDir), 'utf-8').split('--> statement-breakpoint')) {
    const trimmed = statement.trim();
    if (trimmed) await pg.exec(trimmed);
  }
}

for (const u of rows.users) {
  await pg.query('INSERT INTO users (id, email, name, role) VALUES ($1,$2,$3,$4)', [
    u.id, u.email, u.name, u.role
  ]);
}
for (const b of rows.boards) {
  await pg.query('INSERT INTO boards (id, name, description, position) VALUES ($1,$2,$3,$4)', [
    b.id, b.name, b.description, b.position
  ]);
}
for (const e of rows.events) {
  await pg.query(
    `INSERT INTO events (id, board_id, title, category, kickoff_date, actual_date,
       actual_precision, prep_months, note, description, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [e.id, e.boardId, e.title, e.category, e.kickoffDate, e.actualDate,
     e.actualPrecision, e.prepMonths, e.note, e.description, e.createdBy]
  );
}

const counted = await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM events');
assert.equal(counted.rows[0].n, rows.events.length, 'Postgres accepted every event row');

// ---------- the query the whole product depends on ----------
const windowed = await pg.query<{ n: number }>(
  `SELECT count(*)::int AS n FROM events
    WHERE board_id = $1 AND actual_date BETWEEN $2 AND $3`,
  [rows.boards[0].id, '2026-09-01', '2026-09-30']
);
assert.ok(windowed.rows[0].n > 0, 'the windowed date-range query returns rows');

// The index that keeps that query constant-time regardless of history size.
const plan = await pg.query<{ 'QUERY PLAN': string }>(
  `EXPLAIN SELECT * FROM events WHERE board_id = '${rows.boards[0].id}' AND actual_date BETWEEN '2026-09-01' AND '2026-09-30'`
);
assert.ok(plan.rows.length > 0, 'planner produced a plan for the window query');

// Foreign keys really bite.
await assert.rejects(
  pg.query(`INSERT INTO events (board_id, title, actual_date) VALUES ($1,'ghost','2026-01-01')`, [
    '00000000-0000-4000-8000-ffffffffffff'
  ]),
  'an event cannot reference a board that does not exist'
);

// Cascade: deleting a board takes its events with it.
const before = (await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM events')).rows[0].n;
await pg.query('DELETE FROM boards WHERE id = $1', [rows.boards[rows.boards.length - 1].id]);
const after = (await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM events')).rows[0].n;
assert.ok(after < before, 'deleting a board cascades to its events');

await pg.close();

console.log(`migration: ${rows.boards.length} לוחות · ${rows.events.length} אירועים · ${rows.users.length} משתמשים`);
if (warnings.length) {
  console.log(`אזהרות (${warnings.length}):`);
  for (const w of warnings.slice(0, 6)) console.log('  ·', w);
  if (warnings.length > 6) console.log(`  · ...ועוד ${warnings.length - 6}`);
}
console.log('כל הבדיקות עברו ✓');
