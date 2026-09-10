// Run: npx tsx server/import/import.test.ts
//
// Two halves. The first builds tiny sheets by hand and pins the rules that
// decide what happens to a row. The second runs the customer's actual planning
// file through the whole thing, because every rule here exists because of
// something that file does.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parseSheets, type SheetLike } from './parse.ts';
import { buildPlan, parseDate, type EventValues } from './plan.ts';

/** A sheet from a grid of strings, so a case is readable as a case. */
function sheet(name: string, grid: (string | number | null)[][]): SheetLike {
  return {
    name,
    rowCount: grid.length,
    columnCount: Math.max(...grid.map((r) => r.length)),
    cell: (row, column) => grid[row - 1]?.[column - 1] ?? null
  };
}

/* ---------------------------------------------------------------- dates ---- */
{
  assert.equal(parseDate('04.12.2026')?.iso, '2026-12-04', 'the way people write dates here');
  assert.equal(parseDate('2026-12-04')?.iso, '2026-12-04', 'and the way the export writes them');
  assert.equal(parseDate('4/12/2026')?.iso, '2026-12-04');
  assert.equal(parseDate('12.2026')?.iso, '2026-12-01');
  assert.equal(parseDate('12.2026')?.monthOnly, true, 'a month with no day stays a month');
  assert.equal(parseDate('')?.iso, undefined);
  assert.equal(parseDate(undefined), null);

  // The real failure in the file: September has thirty days.
  const impossible = parseDate('31.09.2027');
  assert.equal(impossible?.iso, undefined, 'an impossible day never becomes a date');
  assert.match(impossible!.error!, /ספטמבר/, 'and the complaint names the month a person would look at');

  assert.equal(parseDate('29.02.2028')?.iso, '2028-02-29', 'a leap day is a real day');
  assert.equal(parseDate('29.02.2027')?.iso, undefined, 'and it is not one every year');
  assert.ok(parseDate('בערך בדצמבר')?.error, 'prose is reported, not interpreted');
}

/* --------------------------------------------------- finding the columns ---- */
{
  const ws = sheet('גאנט', [
    ['תחילת גאנט', '01.09.2026'],
    [],
    ['ת. התנעה', 'ת. בקרה', 'ת. הקפאה', 'ת. השקה', 'ת. סיום קמפיין', 'תאור'],
    ['20.10.2026', '03.11.2026', '12.11.2026', '20.11.2026', '20.12.2026', 'מתנת סוף שנה'],
    [null, null, null, null, null, null],
    ['04.09.2026', null, null, '04.10.2026', '04.12.2026', 'חנוכה']
  ]);

  const parsed = parseSheets([ws]);
  assert.equal(parsed.blocks.length, 1, 'the header row is found wherever it sits');
  assert.equal(parsed.blocks[0].headerRow, 3);
  assert.equal(parsed.rows.length, 2, 'blank spacer rows are not rows');
  assert.equal(parsed.rows[0].where, 'גאנט!4', 'and each one says where to look in the file');
  assert.equal(parsed.rows[1].values.title, 'חנוכה');
}

// Two tables side by side on one sheet, which is how the real file is laid out.
{
  const ws = sheet('לוח שנה', [
    ['ת. סיום קמפיין', 'הכנה', 'תאור', null, 'ת. התנעה', 'ת. השקה', 'ת. סיום קמפיין', 'תאור'],
    ['04.12.2026', 2, 'חנוכה', null, '04.09.2026', '04.10.2026', '04.12.2026', 'חנוכה']
  ]);
  const parsed = parseSheets([ws]);
  assert.equal(parsed.blocks.length, 2, 'a repeated header opens a second block, it does not overwrite the first');
  assert.equal(parsed.rows.length, 2, 'and both blocks are read');
}

