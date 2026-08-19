// Authorisation over real HTTP against real Postgres.
// Run: npx tsx server/access.test.ts
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { createApiRouter } from './api.ts';
import { createRepo } from './db/repo.ts';
import type { Database } from './db/client.ts';
import type { Actor } from './access.ts';
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

// ---- cast of characters ----
const [admin] = await db.insert(schema.users).values({ email: 'admin@xtra.co.il', name: 'מנהלת', role: 'admin', isGuest: false }).returning();
const [editor] = await db.insert(schema.users).values({ email: 'editor@xtra.co.il', name: 'עורך', role: 'editor', isGuest: false }).returning();
const [viewer] = await db.insert(schema.users).values({ email: 'viewer@xtra.co.il', name: 'צופה', role: 'viewer', isGuest: false }).returning();
const [guest] = await db.insert(schema.users).values({ email: 'agency@outside.com', name: 'סוכנות', role: 'editor', isGuest: true }).returning();

const toActor = (u: typeof admin): Actor => ({
  id: u.id, email: u.email, name: u.name, isGuest: u.isGuest, isOwner: u.isOwner, role: u.role
});

// The signed-in identity is chosen per request by a header, standing in for the cookie.
const ACTORS: Record<string, Actor> = {
  admin: toActor(admin),
  editor: toActor(editor),
  viewer: toActor(viewer),
  guest: toActor(guest)
};

const app = express();
app.use(express.json());
app.use(
  '/api',
  createApiRouter(
    () => repo,
    async (req) => ACTORS[String(req.headers['x-test-actor'] ?? '')] ?? null
  )
);
const server = app.listen(0);
const port = (server.address() as { port: number }).port;

