// Run: npx tsx server/validation.test.ts
//
// The rules that decide whether somebody's plan is allowed to be saved. Every
// one of these is a case where saying "no" to a legitimate plan is the bug.
import assert from 'node:assert/strict';
import { eventCreate, eventUpdate, kickoffFitsEvent } from './validation.ts';

/*
 * The case that actually blocked somebody.
 *
 * An event set to "during September 2026" is stored as 2026-09-01, because a
 * date column needs a day. Comparing a go-live against that day rejected every
 * campaign going live after the 1st of its own month — which is most of them.
 */
const monthEvent = {
  title: 'קמפיין ספטמבר',
  actualDate: '2026-09-01',
  actualPrecision: 'month' as const,
  kickoffDate: '2026-09-11',
  prepMonths: 1
};
assert.doesNotThrow(() => eventCreate.parse(monthEvent), '"during September" runs to the 30th, not the 1st');

assert.equal(kickoffFitsEvent('2026-09-30', '2026-09-01', 'month'), true, 'the last day is still inside the month');
assert.equal(kickoffFitsEvent('2026-10-01', '2026-09-01', 'month'), false, 'the next month is not');
assert.equal(kickoffFitsEvent('2026-02-29', '2026-02-01', 'month'), false, '2026 is not a leap year');
assert.equal(kickoffFitsEvent('2028-02-29', '2028-02-01', 'month'), true, '2028 is');

// With a real day chosen, the rule is unchanged — this is not a loosening.
assert.equal(kickoffFitsEvent('2026-09-11', '2026-09-01', 'day'), false, 'an exact day is an exact day');
assert.equal(kickoffFitsEvent('2026-09-01', '2026-09-01', 'day'), true, 'the same day is fine');
assert.equal(kickoffFitsEvent(null, '2026-09-01', 'day'), true, 'no go-live, nothing to disagree about');

// A refusal has to be actionable, and has to say where.
{
  const bad = eventCreate.safeParse({ ...monthEvent, actualPrecision: 'day' });
  assert.equal(bad.success, false);
  assert.ok(bad.error.issues[0].message.includes('אפשר להקדים'), 'it says what to do, not only what is wrong');
  assert.deepEqual(bad.error.issues[0].path, ['kickoffDate'], 'and which field to take the person to');
}

// Editing used to allow what creating refused. One rule, both doors.
{
  const bad = eventUpdate.safeParse({
    version: 1,
    actualDate: '2026-09-01',
    actualPrecision: 'day',
    kickoffDate: '2026-09-11'
  });
  assert.equal(bad.success, false, 'the same plan is rejected on edit as on create');

  const partial = eventUpdate.safeParse({ version: 1, kickoffDate: '2026-09-11' });
  assert.equal(partial.success, true, 'a patch carrying no event date has nothing to compare against');
}

console.log('validation: כל הבדיקות עברו ✓');
