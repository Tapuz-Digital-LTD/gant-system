// Run: npx tsx src/utils/notificationGroups.test.ts
//
// The bell's job is to be readable at a glance. These are the rules that keep
// it that way when somebody has thirty things waiting.
import assert from 'node:assert/strict';
import { groupNotifications, flatten } from './notificationGroups.ts';
import type { AppNotification, NotificationKind } from '../types.ts';

let seq = 0;
const note = (kind: NotificationKind, over: Partial<AppNotification> = {}): AppNotification => ({
  id: `n${++seq}`,
  kind,
  title: 'משימה',
  body: null,
  link: '/b/1/calendar',
  entity: 'task',
  entityId: 't1',
  readAt: null,
  createdAt: `2026-09-0${(seq % 9) + 1}T08:00:00.000Z`,
  ...over
});

// ---------- nothing in, nothing out ----------
assert.deepEqual(groupNotifications([]), [], 'an empty inbox has no headings either');

// ---------- what needs doing comes first ----------
{
  const sections = groupNotifications([
    note('milestone_soon'),
    note('task_overdue'),
    note('task_due_soon'),
    note('task_assigned')
  ]);
  assert.deepEqual(
    sections.map((s) => s.heading),
    ['דורש טיפול', 'בימים הקרובים'],
    'two buckets, in the order a person can act on'
  );
  // Same words the daily email uses — one vocabulary, not two.
  assert.equal(sections[0].heading, 'דורש טיפול');
  assert.deepEqual(
    sections[0].groups.map((g) => g.kind).sort(),
    ['task_assigned', 'task_overdue'],
    'work handed to you and work already late both need you today'
  );
}

// ---------- repetition folds ----------
{
  const [section] = groupNotifications([
    note('task_overdue'),
    note('task_overdue'),
    note('task_overdue'),
    note('task_overdue')
  ]);
  const [group] = section.groups;
  assert.equal(group.folded, true, 'four of the same thing is one piece of news, four times');
  assert.equal(group.title, '4 משימות באיחור');
  assert.equal(group.items.length, 4, 'and every one is still there to open');

  // Folding two lines into one saves nobody anything.
  const pair = groupNotifications([note('task_overdue'), note('task_overdue')])[0].groups[0];
  assert.equal(pair.folded, false);
  assert.equal(pair.title, 'שתי משימות באיחור', 'Hebrew names two rather than counting it');

  const one = groupNotifications([note('task_overdue')])[0].groups[0];
  assert.equal(one.title, 'משימה אחת באיחור');
}

// ---------- unread outranks read ----------
{
  const [section] = groupNotifications([
    note('task_overdue', { readAt: '2026-09-09T09:00:00.000Z' }),
    note('task_overdue', { readAt: '2026-09-09T09:00:00.000Z' }),
    note('task_overdue', { readAt: '2026-09-09T09:00:00.000Z' }),
    note('task_assigned')
  ]);
  assert.equal(section.groups[0].kind, 'task_assigned', 'news you have not seen comes before a pile you have');
  assert.equal(section.unread, 1, 'and the heading counts only what is actually new');
}

// ---------- newest first inside a group ----------
{
  const older = note('task_assigned', { createdAt: '2026-09-01T08:00:00.000Z', title: 'ישנה' });
  const newer = note('task_assigned', { createdAt: '2026-09-08T08:00:00.000Z', title: 'חדשה' });
  const [section] = groupNotifications([older, newer]);
  assert.deepEqual(
    section.groups[0].items.map((i) => i.title),
    ['חדשה', 'ישנה'],
    'the reason somebody opened the bell is usually what just happened'
  );
}

// ---------- grouping loses nothing ----------
{
  const all = [
    note('task_overdue'),
    note('task_assigned'),
    note('task_due_soon'),
    note('task_stalled'),
    note('milestone_soon'),
    note('task_overdue')
  ];
  assert.equal(flatten(groupNotifications(all)).length, all.length, 'every notification survives the grouping');
  assert.deepEqual(
    new Set(flatten(groupNotifications(all)).map((i) => i.id)),
    new Set(all.map((i) => i.id)),
    'and it is the same set, not merely the same count'
  );
}

console.log('notificationGroups: כל הבדיקות עברו ✓');