// A sheet with nothing readable is reported, never silently dropped.
{
  const parsed = parseSheets([sheet('מקרא', [['ת. התנעה', 'פגישת תיאום צרכים…']])]);
  assert.equal(parsed.rows.length, 0);
  assert.equal(parsed.skipped.length, 1, 'the sheet is named');
  assert.match(parsed.skipped[0].reason, /כותרות/, 'and so is the reason');
}

/* ------------------------------------------------------- the same twice ---- */
{
  // One activity, three sheets, two layouts — the shape of the real file.
  const gantt = sheet('גאנט', [
    ['ת. התנעה', 'ת. בקרה', 'ת. הקפאה', 'ת. השקה', 'ת. סיום קמפיין', 'תאור'],
    ['04.09.2026', null, null, '04.10.2026', '04.12.2026', 'חנוכה']
  ]);
  const calendar = sheet('לוח שנה', [
    ['עברי', 'ת. סיום קמפיין', 'הכנה', 'תאור', null, 'ת. התנעה', 'ת. השקה', 'ת. סיום קמפיין', 'תאור'],
    ['1', '04.12.2026', 2, 'חנוכה', null, '04.09.2026', '04.10.2026', '04.12.2026', 'חנוכה']
  ]);
  const sales = sheet('מכירות', [
    ['ת. התנעה', 'ת. השקה', 'ת. סיום קמפיין', 'תאור'],
    ['04.09.2026', '04.10.2026', '04.12.2026', 'חנוכה']
  ]);

  const parsed = parseSheets([gantt, calendar, sales]);
  assert.equal(parsed.rows.length, 4, 'four rows in the file');

  const plan = buildPlan(parsed.rows);
  assert.equal(plan.events.length, 1, 'and one campaign in it');

  const e = plan.events[0];
  assert.equal(e.sources.length, 4, 'the event remembers every row it was assembled from');
  assert.equal(e.action, 'create');
  assert.equal(e.values.kickoffMeetingDate, '2026-09-04', 'the kickoff meeting is its own date');
  assert.equal(e.values.kickoffDate, '2026-10-04', 'the go-live is a different one');
  assert.equal(e.values.actualDate, '2026-12-04', 'and the event itself is a third');
  assert.equal(e.values.prepMonths, 2);
  assert.equal(e.values.category, 'holiday', 'the Hebrew flag is the one classification the file states');
  assert.equal(
    e.values.campaignEndDate,
    null,
    'the campaign end and the event date are one column in this file, so it is not stored twice'
  );
  assert.equal(e.conflicts.length, 0, 'four rows that agree are not a conflict');
  assert.equal(e.issues.length, 0);
}

// The same name in three different years is three events, not one.
{
  const ws = sheet('גאנט', [
    ['ת. התנעה', 'ת. השקה', 'ת. סיום קמפיין', 'תאור'],
    ['04.09.2026', '04.10.2026', '04.12.2026', 'חנוכה'],
    ['24.09.2027', '24.10.2027', '24.12.2027', 'חנוכה'],
    ['12.09.2028', '12.10.2028', '12.12.2028', 'חנוכה']
  ]);
  const plan = buildPlan(parseSheets([ws]).rows);
  assert.equal(plan.events.length, 3, 'a yearly campaign is a separate event each year');
  assert.deepEqual(
    plan.events.map((e) => e.values.actualDate),
    ['2026-12-04', '2027-12-24', '2028-12-12'],
    'and they come back in date order'
  );
  assert.equal(new Set(plan.events.map((e) => e.sourceKey)).size, 3, 'with three different keys');
}

