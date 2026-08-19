// Drives the real Express app over real HTTP against a real Postgres (PGlite).
// Run: npx tsx server/api.test.ts
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { createApiRouter } from './api.ts';
import { createRepo } from './db/repo.ts';
import type { Database } from './db/client.ts';
import * as schema from './db/schema.ts';

const pg = new PGlite();
const dir = new URL('./db/migrations/', import.meta.url);
for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  for (const stmt of readFileSync(new URL(file, dir), 'utf-8').split('--> statement-breakpoint')) {
    const s = stmt.trim();
    if (s) await pg.exec(s);
  }
}
const db = drizzle(pg, { schema }) as unknown as Database;
const repo = createRepo(db);

// This suite is about the API contract, not authorisation — access rules have
// their own suite. Every request here runs as a signed-in staff editor.
const [staff] = await db
  .insert(schema.users)
  .values({ email: 'tester@xtra.co.il', name: 'בודק', role: 'editor', isGuest: false })
  .returning();
const actor = { id: staff.id, email: staff.email, name: staff.name, isGuest: false, isOwner: true, role: 'editor' as const };

const app = express();
app.use(express.json());
app.use('/api', createApiRouter(() => repo, async () => actor));
const server = app.listen(0);
const port = (server.address() as { port: number }).port;
const base = `http://127.0.0.1:${port}/api`;

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

// ---------- health ----------
assert.equal((await call('GET', '/health')).status, 200);

// ---------- validation rejects bad input ----------
let r = await call('POST', '/boards', {});
assert.equal(r.status, 400, 'a board with no name is rejected');
assert.equal(r.json.error.code, 'VALIDATION_FAILED');
assert.ok(Array.isArray(r.json.error.details), 'the client is told which field failed');

// ---------- create ----------
r = await call('POST', '/boards', { name: 'לוח בדיקה', description: 'תיאור' });
assert.equal(r.status, 201);
const boardId: string = r.json.data.id;

r = await call('GET', '/boards');
assert.equal(r.json.data.length, 1);
assert.equal(r.json.data[0].eventCount, 0);

// ---------- mass assignment is closed ----------
r = await call('POST', '/boards/' + boardId + '/events', {
  title: 'ראש השנה',
  actualDate: '2027-10-02',
  prepMonths: 4,
  // none of these may reach the row
  id: '11111111-1111-4111-8111-111111111111',
  version: 999,
  boardId: '22222222-2222-4222-8222-222222222222',
  archivedAt: '2020-01-01'
});
assert.equal(r.status, 201);
const event = r.json.data;
assert.notEqual(event.id, '11111111-1111-4111-8111-111111111111', 'a client-supplied id is ignored');
assert.equal(event.version, 1, 'a client-supplied version is ignored');
assert.equal(event.boardId, boardId, 'the board comes from the URL, not the body');
assert.equal(event.archivedAt, null, 'a client cannot pre-archive a row');

// ---------- date rules are enforced server-side ----------
r = await call('POST', `/boards/${boardId}/events`, { title: 'x', actualDate: '2027-02-30' });
assert.equal(r.status, 400, 'a date that does not exist in the calendar is rejected');

r = await call('POST', `/boards/${boardId}/events`, {
  title: 'x',
  actualDate: '2027-01-01',
  kickoffDate: '2027-06-01'
});
assert.equal(r.status, 400, 'kickoff after the actual date is rejected');

r = await call('POST', `/boards/${boardId}/events`, { title: 'x', actualDate: '2027-01-01', prepMonths: 99 });
assert.equal(r.status, 400, 'prepMonths outside 0..12 is rejected');

// ---------- the windowed read ----------
r = await call('GET', `/boards/${boardId}/events`);
assert.equal(r.status, 400, 'the range is required — no accidental full-table reads');

r = await call('GET', `/boards/${boardId}/events?from=2027-06-01&to=2027-06-30`);
assert.equal(r.status, 200);
assert.equal(r.json.data.length, 1, 'the prep window pulls the event into June');

r = await call('GET', `/boards/${boardId}/events?from=2027-06-30&to=2027-06-01`);
assert.equal(r.status, 400, 'an inverted range is rejected');

// ---------- optimistic locking over HTTP ----------
r = await call('PATCH', `/events/${event.id}`, { title: 'ראש השנה 5788', version: 1 });
assert.equal(r.status, 200);
assert.equal(r.json.data.version, 2);

r = await call('PATCH', `/events/${event.id}`, { title: 'כתיבה מיושנת', version: 1 });
assert.equal(r.status, 409, 'a stale write is refused');
assert.equal(r.json.error.code, 'STALE_VERSION');
assert.equal(r.json.error.currentVersion, 2, 'the client is told the version it must refetch');

r = await call('GET', `/events/${event.id}`);
assert.equal(r.json.data.title, 'ראש השנה 5788', 'the refused write changed nothing');

// ---------- tasks ----------
r = await call('POST', `/events/${event.id}/tasks`, { title: 'עיצוב באנרים', dueDate: '2027-09-01' });
assert.equal(r.status, 201);
const task = r.json.data;
assert.equal(task.completedAt, null);

r = await call('PATCH', `/tasks/${task.id}`, { status: 'done', version: task.version, completedAt: '1999-01-01' });
assert.equal(r.status, 200);
assert.ok(r.json.data.completedAt, 'completedAt is derived on the server');
assert.ok(!r.json.data.completedAt.startsWith('1999'), 'a client-supplied completedAt is ignored');

// ---------- comments no longer need a task ----------
r = await call('POST', `/events/${event.id}/comments`, { body: 'דורש אישור מנכ״ל' });
assert.equal(r.status, 201);
assert.equal(r.json.data.taskId, null);
r = await call('GET', `/events/${event.id}/comments`);
assert.equal(r.json.data.length, 1);

// ---------- not found & bad ids ----------
assert.equal((await call('GET', '/events/00000000-0000-4000-8000-000000000000')).status, 404);
assert.equal((await call('GET', '/events/not-a-uuid')).status, 400, 'a malformed id is a 400, not a 500');
assert.equal((await call('GET', '/nope')).status, 404);

// ---------- no internal detail leaks ----------
r = await call('GET', '/events/not-a-uuid');
const body = JSON.stringify(r.json);
assert.ok(!body.includes('/Users/'), 'no filesystem paths in responses');
assert.ok(!body.includes('at '), 'no stack frames in responses');

// ---------- activity trail is queryable ----------
r = await call('GET', `/events/${event.id}/activity`);
assert.ok(r.json.data.length >= 2, 'creation and update are both recorded');

// ---------- archive removes it from reads ----------
assert.equal((await call('DELETE', `/events/${event.id}`)).status, 204);
r = await call('GET', `/boards/${boardId}/events?from=2027-01-01&to=2027-12-31`);
assert.equal(r.json.data.length, 0, 'archived events disappear from the timeline');

server.close();
await pg.close();
console.log('api: כל הבדיקות עברו ✓');
