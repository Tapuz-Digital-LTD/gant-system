// Exercises the real repository against a real Postgres running in-process.
// Run: npx tsx server/db/repo.test.ts
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { createRepo, ConflictError, ConflictExistsError, NotFoundError } from './repo.ts';
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

// ---------- milestones ----------
// A board of its own, so archiving below cannot reach it.
const msBoard = await repo.createBoard({ name: 'לוח אבני דרך', description: '' }, null);

const hanukkah = await repo.createEvent(
  msBoard.id,
  {
    title: 'מבצע חנוכה',
    category: 'campaign',
    actualDate: '2026-12-14',
    actualPrecision: 'day',
    prepMonths: 2,
    workStartDate: '2026-10-19',
    reviewDate: '2026-11-20',
    freezeDate: '2026-11-28',
    kickoffDate: '2026-12-06',
    announceDate: '2026-12-06',
    campaignEndDate: '2027-01-31'
  },
  null
);
assert.equal(hanukkah.workStartDate, '2026-10-19', 'an exact work start is stored as given');
assert.equal(hanukkah.announceDate, '2026-12-06');
assert.equal(hanukkah.campaignEndDate, '2027-01-31');
assert.notEqual(hanukkah.announceDate, hanukkah.kickoffDate === null, 'go-live and announcement stay separate fields');

// An event with no milestones keeps every one of them null. Nothing is invented.
const bare = await repo.createEvent(
  msBoard.id,
  { title: 'מתנת סוף שנה', category: 'campaign', actualDate: '2026-12-01', actualPrecision: 'month', prepMonths: 1 },
  null
);
assert.equal(bare.workStartDate, null, 'no work start is invented from prep months');
assert.equal(bare.campaignEndDate, null, 'no campaign end is invented from the event date');
assert.equal(bare.kickoffDate, null);

// Editing one milestone leaves the others alone.
const edited = await repo.updateEvent(hanukkah.id, hanukkah.version, { freezeDate: '2026-11-30' }, null);
assert.equal(edited.freezeDate, '2026-11-30');
assert.equal(edited.reviewDate, '2026-11-20', 'the other milestones survive an edit');
assert.equal(edited.workStartDate, '2026-10-19');

// Clearing a milestone is a real operation, not a no-op.
const cleared = await repo.updateEvent(edited.id, edited.version, { announceDate: null }, null);
assert.equal(cleared.announceDate, null, 'a milestone can be removed');
assert.equal(cleared.kickoffDate, '2026-12-06', 'clearing one does not clear its neighbour');

// The window must not hide an event just because its event date is elsewhere.
const janTail = await repo.listEvents(msBoard.id, '2027-01-01', '2027-01-31');
assert.ok(
  janTail.some((e) => e.id === hanukkah.id),
  'an event is still returned in a month reached only by its campaign tail'
);

const workStartMonth = await repo.listEvents(msBoard.id, '2026-10-01', '2026-10-31');
assert.ok(
  workStartMonth.some((e) => e.id === hanukkah.id),
  'the month the exact work start falls in returns the event'
);

const farOff = await repo.listEvents(msBoard.id, '2028-01-01', '2028-01-31');
assert.equal(farOff.length, 0, 'a range past every date still returns nothing');

// Duplicating a board must carry the milestones. Losing them here would be silent.
const copy = await repo.duplicateBoard(msBoard.id, 'לוח אבני דרך — עותק', null);
const copied = await repo.listEvents(copy.id, '2026-01-01', '2027-12-31');
const copiedHanukkah = copied.find((e) => e.title === 'מבצע חנוכה');
assert.ok(copiedHanukkah, 'the duplicated board has the event');
assert.equal(copiedHanukkah!.workStartDate, '2026-10-19', 'work start survives duplication');
assert.equal(copiedHanukkah!.reviewDate, '2026-11-20', 'review survives duplication');
assert.equal(copiedHanukkah!.freezeDate, '2026-11-30', 'freeze survives duplication');
assert.equal(copiedHanukkah!.kickoffDate, '2026-12-06', 'go-live survives duplication');
assert.equal(copiedHanukkah!.campaignEndDate, '2027-01-31', 'campaign end survives duplication');
const copiedBare = copied.find((e) => e.title === 'מתנת סוף שנה');
assert.equal(copiedBare?.announceDate, null, 'an empty milestone stays empty in the copy');

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