/* ------------------------------------------------------------ conflicts ---- */
{
  const a = sheet('לוח שנה', [
    ['עברי', 'ת. סיום קמפיין', 'הכנה', 'תאור'],
    [null, '30.08.2027', 1, 'מתנת קיץ']
  ]);
  const b = sheet('גאנט', [
    ['ת. התנעה', 'ת. השקה', 'ת. סיום קמפיין', 'תאור'],
    ['01.07.2027', '01.08.2027', '01.09.2027', 'מתנת קיץ']
  ]);

  const plan = buildPlan(parseSheets([a, b]).rows);
  assert.equal(plan.events.length, 1, 'the two halves are still one activity');

  const e = plan.events[0];
  assert.equal(e.conflicts.length, 1, 'and the disagreement is reported rather than resolved quietly');
  assert.equal(e.conflicts[0].field, 'actualDate');
  assert.equal(e.conflicts[0].values.length, 2, 'both values are shown');
  assert.ok(
    e.conflicts[0].values.every((v) => v.where.length > 0),
    'each with the sheet and row it came from'
  );
  assert.equal(e.values.actualDate, '2027-08-30', 'the hand-typed block wins by default');
  assert.equal(e.conflicts[0].chosen, '2027-08-30');
}

/* ------------------- a repair is offered only when the file answers it ---- */
{
  const broken = sheet('גאנט', [
    ['ת. התנעה', 'ת. השקה', 'ת. סיום קמפיין', 'תאור'],
    ['01.08.2027', '31.09.2027', '31.12.2027', 'הכנת תקציב']
  ]);
  const fixed = sheet('לוח שנה', [
    ['ת. התנעה', 'ת. השקה', 'ת. סיום קמפיין', 'תאור'],
    ['01.08.2027', '01.10.2027', '31.12.2027', 'הכנת תקציב']
  ]);

  const plan = buildPlan(parseSheets([broken, fixed]).rows);
  const e = plan.events[0];

  const flagged = e.issues.find((i) => /ספטמבר/.test(i.message));
  assert.ok(flagged, 'the impossible date is named in plain words');
  assert.equal(flagged!.severity, 'warning', 'a warning, not an error: nothing was lost');
  assert.match(flagged!.message, /01|2027-10-01/, 'and it says which value was used instead');

  const s = e.suggestions.find((x) => x.field === 'kickoffDate');
  assert.ok(s, 'and the repair is shown');
  assert.equal(s!.to, '2027-10-01');
  assert.equal(s!.fromFile, true, 'because the file itself holds the answer');
  assert.equal(s!.applied, true, 'so it is used, ticked, rather than waiting on a click');
  assert.match(s!.reason, /לוח שנה!2/, 'and it says where');
  assert.equal(e.values.kickoffDate, '2027-10-01', 'the readable value is used; the broken one is not');

  // Un-ticking it empties the field. The unreadable text is never stored.
  const undone = buildPlan(parseSheets([broken, fixed]).rows, {
    rejected: new Set([`${e.sourceKey}:kickoffDate`])
  });
  assert.equal(undone.events[0].values.kickoffDate, null);

  // Nothing to copy from: the field is dropped and no date is invented.
  const alone = buildPlan(parseSheets([broken]).rows);
  assert.equal(alone.events[0].values.kickoffDate, null, 'an unreadable date does not become a guess');
  assert.equal(alone.events[0].suggestions.length, 0, 'and nothing is suggested out of thin air');
  assert.ok(
    alone.events[0].issues.some((i) => i.severity === 'error' && /לא ייובא/.test(i.message)),
    'with no answer in the file it is an error, and it says the date was dropped'
  );
  assert.equal(alone.events[0].action, 'create', 'the rest of the event still imports');
  assert.equal(alone.events[0].values.actualDate, '2027-12-31');
}

