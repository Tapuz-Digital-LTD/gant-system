// Run: npx tsx src/utils/period.test.ts
import assert from 'node:assert/strict';
import {
  addDays,
  addMonths,
  endOfMonth,
  hebrewMonthRange,
  isSamePeriod,
  monthKeyFromOrdinal,
  monthOrdinal,
  periodContains,
  periodRange,
  periodTitle,
  shiftPeriod,
  startOfWeek,
  timelineMonths,
  timelineRange,
  withMode,
  calendarGrid
} from './period.ts';
import type { Period } from './period.ts';

const month = (anchor: string): Period => ({ mode: 'month', anchor });
const week = (anchor: string): Period => ({ mode: 'week', anchor });

// ---------- day arithmetic survives month, year and leap boundaries ----------
assert.equal(addDays('2026-12-31', 1), '2027-01-01', 'new year');
assert.equal(addDays('2027-01-01', -1), '2026-12-31', 'back over new year');
assert.equal(addDays('2028-02-28', 1), '2028-02-29', '2028 is a leap year');
assert.equal(addDays('2027-02-28', 1), '2027-03-01', '2027 is not');

assert.equal(addMonths('2026-12-14', 1), '2027-01-14', 'december to january');
assert.equal(addMonths('2027-01-31', 1), '2027-02-28', '31 january clamps to the end of february');
assert.equal(addMonths('2027-03-15', -5), '2026-10-15', 'five months back crosses the year');
assert.equal(endOfMonth('2028-02-05'), '2028-02-29', 'february in a leap year has 29 days');

// A date is never shifted by a timezone: the same string goes in and comes out.
for (const d of ['2026-01-01', '2026-06-15', '2026-10-25', '2026-12-31']) {
  assert.equal(addDays(d, 0), d, `${d} survives a zero-day shift`);
}

// ---------- weeks start on Sunday ----------
assert.equal(startOfWeek('2026-09-08'), '2026-09-06', 'Tuesday belongs to the week that opened on Sunday');
assert.equal(startOfWeek('2026-09-06'), '2026-09-06', 'Sunday is its own start');
assert.equal(startOfWeek('2026-09-12'), '2026-09-06', 'Saturday still belongs to that week');
assert.equal(startOfWeek('2026-09-13'), '2026-09-13', 'the next Sunday opens the next week');

// ---------- what a period covers ----------
assert.deepEqual(periodRange(month('2026-09-08')), { from: '2026-09-01', to: '2026-09-30' });
assert.deepEqual(periodRange(week('2026-09-08')), { from: '2026-09-06', to: '2026-09-12' });
assert.deepEqual(periodRange(week('2026-12-31')), { from: '2026-12-27', to: '2027-01-02' }, 'a week may straddle new year');

assert.ok(periodContains(month('2026-09-08'), '2026-09-30'));
assert.ok(!periodContains(month('2026-09-08'), '2026-10-01'));
assert.ok(periodContains(week('2026-12-31'), '2027-01-02'), 'the tail of a straddling week is inside it');

// ---------- moving forward and back actually moves ----------
assert.equal(shiftPeriod(month('2026-12-15'), 1).anchor, '2027-01-01', 'next month crosses the year');
assert.equal(shiftPeriod(month('2027-01-15'), -1).anchor, '2026-12-01', 'previous month crosses back');
assert.equal(shiftPeriod(week('2026-12-31'), 1).anchor, '2027-01-03', 'next week crosses the year');
assert.equal(shiftPeriod(week('2027-01-03'), -1).anchor, '2026-12-27', 'previous week crosses back');

// Twelve steps forward and twelve back returns to where it started.
let walk = month('2026-09-01');
for (let i = 0; i < 12; i++) walk = shiftPeriod(walk, 1);
assert.equal(walk.anchor, '2027-09-01', 'twelve months forward is one year');
for (let i = 0; i < 12; i++) walk = shiftPeriod(walk, -1);
assert.equal(walk.anchor, '2026-09-01', 'and twelve back returns');

// ---------- switching month and week keeps the place ----------
{
  const m = month('2026-11-01');
  const w = withMode(m, 'week');
  assert.equal(w.mode, 'week');
  assert.equal(w.anchor, '2026-11-01', 'a month far from today opens on the week of its 1st');
  assert.ok(periodContains(m, w.anchor), 'the week stays inside the month it came from');

  const back = withMode(w, 'month');
  assert.equal(back.anchor, '2026-11-01', 'and switching back lands on the same month');
  assert.ok(isSamePeriod(back, m), 'the round trip is the period it started as');
}