/*
 * Finishing a project: it leaves the active list, and it stops asking for
 * attention. Both halves matter — a board that disappears but keeps sending
 * reminders every morning is the worst of the two behaviours.
 */
{
  // Something for the milestone reminder to find: a go-live inside the window.
  const soon = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  const far = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
  const live = await repo.createEvent(
    board.id,
    { title: 'קמפיין פעיל', actualDate: far, kickoffDate: soon, prepMonths: 1 },
    null
  );

  const today = new Date().toISOString().slice(0, 10);
  assert.ok(
    (await repo.upcomingMilestones(null, today, far)).some((m) => m.eventId === live.id),
    'an active project has campaign dates worth mentioning'
  );

  // A notification already sitting in somebody's bell for this board.
  const [watcher] = (
    await pg.query<{ id: string }>(
      `insert into users (email, name, role, is_guest) values ('watcher@xtra.co.il', 'צופה', 'editor', false) returning id`
    )
  ).rows;

  await repo.notify({
    userId: watcher.id,
    kind: 'task_assigned',
    title: 'משימה בפרויקט הזה',
    body: null,
    link: `/b/${board.id}/calendar`,
    entity: 'task',
    entityId: live.id,
    dedupeKey: `board-archive-test:${live.id}`
  });
  assert.ok(
    (await repo.listNotifications(watcher.id)).items.some((n) => n.link?.includes(board.id)),
    'and it is in the bell'
  );

  await repo.archiveBoard(board.id, null);

  assert.ok(
    !(await repo.listBoards()).some((b) => b.id === board.id),
    'archived boards drop out of the active list'
  );
  assert.ok(
    (await repo.listBoards(null, true)).some((b) => b.id === board.id),
    'but they are findable on the archived shelf — otherwise "archive" means "destroy quietly"'
  );
  assert.deepEqual(
    (await repo.upcomingMilestones(null, today, far)).filter((m) => m.eventId === live.id),
    [],
    'a finished project stops sending campaign-date reminders'
  );
  assert.ok(
    !(await repo.listNotifications(watcher.id)).items.some((n) => n.link?.includes(board.id)),
    'and its outstanding notifications go with it, so restoring later does not dump a month of stale news'
  );

  await repo.restoreBoard(board.id, null);
  assert.ok(
    (await repo.listBoards()).some((b) => b.id === board.id),
    'restoring brings it back to the active list'
  );
  assert.ok(
    !(await repo.listNotifications(watcher.id)).items.some((n) => n.link?.includes(board.id)),
    'and nothing old is replayed — tomorrow\'s reminders are recomputed from the dates'
  );

  // Permanent deletion is only ever from the archive.
  await assert.rejects(() => repo.purgeBoard(board.id, null), /ארכיון/, 'an active project cannot be purged');
  await repo.archiveBoard(board.id, null);
}

// ---------- notifications: told once, and only when it is news ----------
const [dana] = (
  await pg.query<{ id: string }>(
    `insert into users (email, name, role, is_guest) values ('dana@xtra.co.il', 'דנה', 'editor', false) returning id`
  )
).rows;
const [yoni] = (
  await pg.query<{ id: string }>(
    `insert into users (email, name, role, is_guest) values ('yoni@xtra.co.il', 'יוני', 'editor', false) returning id`
  )
).rows;

const noticeBoard = await repo.createBoard({ name: 'לוח התראות', description: '' }, null);
const noticeEvent = await repo.createEvent(
  noticeBoard.id,
  { title: 'מבצע פסח', category: 'campaign', actualDate: '2027-04-01', prepMonths: 2 },
  null
);