/* -------------------------------------------------- dates that run backwards */
{
  const ws = sheet('גאנט', [
    ['ת. התנעה', 'ת. השקה', 'ת. סיום קמפיין', 'תאור'],
    ['26.11.2026', '26.01.2026', '26.01.2027', 'ועידת ישראל']
  ]);
  const plan = buildPlan(parseSheets([ws]).rows);
  const e = plan.events[0];

  assert.ok(
    e.issues.some((i) => i.severity === 'warning' && /אחרי/.test(i.message)),
    'a story that runs backwards is flagged'
  );
  const s = e.suggestions.find((x) => x.field === 'kickoffDate');
  assert.ok(s, 'and the year that would put it right is offered');
  assert.equal(s!.to, '2027-01-26');
  assert.equal(s!.fromFile, false, 'marked as a suggestion, not as something the file said');
  assert.equal(e.values.kickoffDate, '2026-01-26', 'and nothing is changed without a person ticking it');

  const approved = buildPlan(parseSheets([ws]).rows, {
    accepted: new Set([`${e.sourceKey}:kickoffDate`])
  });
  assert.equal(approved.events[0].values.kickoffDate, '2027-01-26', 'ticked, it is applied');
}

/* --------------------------------------------- importing the same file twice */
{
  const ws = sheet('גאנט', [
    ['ת. התנעה', 'ת. השקה', 'ת. סיום קמפיין', 'תאור'],
    ['04.09.2026', '04.10.2026', '04.12.2026', 'חנוכה']
  ]);
  const first = buildPlan(parseSheets([ws]).rows);
  assert.equal(first.summary.create, 1);

  const existing = [
    {
      id: 'abc',
      sourceKey: first.events[0].sourceKey,
      title: 'חנוכה',
      actualDate: '2026-12-04',
      values: first.events[0].values
    }
  ];

  const again = buildPlan(parseSheets([ws]).rows, { existing });
  assert.equal(again.summary.create, 0, 'the same file twice creates nothing');
  assert.equal(again.summary.unchanged, 1, 'and says so plainly');
  assert.equal(again.events[0].action, 'unchanged');

  // A file where one date moved: an update, naming exactly what moves.
  const edited = sheet('גאנט', [
    ['ת. התנעה', 'ת. השקה', 'ת. סיום קמפיין', 'תאור'],
    ['10.09.2026', '04.10.2026', '04.12.2026', 'חנוכה']
  ]);
  const third = buildPlan(parseSheets([edited]).rows, { existing });
  assert.equal(third.events[0].action, 'update');
  assert.deepEqual(
    third.events[0].changes?.map((c) => c.field),
    ['kickoffMeetingDate'],
    'only the field that actually moved'
  );
  assert.equal(third.events[0].existingId, 'abc');

  // An event matched by name and day even when it was never imported before.
  const typedByHand = [{ ...existing[0], sourceKey: null }];
  assert.equal(
    buildPlan(parseSheets([ws]).rows, { existing: typedByHand }).events[0].action,
    'unchanged',
    'an event somebody already typed is matched, not duplicated'
  );
}

/* ------------------------------- an import never blanks what somebody typed */
{
  const ws = sheet('גאנט', [
    ['ת. התנעה', 'ת. סיום קמפיין', 'תאור'],
    ['04.09.2026', '04.12.2026', 'חנוכה']
  ]);
  const plan = buildPlan(parseSheets([ws]).rows);
  const inSystem: EventValues = {
    ...plan.events[0].values,
    // Somebody added these in the product; the file knows nothing about them.
    reviewDate: '2026-11-01',
    note: 'לתאם עם הספק'
  };
  const again = buildPlan(parseSheets([ws]).rows, {
    existing: [{ id: 'x', sourceKey: plan.events[0].sourceKey, title: 'חנוכה', actualDate: '2026-12-04', values: inSystem }]
  });
  assert.equal(again.events[0].action, 'unchanged', 'a file with no opinion changes nothing');
}

/* ------------------------------------------- a row with no readable date --- */
{
  const ws = sheet('גאנט', [
    ['ת. התנעה', 'ת. סיום קמפיין', 'תאור'],
    ['04.09.2026', 'בערך בדצמבר', 'משהו']
  ]);
  const plan = buildPlan(parseSheets([ws]).rows);
  assert.equal(plan.events[0].action, 'skip', 'without a date there is nothing to put on a calendar');
  assert.ok(plan.events[0].issues.some((i) => i.severity === 'error'));
  assert.equal(plan.summary.skip, 1);
}

