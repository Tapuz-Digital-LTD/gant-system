// Run: npx tsx server/notifications/reminders.test.ts
//
// The rules that decide whether people keep notifications switched on. Every
// one of them is an argument about when NOT to say something.
import assert from 'node:assert/strict';
import { DEFAULT_PREFS, isDigestDue, readPrefs, israelNow } from './prefs.ts';
import { buildDigest, remindersForMilestones, remindersForTasks } from './reminders.ts';
import type { ReminderMilestone, ReminderTask } from './reminders.ts';

const TODAY = '2026-09-09';

const task = (over: Partial<ReminderTask> = {}): ReminderTask => ({
  id: 't1',
  title: 'הכנת דיוור',
  status: 'todo',
  dueDate: null,
  assigneeId: 'u1',
  assignedAt: '2026-09-08',
  eventId: 'e1',
  eventTitle: 'מבצע חנוכה',
  eventDate: '2026-12-14',
  boardId: 'b1',
  ...over
});

// ---------- finished work says nothing, ever ----------
assert.deepEqual(
  remindersForTasks([task({ status: 'done', dueDate: '2026-08-01' })], DEFAULT_PREFS, TODAY),
  [],
  'a completed task is not late, not due, not stalled'
);

assert.deepEqual(
  remindersForTasks([task({ assigneeId: null, dueDate: '2026-08-01' })], DEFAULT_PREFS, TODAY),
  [],
  'work nobody owns has nobody to remind'
);

// ---------- late ----------
{
  const [r] = remindersForTasks([task({ dueDate: '2026-09-01' })], DEFAULT_PREFS, TODAY);
  assert.equal(r.kind, 'task_overdue');
  assert.equal(r.severity, 1, 'late work is the first thing on the screen');
  assert.ok(r.title.includes('הכנת דיוור'));
  assert.ok(r.body.includes('01.09.2026'), 'it says when it was due');
  assert.ok(r.body.includes('8 ימים'), 'and how long ago that was');
  assert.ok(r.dedupeKey.endsWith(TODAY), 'once a day and no more');
  assert.ok(r.link.includes('e1'), 'and links to the campaign it belongs to');
}

// One problem, one line. A task that is late AND was never started is late.
{
  const both = remindersForTasks(
    [task({ dueDate: '2026-09-01', status: 'todo', assignedAt: '2026-08-01' })],
    DEFAULT_PREFS,
    TODAY
  );
  assert.equal(both.length, 1, 'two rules about one task produce one notification');
  assert.equal(both[0].kind, 'task_overdue', 'and it is the more urgent of the two');
}

// ---------- due soon ----------
{
  const soon = remindersForTasks(
    [
      task({ id: 'today', dueDate: TODAY }),
      task({ id: 'tomorrow', dueDate: '2026-09-10' }),
      task({ id: 'day-after', dueDate: '2026-09-11' }),
      task({ id: 'next-week', dueDate: '2026-09-20' })
    ],
    DEFAULT_PREFS,
    TODAY
  );
  assert.deepEqual(
    soon.map((r) => r.entityId),
    ['today', 'tomorrow', 'day-after'],
    'two days ahead by default, and nothing beyond it'
  );
  assert.deepEqual(
    soon.map((r) => r.title.split(':')[0]),
    ['היום', 'מחר', 'מחרתיים'],
    'said in the words a person uses'
  );
}

// ---------- not started ----------
{
  const stalled = remindersForTasks([task({ assignedAt: '2026-09-05' })], DEFAULT_PREFS, TODAY);
  assert.equal(stalled[0]?.kind, 'task_stalled', 'four days untouched, and it is mentioned');
  assert.ok(stalled[0].body.includes('4 ימים'));

  assert.deepEqual(
    remindersForTasks([task({ assignedAt: '2026-09-07' })], DEFAULT_PREFS, TODAY),
    [],
    'two days is not yet worth mentioning'
  );

  // The reminder stops the moment its reason does — no flag to clear.
  assert.deepEqual(
    remindersForTasks([task({ assignedAt: '2026-09-01', status: 'in_progress' })], DEFAULT_PREFS, TODAY),
    [],
    'work that has started is not "not started"'
  );

  // Weekly, not daily: nagging every morning about work somebody has chosen
  // not to start yet is how a person mutes the whole system.
  const monday = remindersForTasks([task({ assignedAt: '2026-09-01' })], DEFAULT_PREFS, '2026-09-07');
  const tuesday = remindersForTasks([task({ assignedAt: '2026-09-01' })], DEFAULT_PREFS, '2026-09-08');
  assert.equal(monday[0].dedupeKey, tuesday[0].dedupeKey, 'the same week is the same reminder');

  const nextWeek = remindersForTasks([task({ assignedAt: '2026-09-01' })], DEFAULT_PREFS, '2026-09-14');
  assert.notEqual(monday[0].dedupeKey, nextWeek[0].dedupeKey, 'a new week may say it again');
}

// ---------- switching a rule off actually switches it off ----------
{
  const quiet = readPrefs({ overdue: false, dueBeforeDays: 0, stalledAfterDays: 0 });
  assert.deepEqual(
    remindersForTasks(
      [task({ dueDate: '2026-09-01' }), task({ id: 't2', dueDate: TODAY }), task({ id: 't3', assignedAt: '2026-08-01' })],
      quiet,
      TODAY
    ),
    [],
    'every rule off means silence'
  );
}