// Handing work to somebody is news, and it carries where the work lives.
const handed = await repo.createTask(
  noticeEvent.id,
  { title: 'הכנת דיוור', assigneeId: dana.id, dueDate: '2027-03-20' },
  yoni.id
);
let inbox = await repo.listNotifications(dana.id);
assert.equal(inbox.unread, 1, 'the new owner is told');
assert.equal(inbox.items[0].kind, 'task_assigned');
assert.ok(inbox.items[0].title.includes('הכנת דיוור'), 'the notification names the task');
assert.ok(inbox.items[0].body?.includes('מבצע פסח'), 'and the campaign it belongs to');
assert.ok(inbox.items[0].body?.includes('20.03.2027'), 'and when it is due');
assert.ok(
  !inbox.items[0].body?.includes('לוח התראות'),
  'and not the board name, which pushed the deadline off the end of the line'
);
assert.ok((inbox.items[0].body ?? '').length < 60, 'the line is short enough to read in a dropdown');
assert.ok(inbox.items[0].link?.includes(noticeEvent.id), 'and links straight to it');

// Saving the task again, without touching the owner, says nothing.
const touched = await repo.updateTask(handed.id, handed.version, { dueDate: '2027-03-25' }, yoni.id);
await repo.updateTask(touched.id, touched.version, { status: 'in_progress' }, yoni.id);
inbox = await repo.listNotifications(dana.id);
assert.equal(inbox.items.length, 1, 'a save that left the owner alone is not news');

// The case that actually needs the check rather than the index.
//
// Once Dana throws the notification away the unique row is gone, so nothing in
// the database stops it being written again. Only "the owner did not change"
// does. Without it, every later save of this task would put the same news back
// in her inbox — which is precisely how people learn to ignore an inbox.
const toDismiss = (await repo.listNotifications(dana.id)).items[0];
await repo.deleteNotification(dana.id, toDismiss.id);
assert.equal((await repo.listNotifications(dana.id)).items.length, 0, 'she threw it away');

const afterDismiss = await repo.updateTask(touched.id, touched.version + 1, { dueDate: '2027-03-26' }, yoni.id);
assert.equal(
  (await repo.listNotifications(dana.id)).items.length,
  0,
  'editing the task does not put a dismissed notification back'
);

// And she is told again only when the task genuinely changes hands.
await repo.updateTask(afterDismiss.id, afterDismiss.version, { assigneeId: yoni.id }, dana.id);
const backToDana = await repo.updateTask(afterDismiss.id, afterDismiss.version + 1, { assigneeId: dana.id }, yoni.id);
assert.equal(
  (await repo.listNotifications(dana.id)).items.length,
  1,
  'handed back after she cleared it, she is told again'
);
assert.ok(backToDana.id);

// The other owner heard about it when it was briefly his, and only then.
assert.equal((await repo.listNotifications(yoni.id)).items.length, 1, 'the other owner was told once');

// Giving yourself a task is not news.
const own = await repo.createTask(noticeEvent.id, { title: 'משימה לעצמי', assigneeId: yoni.id }, yoni.id);
assert.ok(own.id);
assert.equal(
  (await repo.listNotifications(yoni.id)).items.length,
  1,
  'assigning work to yourself tells you nothing you did not know'
);

// A task with no owner tells nobody anything.
await repo.createTask(noticeEvent.id, { title: 'משימה ללא אחראי' }, yoni.id);
assert.equal((await repo.listNotifications(dana.id)).unread, 1);

// Reading and clearing are scoped to the person asking.
await repo.markNotificationsRead(dana.id);
assert.equal((await repo.listNotifications(dana.id)).unread, 0, 'marking read clears the count');
assert.equal((await repo.listNotifications(yoni.id)).unread, 1, "and does not touch anyone else's");