async function call(as: string | null, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (as) headers['x-test-actor'] = as;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`http://127.0.0.1:${port}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

// ---- seed two boards; the guest is invited to only one ----
const openBoard = await repo.createBoard({ name: 'לוח הסושיאל' }, admin.id);
const secretBoard = await repo.createBoard({ name: 'לוח הנהלה' }, admin.id);
await repo.grantBoardAccess(openBoard.id, guest.id, 'editor');

const openEvent = await repo.createEvent(openBoard.id, { title: 'קמפיין', actualDate: '2027-05-01' }, admin.id);
const secretEvent = await repo.createEvent(secretBoard.id, { title: 'תקציב 2028', actualDate: '2027-05-01' }, admin.id);

// ================= signed out =================
assert.equal((await call(null, 'GET', '/boards')).status, 401, 'reading boards requires a session');
assert.equal((await call(null, 'GET', `/events/${openEvent.id}`)).status, 401);
assert.equal(
  (await call(null, 'POST', `/boards/${openBoard.id}/events`, { title: 'x', actualDate: '2027-01-01' })).status,
  401,
  'writing while signed out is refused'
);
assert.equal((await call(null, 'DELETE', `/events/${openEvent.id}`)).status, 401);
assert.equal((await call(null, 'GET', '/health')).status, 200, 'health stays public');

// ================= viewer: read yes, write no =================
assert.equal((await call('viewer', 'GET', '/boards')).status, 200);
let r = await call('viewer', 'POST', `/boards/${openBoard.id}/events`, { title: 'x', actualDate: '2027-01-01' });
assert.equal(r.status, 403, 'a viewer cannot create');
assert.equal(r.json.error.code, 'FORBIDDEN');
assert.equal((await call('viewer', 'DELETE', `/events/${openEvent.id}`)).status, 403);
assert.equal(
  (await call('viewer', 'PATCH', `/tasks/00000000-0000-4000-8000-000000000001`, { version: 1 })).status,
  403,
  'the role is checked before the row is even looked up'
);

// ================= editor: full access to every staff board =================
assert.equal((await call('editor', 'GET', '/boards')).json.data.length, 2, 'staff see every board');
r = await call('editor', 'POST', `/boards/${secretBoard.id}/events`, { title: 'חדש', actualDate: '2027-03-01' });
assert.equal(r.status, 201, 'staff may write to any board');

// ================= guest: scoped to the invited board =================
r = await call('guest', 'GET', '/boards');
assert.equal(r.status, 200);
assert.equal(r.json.data.length, 1, 'a guest sees only the board they were invited to');
assert.equal(r.json.data[0].id, openBoard.id);

assert.equal((await call('guest', 'GET', `/boards/${openBoard.id}/events?from=2027-01-01&to=2027-12-31`)).status, 200);

// The board they were never invited to must look absent, not protected.
r = await call('guest', 'GET', `/boards/${secretBoard.id}/events?from=2027-01-01&to=2027-12-31`);
assert.equal(r.status, 404, 'an uninvited board is 404, not 403');
assert.equal(r.json.error.code, 'NOT_FOUND');

// The IDOR that mattered: naming another board's event id directly.
r = await call('guest', 'GET', `/events/${secretEvent.id}`);
assert.equal(r.status, 404, 'a guest cannot read an event on a board they cannot see');
r = await call('guest', 'PATCH', `/events/${secretEvent.id}`, { title: 'נחטף', version: 1 });
assert.equal(r.status, 404, 'a guest cannot write to an event on a hidden board');
r = await call('guest', 'DELETE', `/events/${secretEvent.id}`);
assert.equal(r.status, 404, 'a guest cannot delete across boards');
r = await call('guest', 'POST', `/events/${secretEvent.id}/comments`, { body: 'שלום' });
assert.equal(r.status, 404, 'a guest cannot comment across boards');

// Nothing changed on the hidden board.
r = await call('admin', 'GET', `/events/${secretEvent.id}`);
assert.equal(r.json.data.title, 'תקציב 2028', 'the hidden event is untouched');

// Guests may work inside their own board.
r = await call('guest', 'POST', `/boards/${openBoard.id}/events`, { title: 'של הסוכנות', actualDate: '2027-06-01' });
assert.equal(r.status, 201, 'a guest editor can create on their own board');

// ...but never own the container.
assert.equal((await call('guest', 'POST', '/boards', { name: 'לוח משלי' })).status, 403);
assert.equal((await call('guest', 'DELETE', `/boards/${openBoard.id}`)).status, 403);

// A read-only guest really is read-only.
await repo.grantBoardAccess(openBoard.id, guest.id, 'viewer');
r = await call('guest', 'POST', `/boards/${openBoard.id}/events`, { title: 'לא אמור לעבור', actualDate: '2027-06-01' });
assert.equal(r.status, 403, 'a viewer-level board grant blocks writes');
assert.equal((await call('guest', 'GET', `/boards/${openBoard.id}/events?from=2027-01-01&to=2027-12-31`)).status, 200, 'but reading still works');

// ================= people management =================
r = await call('editor', 'GET', '/people');
assert.equal(r.status, 403, 'only admins may see the people list');
r = await call('admin', 'GET', '/people');
assert.equal(r.status, 200);
const before = r.json.data.length;

r = await call('admin', 'POST', '/people', { email: 'NEW@Xtra.co.il', name: 'חדשה', role: 'editor' });
assert.equal(r.status, 201);
assert.equal(r.json.data.email, 'new@xtra.co.il', 'the email is normalised to lower case');
const added = r.json.data.id;

r = await call('admin', 'POST', '/people', { email: 'new@xtra.co.il' });
assert.equal(r.status, 409, 'a duplicate email is refused');
assert.equal(r.json.error.code, 'ALREADY_EXISTS');

r = await call('admin', 'POST', '/people', { email: 'not-an-email' });
assert.equal(r.status, 400, 'a malformed email is refused');

assert.equal((await call('editor', 'PATCH', `/people/${added}`, { role: 'admin' })).status, 403);
assert.equal((await call('admin', 'PATCH', `/people/${added}`, { role: 'viewer' })).status, 200);

// The last admin must not be able to strip their own admin rights.
r = await call('admin', 'PATCH', `/people/${ACTORS.admin.id}`, { role: 'editor' });
assert.equal(r.status, 403, 'the final admin cannot demote themselves');

assert.equal((await call('admin', 'DELETE', `/people/${ACTORS.admin.id}`)).status, 403, 'nobody can remove themselves');
assert.equal((await call('admin', 'DELETE', `/people/${added}`)).status, 204);
assert.equal((await call('admin', 'GET', '/people')).json.data.length, before, 'removed people drop out of the list');

// ================= granting a board to a guest =================
r = await call('admin', 'POST', `/boards/${secretBoard.id}/members`, { userId: guest.id, role: 'viewer' });
assert.equal(r.status, 204);
r = await call('guest', 'GET', `/boards/${secretBoard.id}/events?from=2027-01-01&to=2027-12-31`);
assert.equal(r.status, 200, 'a granted board becomes visible to the guest');

r = await call('admin', 'DELETE', `/boards/${secretBoard.id}/members/${guest.id}`);
assert.equal(r.status, 204);
r = await call('guest', 'GET', `/boards/${secretBoard.id}/events?from=2027-01-01&to=2027-12-31`);
assert.equal(r.status, 404, 'revoking access hides the board again');

assert.equal(
  (await call('editor', 'POST', `/boards/${openBoard.id}/members`, { userId: guest.id, role: 'viewer' })).status,
  403,
  'granting board access is an admin action'
);

// ================= duplication =================
r = await call('admin', 'POST', `/boards/${openBoard.id}/duplicate`, { name: 'עותק לבדיקה' });
assert.equal(r.status, 201);
assert.equal(r.json.data.name, 'עותק לבדיקה');
const copyId = r.json.data.id;
const originals = (await call('admin', 'GET', `/boards/${openBoard.id}/events?from=2027-01-01&to=2027-12-31`)).json.data.length;
const copies = (await call('admin', 'GET', `/boards/${copyId}/events?from=2027-01-01&to=2027-12-31`)).json.data.length;
assert.equal(copies, originals, 'the copy carries the same events');
assert.equal((await call('guest', 'POST', `/boards/${openBoard.id}/duplicate`, {})).status, 403);

// ================= the permission matrix =================
r = await call('editor', 'GET', '/permissions');
assert.equal(r.status, 403, 'only those with permissions.manage may read the matrix');
r = await call('admin', 'GET', '/permissions');
assert.equal(r.status, 200);
assert.ok(r.json.data.catalog.length > 10, 'the capability catalog is returned');
assert.equal(r.json.data.matrix.viewer['event.create'], false, 'defaults: a viewer cannot create');
assert.equal(r.json.data.matrix.editor['event.create'], true, 'defaults: an editor can');

// Turning a capability off must actually stop the action.
assert.equal(
  (await call('admin', 'PATCH', '/permissions', { role: 'editor', permission: 'event.create', allowed: false })).status,
  200
);
r = await call('editor', 'POST', `/boards/${openBoard.id}/events`, { title: 'לא אמור לעבור', actualDate: '2027-04-01' });
assert.equal(r.status, 403, 'unticking event.create blocks the editor immediately');

// ...and turning it back on must restore it.
await call('admin', 'PATCH', '/permissions', { role: 'editor', permission: 'event.create', allowed: true });
r = await call('editor', 'POST', `/boards/${openBoard.id}/events`, { title: 'עכשיו כן', actualDate: '2027-04-01' });
assert.equal(r.status, 201, 'ticking it back restores the action');

// Granting a viewer a capability really grants it.
await call('admin', 'PATCH', '/permissions', { role: 'viewer', permission: 'comment.create', allowed: true });
r = await call('viewer', 'POST', `/events/${openEvent.id}/comments`, { body: 'שלום' });
assert.equal(r.status, 201, 'a viewer given comment.create may comment');
await call('admin', 'PATCH', '/permissions', { role: 'viewer', permission: 'comment.create', allowed: false });
assert.equal(
  (await call('viewer', 'POST', `/events/${openEvent.id}/comments`, { body: 'שוב' })).status,
  403,
  'removing it takes the ability away again'
);

// The lock that stops an admin sawing off the branch they sit on.
r = await call('admin', 'PATCH', '/permissions', {
  role: 'admin',
  permission: 'permissions.manage',
  allowed: false
});
assert.equal(r.status, 403, 'admins cannot remove their own access to this screen');

// ================= the owner is untouchable =================
await db.update(schema.users).set({ isOwner: true }).where(eq(schema.users.id, viewer.id));
ACTORS.viewer.isOwner = true;

// A viewer who owns the workspace bypasses the matrix entirely.
r = await call('viewer', 'POST', `/boards/${openBoard.id}/events`, { title: 'הבעלים תמיד יכול', actualDate: '2027-04-02' });
assert.equal(r.status, 201, 'the owner is never blocked by a permission');

assert.equal(
  (await call('admin', 'DELETE', `/people/${viewer.id}`)).status,
  403,
  'nobody can remove the owner'
);
assert.equal(
  (await call('admin', 'PATCH', `/people/${viewer.id}`, { role: 'viewer' })).status,
  403,
  'nobody can change the owner role'
);

await db.update(schema.users).set({ isOwner: false }).where(eq(schema.users.id, viewer.id));
ACTORS.viewer.isOwner = false;

// ================= the UI must be told what it may do =================
r = await call('admin', 'GET', '/me');
assert.ok(Array.isArray(r.json.data.permissions), '/me carries the resolved capability list');
assert.ok(r.json.data.permissions.includes('people.manage'), 'an admin gets people.manage');

r = await call('viewer', 'GET', '/me');
assert.ok(!r.json.data.permissions.includes('event.create'), 'a viewer is not told they may create');
assert.ok(r.json.data.permissions.includes('export.run'), 'but is told they may export');

// Switching a capability off changes what the UI is told, not just what the API allows.
await call('admin', 'PATCH', '/permissions', { role: 'editor', permission: 'board.duplicate', allowed: false });
r = await call('editor', 'GET', '/me');
assert.ok(
  !r.json.data.permissions.includes('board.duplicate'),
  'unticking a box removes the capability from the list the UI hides buttons with'
);
await call('admin', 'PATCH', '/permissions', { role: 'editor', permission: 'board.duplicate', allowed: true });

// ================= identity endpoint =================
r = await call('admin', 'GET', '/me');
assert.equal(r.json.data.email, 'admin@xtra.co.il');
assert.equal((await call(null, 'GET', '/me')).json.data, null, 'signed out means no identity');

server.close();
await pg.close();
console.log('access: כל הבדיקות עברו ✓');