/* ================= the customer's own file, end to end ==================== */
const REAL = new URL('../../docs/real-data.xlsx', import.meta.url);
if (existsSync(REAL)) {
  const { readWorkbook } = await import('./workbook.ts');
  const parsed = await readWorkbook(readFileSync(REAL));

  assert.equal(parsed.sheetNames.length, 4, 'four sheets');
  assert.equal(parsed.rows.length, 215, '215 data rows across them');
  assert.ok(
    parsed.skipped.some((s) => s.sheet === 'גיליון1'),
    'the legend sheet holds no data and is reported as skipped'
  );

  const plan = buildPlan(parsed.rows);

  assert.equal(plan.summary.events, 51, '215 rows describe 51 activities');
  assert.equal(plan.summary.create, 51, 'against an empty board, all of them are new');
  assert.equal(plan.summary.skip, 0, 'and none is unusable');
  assert.equal(plan.summary.tasks, 0, 'the file contains no tasks at all');

  // The four impossible dates, and the four repairs the file itself supplies.
  const impossible = plan.events.flatMap((e) => e.issues.filter((i) => /ספטמבר/.test(i.message)));
  assert.equal(impossible.length, 4, 'four rows say 31 September');
  assert.ok(
    impossible.every((i) => i.severity === 'warning'),
    'every one of them is answered elsewhere in the file, so nothing is lost'
  );
  assert.equal(plan.summary.errors, 0, 'and no date at all is dropped from this file');
  const fromFile = plan.events.flatMap((e) => e.suggestions.filter((s) => s.fromFile));
  assert.equal(fromFile.length, 2, 'two activities carry the repair, shown and undoable');
  assert.ok(fromFile.every((s) => s.applied));

  // The three rows whose year is out by one.
  const backwards = plan.events.filter((e) =>
    e.issues.some((i) => i.severity === 'warning' && /אחרי/.test(i.message))
  );
  assert.equal(backwards.length, 3, 'three activities have a date out of order');
  assert.ok(
    backwards.every((e) => e.suggestions.some((s) => !s.fromFile)),
    'each is offered a year, and none of them is applied'
  );

  const withMeeting = plan.events.filter((e) => e.values.kickoffMeetingDate).length;
  assert.equal(withMeeting, 45, '45 activities record a kickoff meeting');
  assert.equal(
    plan.events.filter((e) => e.values.kickoffDate).length,
    45,
    'including the two the file repairs for itself'
  );
  assert.equal(plan.events.filter((e) => e.values.category === 'holiday').length, 18, 'the Hebrew-anchored ones');
  assert.equal(
    plan.events.filter((e) => e.values.campaignEndDate).length,
    0,
    'the file has one column for the event and its end, so nothing is stored twice'
  );

  // The whole point: the meeting and the go-live are months apart.
  const gaps = plan.events
    .filter((e) => e.values.kickoffMeetingDate && e.values.kickoffDate)
    .map((e) => (Date.parse(e.values.kickoffDate!) - Date.parse(e.values.kickoffMeetingDate!)) / 86_400_000);
  assert.ok(
    gaps.filter((g) => g > 20).length > 30,
    'in most activities the meeting is a month or more before the go-live — they are not the same date'
  );

  console.log(
    `import: הקובץ האמיתי — ${parsed.rows.length} שורות → ${plan.summary.events} אירועים · ` +
      `${plan.summary.errors} שגיאות · ${plan.summary.warnings} אזהרות · ${plan.summary.conflicts} סתירות ✓`
  );
} else {
  console.log('import: docs/real-data.xlsx אינו כאן — הבדיקה על הקובץ האמיתי דולגה');
}

console.log('import: כל הבדיקות עברו ✓');