// ---------- campaign dates ----------
{
  const milestone = (over: Partial<ReminderMilestone> = {}): ReminderMilestone => ({
    eventId: 'e1',
    eventTitle: 'מבצע חנוכה',
    eventDate: '2026-12-14',
    boardId: 'b1',
    key: 'freeze',
    label: 'הקפאת שינויים',
    date: '2026-09-11',
    ...over
  });

  const soon = remindersForMilestones([milestone()], DEFAULT_PREFS, TODAY);
  assert.equal(soon[0].kind, 'milestone_soon');
  assert.equal(soon[0].title, 'הקפאת שינויים — מבצע חנוכה');
  assert.equal(soon[0].body, 'מחרתיים');

  assert.deepEqual(
    remindersForMilestones([milestone({ date: '2026-09-30' })], DEFAULT_PREFS, TODAY),
    [],
    'a date three weeks out is not news yet'
  );
  assert.deepEqual(
    remindersForMilestones([milestone({ date: '2026-09-01' })], DEFAULT_PREFS, TODAY),
    [],
    'and one that has passed is not a warning'
  );
  assert.equal(
    remindersForMilestones([milestone({ date: TODAY })], DEFAULT_PREFS, TODAY)[0].severity,
    1,
    'today it needs doing'
  );
}

// ---------- the digest ----------
{
  const reminders = remindersForTasks(
    [
      task({ id: 'late', dueDate: '2026-09-01' }),
      task({ id: 'soon', dueDate: '2026-09-10' }),
      task({ id: 'quiet', dueDate: '2026-12-01' })
    ],
    DEFAULT_PREFS,
    TODAY
  );
  const sections = buildDigest(reminders);
  assert.deepEqual(sections.map((s) => s.heading), ['דורש טיפול', 'בימים הקרובים']);
  assert.equal(sections[0].items.length, 1);
  assert.deepEqual(buildDigest([]), [], 'nothing to say produces no message at all');
}

// ---------- when the digest goes out ----------
{
  const day = (hour: number, weekday: number, date = '2026-09-06') => ({ hour, weekday, date });

  assert.ok(isDigestDue(DEFAULT_PREFS, day(8, 0), null), 'Sunday at eight');
  assert.ok(!isDigestDue(DEFAULT_PREFS, day(8, 5), null), 'not on Friday');
  assert.ok(!isDigestDue(DEFAULT_PREFS, day(8, 6), null), 'not on Saturday');
  assert.ok(!isDigestDue(DEFAULT_PREFS, day(7, 0), null), 'and not before the hour they chose');

  /*
   * Past the hour still counts, and this is the point of the rule.
   *
   * On a schedule that runs once a day, an exact-hour match sends nothing at
   * all: the run lands at 07:00, everybody chose 08:00, and nothing looks
   * broken because nothing threw. It also means a missed run is caught by the
   * next one instead of being lost.
   */
  assert.ok(isDigestDue(DEFAULT_PREFS, day(9, 0), null), 'an hour late is still today');
  assert.ok(isDigestDue(DEFAULT_PREFS, day(23, 0), null), 'and so is much later');

  // But only once. Every later run of the same day finds it already handled.
  assert.ok(!isDigestDue(DEFAULT_PREFS, day(9, 0), '2026-09-06'), 'nobody gets two morning digests');
  assert.ok(isDigestDue(DEFAULT_PREFS, day(9, 1, '2026-09-07'), '2026-09-06'), 'and tomorrow is a new day');

  const evening = readPrefs({ digestHour: 17, digestDays: [1, 3] });
  assert.ok(isDigestDue(evening, day(17, 3), null), 'the hour is a setting, not a deploy');
  assert.ok(!isDigestDue(evening, day(8, 3), null), 'before their hour is too early');
  assert.ok(!isDigestDue(evening, day(17, 0), null), 'and not on a day they did not choose');
}

// ---------- preferences survive anything stored ----------
{
  assert.deepEqual(readPrefs(null), DEFAULT_PREFS, 'somebody who never opened settings gets the defaults');
  assert.deepEqual(readPrefs('nonsense'), DEFAULT_PREFS);
  assert.equal(readPrefs({ digestHour: 99 }).digestHour, 23, 'out of range is clamped, not accepted');
  assert.equal(readPrefs({ digestHour: -4 }).digestHour, 0);
  assert.equal(readPrefs({ sms: 'shout' }).sms, 'off', 'an unknown channel setting is ignored');
  assert.deepEqual(readPrefs({ digestDays: [] }).digestDays, DEFAULT_PREFS.digestDays, 'no days chosen is not "never"');
  assert.deepEqual(readPrefs({ digestDays: [4, 0, 0, 9] }).digestDays, [0, 4], 'deduped, sorted, rubbish dropped');

  // An admin's org defaults sit under a person's own choices.
  const withOrg = readPrefs({ digestHour: 6 }, { digestHour: 10, email: 'off' });
  assert.equal(withOrg.digestHour, 6, "the person's own choice wins");
  assert.equal(withOrg.email, 'off', 'and the organisation decides what they did not');
}

// ---------- the clock is Israel's ----------
{
  // 05:30 UTC on a Wednesday in September is 08:30 Wednesday in Israel.
  const t = israelNow(new Date('2026-09-09T05:30:00Z'));
  assert.equal(t.hour, 8, 'the hour is read in Israel, whatever the server is set to');
  assert.equal(t.weekday, 3, 'Wednesday');
  assert.equal(t.date, '2026-09-09');

  // 22:00 UTC is already the next day in Israel — the date must follow.
  const late = israelNow(new Date('2026-09-09T22:00:00Z'));
  assert.equal(late.date, '2026-09-10', 'and the date rolls with it');
}

console.log('reminders: כל הבדיקות עברו ✓');
