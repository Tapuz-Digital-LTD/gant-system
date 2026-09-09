// Drives the real Express app over real HTTP against a real Postgres (PGlite).
// Run: npx tsx server/api.test.ts
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { createApiRouter } from './api.ts';
import { israelNow } from './notifications/prefs.ts';
import { createRepo } from './db/repo.ts';
import { loadActor } from './access.ts';
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
/*
 * Resolved from the database on every request, exactly as production does.
 *
 * A frozen object here would pass tests that production fails: anything the
 * actor carries — the phone number, the role — would be whatever it was when
 * the suite started, and a change made through the API would appear not to
 * have happened.
 */
app.use('/api', createApiRouter(() => repo, async () => (await loadActor(db, staff.id)) ?? actor));
const server = app.listen(0);
const port = (server.address() as { port: number }).port;
const base = `http://127.0.0.1:${port}/api`;

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(base + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json', ...headers } : headers,
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

/*
 * ---------- the assistant answers, even when it fails ----------
 *
 * This endpoint hung in production for every single call. `req.repo` was never
 * attached — the database middleware skipped /ai deliberately, back when the
 * route touched no data — and the resulting throw became an unhandled
 * rejection, so no response was ever written and the button spun forever.
 *
 * Two things are pinned here: the route reaches the database, and a failure
 * arrives as a reply rather than as silence.
 */
{
  assert.equal(
    (await call('POST', '/ai/suggest-tasks', { eventTitle: 'מבצע' })).status,
    503,
    'with no key configured it says so, promptly'
  );

  process.env.ANTHROPIC_API_KEY = 'sk-ant-not-a-real-key';
  r = await call('POST', '/ai/suggest-tasks', { eventTitle: 'מבצע חנוכה', category: 'campaign' });
  delete process.env.ANTHROPIC_API_KEY;

  // A bad key means the model call fails — which is the point: it got past the
  // usage check, so `req.repo` was there, and it answered instead of hanging.
  assert.equal(r.status, 502, 'a failing model call is a reply, not a hang');
  assert.equal(r.json.aiGenerated, false);

  const { rows } = await pg.query<{ calls: number }>('select calls from ai_usage');
  assert.equal(rows.length, 1, 'and the attempt was counted');
  assert.equal(Number(rows[0].calls), 1, 'a failed call still spends the allowance');

  assert.equal(
    (await call('POST', '/ai/suggest-tasks', {})).status,
    400,
    'and bad input is still bad input'
  );
}

// ---------- a phone number is your own, and is normalised ----------
{
  r = await call('PUT', '/my/phone', { phone: '052-577-0223' });
  assert.equal(r.json.data.phone, '0525770223', 'stored one way, however it was typed');
  assert.equal((await call('GET', '/me')).json.data.phone, '0525770223');

  r = await call('PUT', '/my/phone', { phone: '03-6234567' });
  assert.equal(r.status, 400, 'a landline cannot receive an SMS, and saying so beats silence later');
  assert.equal(r.json.error.code, 'INVALID_PHONE');
  assert.equal((await call('GET', '/me')).json.data.phone, '0525770223', 'and the good number survives the bad one');

  r = await call('PUT', '/my/phone', { phone: '' });
  assert.equal(r.json.data.phone, null, 'taking your number back out is a save, not a delete');
}

// ---------- the daily digest job sends nothing ----------
{
  // Work that is actually late, on this person's plate, so there is something
  // to say at all. Yesterday in Israel, whatever the machine's clock is set to.
  const now = israelNow();
  const [y, m, d] = now.date.split('-').map(Number);
  const yesterday = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  r = await call('POST', `/events/${event.id}/tasks`, { title: 'משימה באיחור', dueDate: yesterday });
  await call('PATCH', `/tasks/${r.json.data.id}`, {
    assigneeId: staff.id,
    version: r.json.data.version
  });

  // An open endpoint that walks everybody's work is not a default.
  delete process.env.CRON_SECRET;
  assert.equal((await call('GET', '/cron/digest')).status, 503, 'no secret configured means the job will not run');

  process.env.CRON_SECRET = 'test-secret';
  assert.equal((await call('GET', '/cron/digest')).status, 401, 'and no secret supplied is not the scheduler');
  assert.equal(
    (await call('GET', '/cron/digest', undefined, { authorization: 'Bearer test-secre' })).status,
    401,
    'a prefix of the secret is not the secret'
  );

  /*
   * Not this person's hour — so no email is due. The bell is filled anyway:
   * in-app interrupts nobody, and making somebody wait until 08:00 to learn a
   * task went overdue is withholding it for no reason.
   */
  await call('PUT', '/my/notification-prefs', { digestHour: (now.hour + 3) % 24, digestDays: [0, 1, 2, 3, 4, 5, 6] });
  r = await call('GET', '/cron/digest', undefined, { authorization: 'Bearer test-secret' });
  assert.equal(r.status, 200);
  assert.equal(r.json.data.considered, 1);
  assert.equal(r.json.data.due, 0, 'the hour is the setting, so the wrong hour is nobody');
  assert.equal(r.json.data.toBell, 1, 'but the overdue task still reached the bell');

  const bell = (await call('GET', '/notifications')).json.data.items;
  assert.ok(
    bell.some((n: { kind: string; title: string }) => n.kind === 'task_overdue' && n.title.includes('משימה באיחור')),
    'and it is the reminder itself, not a summary of one'
  );

  // Said once. Running the job again an hour later must not repeat it.
  r = await call('GET', '/cron/digest', undefined, { authorization: 'Bearer test-secret' });
  assert.equal(r.json.data.toBell, 0, 'a reminder is news once, not once an hour');

  // Their hour: one digest — into the log, and nowhere else.
  await call('PUT', '/my/notification-prefs', { digestHour: now.hour, digestDays: [0, 1, 2, 3, 4, 5, 6] });
  const lines: string[] = [];
  const realLog = console.log;
  console.log = (line: string) => void lines.push(String(line));
  r = await call('GET', '/cron/digest', undefined, { authorization: 'Bearer test-secret' });
  console.log = realLog;

  assert.equal(r.json.data.due, 1);
  assert.equal(r.json.data.logged, 1, 'a person with late work gets a digest');
  assert.notEqual(r.json.data.mode, 'send', 'no credentials here, so nothing could go out anyway');
  assert.equal(r.json.data.sent, 0, 'and nothing did');
  assert.ok(!JSON.stringify(r.json).includes('משימה באיחור'), 'the response is a receipt, not a mailbox');

  const logged = lines.map((l) => JSON.parse(l)).find((l) => l.msg === 'digest');
  assert.ok(logged, 'the digest itself goes to the log');
  assert.ok(logged.text.includes('משימה באיחור'), 'and it is the real text, in full');
  assert.ok(logged.text.includes('דורש טיפול'), 'grouped by what it needs from the reader');

  // Nothing to say is not a message. Switch every rule off and the same person,
  // in the same hour, gets nothing at all.
  await call('PUT', '/my/notification-prefs', {
    digestHour: now.hour,
    digestDays: [0, 1, 2, 3, 4, 5, 6],
    overdue: false,
    dueBeforeDays: 0,
    stalledAfterDays: 0,
    milestoneBeforeDays: 0
  });
  // Today's digest is already marked handled by the runs above, so the job
  // would skip this person entirely. Clearing the mark makes them due again,
  // which is what this assertion is actually about.
  await pg.query('update notification_prefs set last_digest_on = null');

  r = await call('GET', '/cron/digest', undefined, { authorization: 'Bearer test-secret' });
  assert.equal(r.json.data.due, 1, 'still their hour');
  assert.equal(r.json.data.logged, 0, 'but every rule off is nothing worth saying, and nothing sent');



  delete process.env.CRON_SECRET;
}

// ---------- archive removes it from reads ----------
assert.equal((await call('DELETE', `/events/${event.id}`)).status, 204);
r = await call('GET', `/boards/${boardId}/events?from=2027-01-01&to=2027-12-31`);
assert.equal(r.json.data.length, 0, 'archived events disappear from the timeline');

server.close();
await pg.close();
console.log('api: כל הבדיקות עברו ✓');