// ---------- the title says exactly what is on screen ----------
assert.equal(periodTitle(month('2026-09-08')), 'ספטמבר 2026');
assert.equal(periodTitle(week('2026-09-08')), '6–12 בספטמבר 2026');
assert.equal(periodTitle(week('2026-08-31')), '30 באוגוסט – 5 בספטמבר 2026', 'a week over a month boundary names both months');
assert.equal(
  periodTitle(week('2026-12-31')),
  '27 בדצמבר 2026 – 2 בינואר 2027',
  'a week over new year names both years'
);

// ---------- month ordinals cross years ----------
assert.equal(monthOrdinal('2027-01') - monthOrdinal('2026-12'), 1, 'december to january is one month');
assert.equal(monthKeyFromOrdinal(monthOrdinal('2026-09')), '2026-09', 'the ordinal round-trips');
assert.equal(monthKeyFromOrdinal(monthOrdinal('2026-12') + 1), '2027-01');

// ---------- the timeline window ----------
{
  const months = timelineMonths(month('2026-09-08'));
  assert.equal(months.length, 12, 'a year of months');
  assert.equal(months[0].key, '2026-09', 'the window opens at the chosen period');
  assert.equal(months[11].key, '2027-08', 'and runs a year forward, across the year boundary');
  assert.equal(months[0].title, 'ספטמבר 2026');

  const range = timelineRange(month('2026-09-08'));
  assert.deepEqual(range, { from: '2026-09-01', to: '2027-08-31' }, 'the server is asked for the whole window');

  // Moving the period moves the window with it, which is the bug this replaces.
  const moved = timelineMonths(shiftPeriod(month('2026-09-08'), 1));
  assert.equal(moved[0].key, '2026-10', 'next month moves the timeline');
}

// ---------- the Hebrew calendar is computed, not listed ----------
assert.equal(hebrewMonthRange('2026-09'), 'אלול תשפ״ו – תשרי תשפ״ז', 'a civil month spanning two Hebrew years');
assert.equal(hebrewMonthRange('2027-11'), 'חשון תשפ״ח', 'a civil month inside one Hebrew month');
assert.equal(hebrewMonthRange('2026-12'), 'כסלו – טבת תשפ״ז', 'one Hebrew year is said once');
assert.equal(hebrewMonthRange('2027-03'), 'אדר א׳ – אדר ב׳ תשפ״ז', 'a leap year keeps both Adars, and both words of each');
assert.equal(hebrewMonthRange('2029-03'), 'אדר – ניסן תשפ״ט', 'an ordinary year has a single Adar');

// Far outside the old hard-coded list, where the product used to go blind.
assert.equal(timelineMonths(month('2031-05-01'))[0].key, '2031-05', 'a year with no hard-coded entry still works');
assert.ok(hebrewMonthRange('2031-05').length > 0, 'and still has a Hebrew date');

// ---------- the calendar grid ----------
{
  const grid = calendarGrid(month('2026-09-08'));
  assert.equal(grid.length % 7, 0, 'a month grid is whole weeks');
  assert.equal(grid[0].weekday, 0, 'it opens on a Sunday');
  assert.equal(grid[0].date, '2026-08-30', 'September 2026 starts mid-week, so the grid borrows August');
  assert.equal(grid[0].inPeriod, false, 'a borrowed day is marked as borrowed');
  assert.equal(grid.filter((d) => d.inPeriod).length, 30, 'September has 30 days');
  assert.equal(grid.find((d) => d.date === '2026-09-01')?.inPeriod, true);

  // February 2027 begins on a Monday and has 28 days: 5 rows, not 4.
  const feb = calendarGrid(month('2027-02-10'));
  assert.equal(feb.filter((d) => d.inPeriod).length, 28);
  assert.equal(feb[0].date, '2027-01-31', 'and it borrows one day from January');

  // A month that starts on a Sunday borrows nothing at the front.
  const nov = calendarGrid(month('2026-11-05'));
  assert.equal(nov[0].date, '2026-11-01');
  assert.equal(nov[0].inPeriod, true);

  const w = calendarGrid(week('2026-12-31'));
  assert.equal(w.length, 7, 'a week is seven days');
  assert.ok(w.every((d) => d.inPeriod), 'a week borrows nothing');
  assert.equal(w[0].date, '2026-12-27');
  assert.equal(w[6].date, '2027-01-02', 'and it may run into the next year');
}

console.log('period: כל הבדיקות עברו ✓');
