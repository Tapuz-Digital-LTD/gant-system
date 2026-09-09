// Run: npx tsx src/utils/routes.test.ts
import assert from 'node:assert/strict';
import { buildRoute, parseRoute, boardRoute } from './routes.ts';
import { todayISO } from './period.ts';

const B = '11111111-2222-4333-8444-555555555555';

// ---------- the home screen ----------
{
  const r = parseRoute('/');
  assert.equal(r.boardId, null);
  assert.equal(r.view, null);
  assert.equal(r.eventId, null);
  assert.equal(r.creating, false);
  assert.equal(buildRoute(r), '/', 'home builds back to home');
}

// ---------- a board with no view chosen yet ----------
{
  const r = parseRoute(`/b/${B}`);
  assert.equal(r.boardId, B);
  assert.equal(r.view, null, 'the hub is a board with no view');
  assert.equal(buildRoute(r), `/b/${B}`);
}

// ---------- a view, a period, and back again ----------
{
  const url = `/b/${B}/calendar?d=2026-09-06&m=week`;
  const r = parseRoute(url);
  assert.equal(r.view, 'calendar');
  assert.equal(r.period.mode, 'week');
  assert.equal(r.period.anchor, '2026-09-06');
  assert.equal(buildRoute(r), url, 'a link round-trips exactly');
}

{
  const url = `/b/${B}/timeline?d=2027-01-01`;
  const r = parseRoute(url);
  assert.equal(r.view, 'timeline');
  assert.equal(r.period.mode, 'month', 'month is the default and is left out of the address');
  assert.equal(buildRoute(r), url);
}

// ---------- an open event is part of the address ----------
{
  const E = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const url = `/b/${B}/calendar?d=2026-12-01&e=${E}`;
  const r = parseRoute(url);
  assert.equal(r.eventId, E, 'a link can open straight onto one event');
  assert.equal(buildRoute(r), url);

  const closed = buildRoute({ ...r, eventId: null });
  assert.equal(closed, `/b/${B}/calendar?d=2026-12-01`, 'closing the event leaves the place intact');
}

// ---------- the new-event steps ----------
{
  const r = parseRoute(`/b/${B}/calendar?d=2026-09-01&new=1`);
  assert.equal(r.creating, true, 'a half-finished form is somewhere you can be linked to');
  assert.equal(buildRoute({ ...r, creating: false }), `/b/${B}/calendar?d=2026-09-01`);
}

// ---------- rubbish in the address is not an error screen ----------
{
  const r = parseRoute(`/b/${B}/nonsense?d=not-a-date&m=fortnight`);
  assert.equal(r.view, null, 'an unknown view falls back to the hub rather than crashing');
  assert.equal(r.period.anchor, todayISO(), 'an unreadable day falls back to today');
  assert.equal(r.period.mode, 'month', 'an unknown mode falls back to month');
}

// ---------- views without a period do not carry one ----------
{
  const r = parseRoute(`/b/${B}/list?d=2026-09-06`);
  assert.equal(
    buildRoute(r),
    `/b/${B}/list`,
    'the list is not a period view, so the address stays clean'
  );
}

// ---------- the shortcut for opening a board ----------
{
  assert.equal(boardRoute(B), `/b/${B}`);
  assert.ok(boardRoute(B, 'calendar').startsWith(`/b/${B}/calendar?d=${todayISO()}`), 'a board opens on today');
  assert.ok(boardRoute(B, 'calendar', 'week').includes('m=week'));
}

console.log('routes: כל הבדיקות עברו ✓');
