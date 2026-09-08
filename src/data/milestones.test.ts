// Run: npx tsx src/data/milestones.test.ts
import assert from 'node:assert/strict';
import { EventItem } from '../types.ts';
import {
  MILESTONES,
  milestonesOf,
  milestonesOnDay,
  milestoneWarnings,
  workWindowStart
} from './milestones.ts';

const event = (over: Partial<EventItem> = {}): EventItem => ({
  id: 'e1',
  boardId: 'b1',
  title: 'מבצע חנוכה',
  category: 'campaign',
  status: 'todo',
  actualDate: '2026-12-14',
  actualPrecision: 'day',
  prepMonths: 2,
  workStartDate: null,
  reviewDate: null,
  freezeDate: null,
  kickoffDate: null,
  announceDate: null,
  campaignEndDate: null,
  note: null,
  description: null,
  createdAt: '2026-09-01',
  version: 1,
  tasks: [],
  ...over
});

// ---------- the list is the single description ----------
assert.equal(new Set(MILESTONES.map((m) => m.key)).size, MILESTONES.length, 'every key is unique');
assert.equal(new Set(MILESTONES.map((m) => m.field)).size, MILESTONES.length, 'every field is unique');
assert.equal(
  MILESTONES.filter((m) => m.required).length,
  1,
  'only the event date is required'
);
assert.equal(
  MILESTONES.filter((m) => m.allowsMonth).map((m) => m.key).join(),
  'actual',
  'only the event date may be a whole month'
);
assert.deepEqual(
  [...MILESTONES].sort((a, b) => a.order - b.order).map((m) => m.key),
  ['workStart', 'review', 'freeze', 'kickoff', 'announce', 'actual', 'campaignEnd'],
  'the story runs: start work, review, freeze, go live, tell the company, the event, the end'
);

// ---------- work window start ----------
{
  const guessed = workWindowStart(event({ actualDate: '2026-12-14', prepMonths: 2 }));
  assert.equal(guessed.date, '2026-10-01', 'two months before December is October');
  assert.equal(guessed.approximate, true, 'a month calculation is never presented as a day');

  const typed = workWindowStart(event({ workStartDate: '2026-10-19', prepMonths: 2 }));
  assert.equal(typed.date, '2026-10-19', 'an exact date wins over the month arithmetic');
  assert.equal(typed.approximate, false, 'a typed day is exact');

  const across = workWindowStart(event({ actualDate: '2027-01-20', prepMonths: 3 }));
  assert.equal(across.date, '2026-10-01', 'three months before January crosses into the previous year');

  const none = workWindowStart(event({ actualDate: '2026-12-14', prepMonths: 0 }));
  assert.equal(none.date, '2026-12-01', 'zero preparation still starts at the month of the event');
}

// ---------- which dates an event actually has ----------
{
  const bare = milestonesOf(event());
  assert.deepEqual(bare.map((o) => o.meta.key), ['actual'], 'an empty event has only its event date');

  const full = milestonesOf(
    event({
      workStartDate: '2026-10-19',
      reviewDate: '2026-11-20',
      freezeDate: '2026-11-28',
      kickoffDate: '2026-12-06',
      announceDate: '2026-12-06',
      campaignEndDate: '2026-12-31'
    })
  );
  assert.deepEqual(
    full.map((o) => o.meta.key),
    ['workStart', 'review', 'freeze', 'kickoff', 'announce', 'actual', 'campaignEnd'],
    'dates come back in calendar order, and same-day ones keep the story order'
  );
  assert.ok(full.every((o) => o.monthOnly === false), 'nothing here is month-only');
}

// ---------- a month-precision event never claims a day ----------
{
  const floating = event({ actualDate: '2026-12-01', actualPrecision: 'month', kickoffDate: '2026-12-06' });
  const actual = milestonesOf(floating).find((o) => o.meta.key === 'actual');
  assert.equal(actual?.monthOnly, true, 'the event date is marked as a whole month');

  assert.deepEqual(
    milestonesOnDay(floating, '2026-12-01').map((o) => o.meta.key),
    [],
    'a month-only event date does not land on the 1st — that day was never chosen'
  );
  assert.deepEqual(
    milestonesOnDay(floating, '2026-12-06').map((o) => o.meta.key),
    ['kickoff'],
    'its exact milestones still land on their real days'
  );
}

// ---------- two dates, one event, two days ----------
{
  const e = event({ kickoffDate: '2026-12-06' });
  assert.deepEqual(milestonesOnDay(e, '2026-12-06').map((o) => o.meta.key), ['kickoff']);
  assert.deepEqual(milestonesOnDay(e, '2026-12-14').map((o) => o.meta.key), ['actual']);
}

// ---------- warnings, never refusals ----------
{
  assert.deepEqual(milestoneWarnings(event()), [], 'an ordinary event warns about nothing');

  const reviewLate = milestoneWarnings(event({ reviewDate: '2026-11-30', freezeDate: '2026-11-28' }));
  assert.deepEqual(reviewLate.map((w) => w.key), ['review']);

  const freezeLate = milestoneWarnings(event({ freezeDate: '2026-12-10', kickoffDate: '2026-12-06' }));
  assert.ok(freezeLate.some((w) => w.key === 'freeze'), 'freezing after going live is flagged');

  const endEarly = milestoneWarnings(event({ campaignEndDate: '2026-12-01' }));
  assert.deepEqual(endEarly.map((w) => w.key), ['campaignEnd'], 'a campaign cannot end before its event');

  const beforeWork = milestoneWarnings(event({ workStartDate: '2026-11-01', reviewDate: '2026-10-20' }));
  assert.ok(beforeWork.some((w) => w.key === 'review'), 'a date before work starts is flagged');

  // The point of warnings: they describe, they do not block.
  assert.ok(
    milestoneWarnings(event({ campaignEndDate: '2026-12-01' })).length > 0,
    'an odd plan is still a plan the system will hold'
  );
}

console.log('milestones: כל הבדיקות עברו ✓');