const mine = (await repo.listNotifications(dana.id)).items[0];
await repo.deleteNotification(yoni.id, mine.id);
assert.equal(
  (await repo.listNotifications(dana.id)).items.length,
  1,
  'one person cannot delete another person\'s notification'
);
await repo.deleteNotification(dana.id, mine.id);
assert.equal((await repo.listNotifications(dana.id)).items.length, 0, 'their own, they may throw away');

// ---------- permanent deletion ----------
// The archive is the only door: an event has to be in it before it can go.
const purgeBoard = await repo.createBoard({ name: 'לוח מחיקה', description: '' }, null);
const doomed = await repo.createEvent(
  purgeBoard.id,
  { title: 'אירוע שיימחק', category: 'campaign', actualDate: '2027-04-01', prepMonths: 1 },
  null
);
const doomedTask = await repo.createTask(doomed.id, { title: 'משימה שתלך איתו' }, null);
await repo.createComment(doomed.id, { body: 'תגובה שתלך איתו' }, null);

await assert.rejects(
  () => repo.purgeEvent(doomed.id, null),
  (e: unknown) => e instanceof ConflictExistsError,
  'an event that is not archived cannot be deleted for good'
);
assert.ok(await repo.getEvent(doomed.id), 'and it is still there after the refusal');

await repo.archiveEvent(doomed.id, null);
const purged = await repo.purgeEvent(doomed.id, null);
assert.equal(purged.title, 'אירוע שיימחק');
assert.equal(purged.taskCount, 1, 'the caller is told what went with it');

await assert.rejects(
  () => repo.getEvent(doomed.id),
  (e: unknown) => e instanceof NotFoundError,
  'the event is gone'
);
assert.equal(
  (await repo.listArchivedEvents(purgeBoard.id)).length,
  0,
  'and gone from the archive too'
);
assert.equal((await repo.listComments(doomed.id)).length, 0, 'its comments went with it');

// The audit trail is not a child of the event, so it outlives it. Who deleted
// what, and the whole row as it was, stay readable.
const purgeTrail = await repo.listActivity('event', doomed.id);
const purgeEntry = purgeTrail.find((a) => a.action === 'purged');
assert.ok(purgeEntry, 'the deletion is recorded');
assert.equal(
  (purgeEntry!.before as { title: string }).title,
  'אירוע שיימחק',
  'and the record still holds what was deleted'
);

await assert.rejects(
  () => repo.purgeEvent(doomed.id, null),
  (e: unknown) => e instanceof NotFoundError,
  'deleting it twice is a clear not-found, not a crash'
);

// A neighbour on the same board is untouched.
const survivor = await repo.createEvent(
  purgeBoard.id,
  { title: 'אירוע ששורד', category: 'campaign', actualDate: '2027-04-10', prepMonths: 1 },
  null
);
assert.ok(await repo.getEvent(survivor.id), 'the other event on that board is fine');
assert.ok(doomedTask.id, 'the task existed before the purge');

// ---------- audit trail ----------
const trail = await repo.listActivity('event', rosh.id);
const actions = trail.map((a) => a.action);
assert.ok(actions.includes('created'), 'creation is recorded');
assert.ok(actions.includes('updated'), 'updates are recorded');
assert.ok(actions.includes('archived'), 'archiving is recorded');
const update = trail.find((a) => a.action === 'updated');
assert.ok(update?.before && update?.after, 'the trail keeps both sides of a change');

