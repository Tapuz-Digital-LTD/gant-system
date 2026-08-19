// Exercises the real repository against a real Postgres running in-process.
// Run: npx tsx server/db/repo.test.ts
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { createRepo, ConflictError, NotFoundError } from './repo.ts';
import type { Database } from './client.ts';
import * as schema from './schema.ts';

const pg = new PGlite();
const dir = new URL('./migrations/', import.meta.url);
for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  for (const stmt of readFileSync(new URL(file, dir), 'utf-8').split('--> statement-breakpoint')) {
    const s = stmt.trim();
    if (s) await pg.exec(s);
  }
}

const repo = createRepo(drizzle(pg, { schema }) as unknown as Database);

// ---------- boards ----------
const board = await repo.createBoard({ name: 'גאנט 2027', description: 'בדיקה' }, null);
assert.ok(board.id, 'board created with an id');

let boards = await repo.listBoards();
assert.equal(boards.length, 1);
assert.equal(boards[0].eventCount, 0, 'event count starts at zero');

// ---------- events ----------
const rosh = await repo.createEvent(
  board.id,
  {
    title: 'ראש השנה',
    category: 'holiday',
    kickoffDate: '2027-08-15',
    actualDate: '2027-10-02',
    actualPrecision: 'day',
    prepMonths: 4
  },
  null
);
assert.equal(rosh.version, 1, 'a new event starts at version 1');

await repo.createEvent(
  board.id,
  { title: 'קמפיין קיץ', category: 'campaign', actualDate: '2027-07-01', actualPrecision: 'month', prepMonths: 1 },
  null
);

boards = await repo.listBoards();
assert.equal(boards[0].eventCount, 2, 'event count reflects inserts');

// ---------- the windowed read ----------
// Rosh Hashana happens in October, but with 4 prep months its work window opens
// in June. Asking for June must return it — that is the whole point of the window.
const june = await repo.listEvents(board.id, '2027-06-01', '2027-06-30');
assert.ok(
  june.some((e) => e.title === 'ראש השנה'),
  'an event whose prep window overlaps the range is included'
);

const january = await repo.listEvents(board.id, '2027-01-01', '2027-01-31');
assert.equal(january.length, 0, 'a range outside every work window returns nothing');

const october = await repo.listEvents(board.id, '2027-10-01', '2027-10-31');
assert.equal(october.length, 1, 'the month of the actual date returns the event');
assert.deepEqual(october[0].tasks, [], 'events come back with their task list attached');

// ---------- optimistic locking ----------
const bumped = await repo.updateEvent(rosh.id, rosh.version, { title: 'ראש השנה 5788' }, null);
assert.equal(bumped.version, 2, 'a successful write bumps the version');
assert.equal(bumped.title, 'ראש השנה 5788');

await assert.rejects(
  () => repo.updateEvent(rosh.id, 1, { title: 'כתיבה מיושנת' }, null),
  (e: unknown) => e instanceof ConflictError,
  'a stale version is rejected instead of silently overwriting'
);

const untouched = await repo.getEvent(rosh.id);
assert.equal(untouched.title, 'ראש השנה 5788', 'the rejected write changed nothing');

// ---------- tasks ----------
const t1 = await repo.createTask(rosh.id, { title: 'עיצוב באנרים', dueDate: '2027-09-01' }, null);
const t2 = await repo.createTask(rosh.id, { title: 'טעינת שוברים' }, null);
assert.equal(t1.position, 0);
assert.equal(t2.position, 1, 'positions are assigned in order');
assert.equal(t1.completedAt, null, 'a new task is not complete');

const done = await repo.updateTask(t1.id, t1.version, { status: 'done' }, null);
assert.ok(done.completedAt, 'completedAt is derived from status, not sent by the client');

const reopened = await repo.updateTask(done.id, done.version, { status: 'todo' }, null);
assert.equal(reopened.completedAt, null, 'reopening clears completedAt');

await assert.rejects(
  () => repo.updateTask(t2.id, 99, { title: 'x' }, null),
  (e: unknown) => e instanceof ConflictError
);

const withTasks = await repo.listEvents(board.id, '2027-10-01', '2027-10-31');
assert.equal(withTasks[0].tasks.length, 2, 'tasks are attached to their event');

// ---------- comments are first-class ----------
const c = await repo.createComment(rosh.id, { body: 'צריך אישור מנכ״ל' }, null);
assert.equal(c.eventId, rosh.id);
assert.equal(c.taskId, null, 'a comment can belong to the event with no task at all');
const commentList = await repo.listComments(rosh.id);
assert.equal(commentList.length, 1, 'comments are readable without touching tasks[0]');

// ---------- not found ----------
await assert.rejects(
  () => repo.getEvent('00000000-0000-4000-8000-000000000000'),
  (e: unknown) => e instanceof NotFoundError
);
await assert.rejects(
  () => repo.createEvent('00000000-0000-4000-8000-000000000000', { title: 'x', actualDate: '2027-01-01' }, null),
  (e: unknown) => e instanceof NotFoundError,
  'cannot create an event on a board that does not exist'
);

// ---------- soft delete ----------
await repo.archiveEvent(t1.eventId, null);
assert.equal((await repo.listEvents(board.id, '2027-01-01', '2027-12-31')).length, 1, 'archived events drop out of reads');

await repo.archiveBoard(board.id, null);
assert.equal((await repo.listBoards()).length, 0, 'archived boards drop out of reads');

// ---------- audit trail ----------
const trail = await repo.listActivity('event', rosh.id);
const actions = trail.map((a) => a.action);
assert.ok(actions.includes('created'), 'creation is recorded');
assert.ok(actions.includes('updated'), 'updates are recorded');
assert.ok(actions.includes('archived'), 'archiving is recorded');
const update = trail.find((a) => a.action === 'updated');
assert.ok(update?.before && update?.after, 'the trail keeps both sides of a change');

await pg.close();
console.log('repo: כל הבדיקות עברו ✓');
