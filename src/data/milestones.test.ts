// Run: npx tsx src/data/milestones.test.ts
import assert from 'node:assert/strict';
import { EventItem, type EventCategory } from '../types.ts';
import {
  MILESTONES,
  milestoneText,
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
  kickoffMeetingDate: null,
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
  ['kickoffMeeting', 'workStart', 'review', 'freeze', 'kickoff', 'announce', 'actual', 'campaignEnd'],
  'the story runs: the kickoff meeting, start work, review, freeze, go live, tell the company, the event, the end'
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
      kickoffMeetingDate: '2026-10-05',
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
    ['kickoffMeeting', 'workStart', 'review', 'freeze', 'kickoff', 'announce', 'actual', 'campaignEnd'],
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


// ---------- two dates must never read as the same date ----------
{
  const actual = MILESTONES.find((m) => m.key === 'actual')!;
  const kickoff = MILESTONES.find((m) => m.key === 'kickoff')!;
  const categories: EventCategory[] = ['holiday', 'campaign', 'b2b', 'social', 'operational', 'other'];

  for (const category of categories) {
    const a = milestoneText(actual, category);
    const k = milestoneText(kickoff, category);

    assert.notEqual(a.label, k.label, `"${category}": the two questions must differ`);
    assert.notEqual(a.short, k.short, `"${category}": the two names must differ`);
    assert.ok(a.label.trim().endsWith('?'), 'the central date asks a question');
    assert.ok(k.label.trim().endsWith('?'), 'so does the go-live date');
  }

  // The wording follows the work: a campaign starts, it does not "take place".
  assert.equal(milestoneText(actual, 'campaign').label, 'מתי המבצע מתחיל?');
  assert.equal(milestoneText(actual, 'campaign').short, 'תחילת המבצע');
  assert.equal(milestoneText(actual, 'holiday').short, 'תאריך החג');
  assert.equal(milestoneText(actual, 'other').short, 'תאריך האירוע', 'an unlisted category keeps the base wording');
  assert.equal(milestoneText(actual, undefined).short, 'תאריך האירוע', 'and so does no category at all');

  // Only wording moves. The stored field is the same everywhere, or the
  // calendar and the timeline stop agreeing with the form.
  for (const category of categories) {
    assert.equal(actual.field, 'actualDate', `"${category}" must not change where the value lives`);
    assert.equal(kickoff.field, 'kickoffDate');
  }

  // The go-live hint has to say it is optional, or people fill it in twice.
  for (const category of categories) {
    assert.ok(
      milestoneText(kickoff, category).hint.includes('רק אם'),
      `"${category}": the go-live date must say it is only for a different day`
    );
  }
}

/* ---------- ישיבת התנעה is its own moment, and it is not the others ---------- */
{
  const meeting = MILESTONES.find((m) => m.key === 'kickoffMeeting')!;
  const workStart = MILESTONES.find((m) => m.key === 'workStart')!;
  const kickoff = MILESTONES.find((m) => m.key === 'kickoff')!;

  assert.equal(meeting.order, 1, 'the meeting opens the story');
  assert.equal(meeting.field, 'kickoffMeetingDate', 'it has a column of its own');
  assert.notEqual(meeting.field, workStart.field, 'it is not the start of the work period');
  assert.notEqual(meeting.field, kickoff.field, 'and it is not the campaign going live');
  assert.equal(meeting.required, false, 'like every milestone, it may be left empty');
  assert.equal(meeting.allowsMonth, false, 'a meeting happens on a day');

  // Every category is offered it: the meeting is what the product is for.
  assert.equal(meeting.openFor.length, 6, 'every kind of work can have a kickoff meeting');

  // An event with only a meeting shows exactly that, and invents nothing.
  const only = milestonesOf(event({ kickoffMeetingDate: '2026-10-20' }));
  assert.deepEqual(only.map((o) => o.meta.key), ['kickoffMeeting', 'actual']);

  /*
   * The real planning file: the meeting sits months before the month
   * arithmetic would put the start of work, and the bar has to reach it.
   */
  const early = workWindowStart(
    event({ actualDate: '2027-10-01', prepMonths: 4, kickoffMeetingDate: '2027-04-01' })
  );
  assert.equal(early.date, '2027-04-01', 'the bar starts at the meeting when the meeting is earlier');
  assert.equal(early.approximate, false, 'and a typed day is exact, not a guess');

  const later = workWindowStart(
    event({ actualDate: '2026-12-14', prepMonths: 2, kickoffMeetingDate: '2026-11-20' })
  );
  assert.equal(later.date, '2026-10-01', 'a later meeting does not shorten the preparation window');
  assert.equal(later.approximate, true);

  // The three broken rows in the real file, as warnings and never refusals.
  const upsideDown = milestoneWarnings(
    event({ kickoffMeetingDate: '2026-11-26', kickoffDate: '2026-01-26' })
  );
  assert.ok(
    upsideDown.some((w) => w.key === 'kickoffMeeting'),
    'a meeting after the go-live is flagged'
  );
  assert.deepEqual(
    milestoneWarnings(event({ kickoffMeetingDate: '2026-10-20', kickoffDate: '2026-12-06' })),
    [],
    'and the ordinary order says nothing'
  );
}

console.log('milestones: כל הבדיקות עברו ✓');