/*
 * ---------- a campaign date is not everybody's news ----------
 *
 * Found by running the real job against production and reading what it sent:
 * eight people, eight identical emails about a go-live on an event none of
 * them were working on. A milestone reaches the people holding tasks on that
 * campaign, and the managers who asked for the wider view.
 */
{
  const { digestFor } = await import('../notifications/digest.ts');
  const { DEFAULT_PREFS, readPrefs } = await import('../notifications/prefs.ts');

  const [worker] = (
    await pg.query<{ id: string }>(
      `insert into users (email, name, role, is_guest) values ('worker@xtra.co.il', 'עובדת', 'editor', false) returning id`
    )
  ).rows;
  const [bystander] = (
    await pg.query<{ id: string }>(
      `insert into users (email, name, role, is_guest) values ('bystander@xtra.co.il', 'עובד אחר', 'editor', false) returning id`
    )
  ).rows;

  const soon = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const later = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  const campaignBoard = await repo.createBoard({ name: 'לוח קמפיינים' }, null);
  const campaign = await repo.createEvent(
    campaignBoard.id,
    { title: 'מבצע ראש השנה', actualDate: later, kickoffDate: soon, prepMonths: 1 },
    null
  );
  await repo.createTask(campaign.id, { title: 'הכנת באנרים', assigneeId: worker.id }, null);

  const today = new Date().toISOString().slice(0, 10);
  const forWorker = await digestFor(repo, { id: worker.id, isGuest: false }, DEFAULT_PREFS, today);
  const forBystander = await digestFor(repo, { id: bystander.id, isGuest: false }, DEFAULT_PREFS, today);

  assert.ok(
    forWorker.reminders.some((r) => r.kind === 'milestone_soon'),
    'the person doing the work is told the campaign date is coming'
  );
  assert.deepEqual(
    forBystander.reminders.filter((r) => r.kind === 'milestone_soon'),
    [],
    'somebody with no task on it is not — that is the flood this prevents'
  );

  const forManager = await digestFor(
    repo,
    { id: bystander.id, isGuest: false },
    readPrefs({ managerScope: 'all' }),
    today
  );
  assert.ok(
    forManager.reminders.some((r) => r.kind === 'milestone_soon'),
    'unless they asked for the wider view, which is what that setting is for'
  );
}

// ---------- what the assistant may cost in a day ----------
{
  const [spender] = (
    await pg.query<{ id: string }>(
      `insert into users (email, name, role, is_guest) values ('ai@xtra.co.il', 'משתמש AI', 'editor', false) returning id`
    )
  ).rows;

  // Three allowed, the fourth refused — and the refusal names which ceiling.
  for (let i = 1; i <= 3; i++) {
    const claim = await repo.claimAiCall(spender.id, 3, 100);
    assert.equal(claim.allowed, true, `call ${i} is within the daily allowance`);
  }
  const over = await repo.claimAiCall(spender.id, 3, 100);
  assert.equal(over.allowed, false, 'the fourth is not');
  assert.equal(over.reason, 'person', 'and it says which ceiling was hit');

  /*
   * The count is claimed before the model runs, so a refused call still counts.
   * A limit that forgives failures is a limit somebody retries past.
   */
  assert.equal((await repo.claimAiCall(spender.id, 3, 100)).used, 5, 'refused calls are still counted');

  // The workspace ceiling catches what the per-person one cannot: several
  // people each below their own limit, adding up to a bill nobody expected.
  const [other] = (
    await pg.query<{ id: string }>(
      `insert into users (email, name, role, is_guest) values ('ai2@xtra.co.il', 'משתמש AI ב', 'editor', false) returning id`
    )
  ).rows;
  const shared = await repo.claimAiCall(other.id, 100, 5);
  assert.equal(shared.allowed, false, 'somebody well inside their own allowance is still stopped');
  assert.equal(shared.reason, 'workspace');

  // Tokens come from the provider, so a spend question has an answer.
  await repo.recordAiTokens(spender.id, 1200, 800);
  await repo.recordAiTokens(spender.id, 300, 200);
  const [usage] = (
    await pg.query<{ input_tokens: string; output_tokens: string }>(
      `select input_tokens, output_tokens from ai_usage where user_id = $1`, [spender.id]
    )
  ).rows;
  assert.equal(Number(usage.input_tokens), 1500, 'token counts accumulate across calls');
  assert.equal(Number(usage.output_tokens), 1000);
}

await pg.close();
console.log('repo: כל הבדיקות עברו ✓');
