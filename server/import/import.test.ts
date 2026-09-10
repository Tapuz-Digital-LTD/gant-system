// Run: npx tsx server/import/import.test.ts
//
// Two halves. The first builds tiny sheets by hand and pins the rules that
// decide what happens to a row. The second runs the customer's actual planning
// file through the whole thing, because every rule here exists because of
// something that file does.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parseSheets, type SheetLike } from './parse.ts';
import { allEvents, buildPlan, parseDate, type EventValues } from './plan.ts';

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
  assert.equal(plan.boards.length, 3, 'three sheets are three boards, not one');
  assert.deepEqual(
    plan.boards.map((b) => b.boardName),
    ['גאנט', 'לוח שנה', 'מכירות'],
    'and each board is named after the sheet it came from'
  );
  assert.equal(allEvents(plan).length, 3, 'the same campaign on three sheets is three events, one per board');
  assert.ok(
    plan.boards.every((b) => b.events.length === 1),
    'each board holds it once — the two blocks inside a sheet still merge'
  );

  const e = plan.boards[1].events[0];
  assert.equal(e.sheet, 'לוח שנה');
  assert.equal(e.sources.length, 2, 'assembled from both blocks of its own sheet, and no others');
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
  assert.equal(e.conflicts.length, 0, 'two rows that agree are not a conflict');
  assert.equal(e.issues.length, 0);
  assert.equal(
    new Set(allEvents(plan).map((x) => x.planKey)).size,
    3,
    'and the three copies are three distinct rows in the plan, not one'
  );
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
  assert.equal(allEvents(plan).length, 3, 'a yearly campaign is a separate event each year');
  assert.deepEqual(
    allEvents(plan).map((e) => e.values.actualDate),
    ['2026-12-04', '2027-12-24', '2028-12-12'],
    'and they come back in date order'
  );
  assert.equal(new Set(allEvents(plan).map((e) => e.sourceKey)).size, 3, 'with three different keys');
}

/* ------------------------------------------------------------ conflicts ---- */
{
  // Both blocks on one sheet: that is one board, and one activity in it.
  const one = sheet('לוח שנה', [
    ['עברי', 'ת. סיום קמפיין', 'הכנה', 'תאור', null, 'ת. התנעה', 'ת. השקה', 'ת. סיום קמפיין', 'תאור'],
    [null, '30.08.2027', 1, 'מתנת קיץ', null, '01.07.2027', '01.08.2027', '01.09.2027', 'מתנת קיץ']
  ]);

  const plan = buildPlan(parseSheets([one]).rows);
  assert.equal(plan.boards.length, 1);
  assert.equal(allEvents(plan).length, 1, 'the two halves of one sheet are still one activity');

  const e = allEvents(plan)[0];
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
  assert.equal(plan.boards.length, 2, 'two sheets are two boards — a repair does not merge them');
  const e = plan.boards[0].events[0];

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
    rejected: new Set([`${e.planKey}:kickoffDate`])
  });
  assert.equal(undone.boards[0].events[0].values.kickoffDate, null);

  // Nothing to copy from: the field is dropped and no date is invented.
  const alone = buildPlan(parseSheets([broken]).rows);
  const only = alone.boards[0].events[0];
  assert.equal(only.values.kickoffDate, null, 'an unreadable date does not become a guess');
  assert.equal(only.suggestions.length, 0, 'and nothing is suggested out of thin air');
  assert.ok(
    only.issues.some((i) => i.severity === 'error' && /לא ייובא/.test(i.message)),
    'with no answer in the workbook it is an error, and it says the date was dropped'
  );
  assert.equal(only.action, 'create', 'the rest of the event still imports');
  assert.equal(only.values.actualDate, '2027-12-31');
}

/* -------------------------------------------------- dates that run backwards */
{
  const ws = sheet('גאנט', [
    ['ת. התנעה', 'ת. השקה', 'ת. סיום קמפיין', 'תאור'],
    ['26.11.2026', '26.01.2026', '26.01.2027', 'ועידת ישראל']
  ]);
  const plan = buildPlan(parseSheets([ws]).rows);
  const e = allEvents(plan)[0];

  assert.ok(
    e.issues.some((i) => i.severity === 'warning' && /אחרי/.test(i.message)),
    'a story that runs backwards is flagged'
  );
  assert.equal(e.suggestions.length, 1, 'one field carries the typo, so one repair is offered');
  const s = e.suggestions[0];
  assert.equal(s.field, 'kickoffDate', 'the go-live, because moving it lands on the event date');
  assert.equal(s.to, '2027-01-26');
  assert.equal(s.fromFile, false, 'marked as a suggestion, not as something the file said');
  assert.equal(s.applied, false);
  assert.equal(e.values.kickoffDate, '2026-01-26', 'and nothing is changed without a person ticking it');

  const approved = buildPlan(parseSheets([ws]).rows, {
    accepted: new Set([`${e.planKey}:kickoffDate`])
  });
  assert.equal(allEvents(approved)[0].values.kickoffDate, '2027-01-26', 'ticked, it is applied');
}

/* ------------- a year typed wrong that the story order cannot see ---------- */
{
  /*
   * Purim's meeting is three months before Purim, every year. In 2029 it is
   * typed a year early — which still leaves it before the go-live and before
   * the event, so the ordering rule sees nothing wrong at all.
   */
  const ws = sheet('גאנט', [
    ['ת. התנעה', 'ת. השקה', 'ת. סיום קמפיין', 'תאור'],
    ['26.12.2026', '26.01.2027', '26.03.2027', 'פורים'],
    ['12.12.2027', '12.01.2028', '12.03.2028', 'פורים'],
    ['02.12.2027', '02.01.2029', '02.03.2029', 'פורים']
  ]);

  const plan = buildPlan(parseSheets([ws]).rows);
  const odd = allEvents(plan).find((e) => e.values.actualDate === '2029-03-02')!;

  assert.equal(
    odd.issues.filter((i) => /אחרי/.test(i.message)).length,
    0,
    'the dates are in order, so the ordering rule is silent — as it should be'
  );
  assert.ok(
    odd.issues.some((i) => i.severity === 'warning' && /המרווח/.test(i.message)),
    'but the interval gives it away against the other years'
  );

  const s = odd.suggestions.find((x) => x.field === 'kickoffMeetingDate');
  assert.ok(s, 'and the year that restores the pattern is offered');
  assert.equal(s!.to, '2028-12-02');
  assert.equal(s!.applied, false, 'offered, never applied');
  assert.equal(odd.values.kickoffMeetingDate, '2027-12-02', 'the file still says what it says');

  const fixed = buildPlan(parseSheets([ws]).rows, {
    accepted: new Set([`${odd.planKey}:kickoffMeetingDate`])
  });
  assert.equal(
    allEvents(fixed).find((e) => e.values.actualDate === '2029-03-02')!.values.kickoffMeetingDate,
    '2028-12-02',
    'ticked, it is applied'
  );

  // Two instances are two numbers, not a pattern. Nothing is claimed from them.
  const pair = sheet('גאנט', [
    ['ת. התנעה', 'ת. סיום קמפיין', 'תאור'],
    ['26.12.2026', '26.03.2027', 'פורים'],
    ['02.12.2027', '02.03.2029', 'פורים']
  ]);
  assert.equal(
    allEvents(buildPlan(parseSheets([pair]).rows)).flatMap((e) => e.suggestions).length,
    0,
    'with only two instances there is no majority to be the odd one out'
  );
}

/* --------------------------------------------- importing the same file twice */
{
  const ws = sheet('גאנט', [
    ['ת. התנעה', 'ת. השקה', 'ת. סיום קמפיין', 'תאור'],
    ['04.09.2026', '04.10.2026', '04.12.2026', 'חנוכה']
  ]);
  const first = buildPlan(parseSheets([ws]).rows);
  assert.equal(first.summary.create, 1);

  const BOARD = '11111111-1111-4111-8111-111111111111';
  const existingByBoard = new Map([
    [
      BOARD,
      [
        {
          id: 'abc',
          sourceKey: allEvents(first)[0].sourceKey,
          title: 'חנוכה',
          actualDate: '2026-12-04',
          values: allEvents(first)[0].values
        }
      ]
    ]
  ]);
  const into = [{ sheet: 'גאנט', boardId: BOARD }];

  const again = buildPlan(parseSheets([ws]).rows, { sheets: into, existingByBoard });
  assert.equal(again.summary.create, 0, 'the same file twice creates nothing');
  assert.equal(again.summary.unchanged, 1, 'and says so plainly');
  assert.equal(allEvents(again)[0].action, 'unchanged');

  // A file where one date moved: an update, naming exactly what moves.
  const edited = sheet('גאנט', [
    ['ת. התנעה', 'ת. השקה', 'ת. סיום קמפיין', 'תאור'],
    ['10.09.2026', '04.10.2026', '04.12.2026', 'חנוכה']
  ]);
  const third = buildPlan(parseSheets([edited]).rows, { sheets: into, existingByBoard });
  assert.equal(allEvents(third)[0].action, 'update');
  assert.deepEqual(
    allEvents(third)[0].changes?.map((c) => c.field),
    ['kickoffMeetingDate'],
    'only the field that actually moved'
  );
  assert.equal(allEvents(third)[0].existingId, 'abc');

  // An event matched by name and day even when it was never imported before.
  const typedByHand = new Map([[BOARD, [{ ...existingByBoard.get(BOARD)![0], sourceKey: null }]]]);
  assert.equal(
    allEvents(buildPlan(parseSheets([ws]).rows, { sheets: into, existingByBoard: typedByHand }))[0].action,
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
    ...allEvents(plan)[0].values,
    // Somebody added these in the product; the file knows nothing about them.
    reviewDate: '2026-11-01',
    note: 'לתאם עם הספק'
  };
  const BOARD2 = '22222222-2222-4222-8222-222222222222';
  const again = buildPlan(parseSheets([ws]).rows, {
    sheets: [{ sheet: 'גאנט', boardId: BOARD2 }],
    existingByBoard: new Map([
      [BOARD2, [{ id: 'x', sourceKey: allEvents(plan)[0].sourceKey, title: 'חנוכה', actualDate: '2026-12-04', values: inSystem }]]
    ])
  });
  assert.equal(allEvents(again)[0].action, 'unchanged', 'a file with no opinion changes nothing');
}

/* ------------------------------------------- a row with no readable date --- */
{
  const ws = sheet('גאנט', [
    ['ת. התנעה', 'ת. סיום קמפיין', 'תאור'],
    ['04.09.2026', 'בערך בדצמבר', 'משהו']
  ]);
  const plan = buildPlan(parseSheets([ws]).rows);
  assert.equal(allEvents(plan)[0].action, 'skip', 'without a date there is nothing to put on a calendar');
  assert.ok(allEvents(plan)[0].issues.some((i) => i.severity === 'error'));
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

  /*
   * Three sheets, three boards. The workbook's own structure is the import's
   * structure — merging the sheets folded three teams' views of the year into a
   * single board of 51 events, which is not what the file says.
   */
  assert.deepEqual(
    plan.boards.map((b) => `${b.sheet} → ${b.boardName} → ${b.summary.events}`),
    [
      'גאנט 26-27-28 → גאנט 26-27-28 → 45',
      'לוח שנה 2026-27 → לוח שנה 2026-27 → 45',
      'גאנט קמפיין מכירות → גאנט קמפיין מכירות → 51'
    ],
    'each sheet becomes a board of its own name, holding its own rows'
  );
  assert.equal(plan.summary.events, 141, '215 rows describe 141 activities across three boards');
  assert.equal(plan.summary.create, 141, 'against empty boards, all of them are new');
  assert.equal(plan.summary.skip, 0, 'and none is unusable');
  assert.equal(plan.summary.tasks, 0, 'the file contains no tasks at all');

  // A source key must be unique inside its board, or the unique index refuses
  // the import outright.
  for (const board of plan.boards) {
    const keys = board.events.map((e) => e.sourceKey);
    assert.equal(new Set(keys).size, keys.length, `${board.boardName}: two events share a key`);
  }

  // The legend sheet is not a board, and it says why.
  assert.ok(
    parsed.skipped.some((x) => x.sheet === 'גיליון1' && x.reason.length > 0),
    'a sheet of definitions is reported as not-a-board, with the reason'
  );

  const events = allEvents(plan);

  // The four impossible dates, and the repairs the workbook itself supplies.
  const impossible = events.flatMap((e) => e.issues.filter((i) => /ספטמבר/.test(i.message)));
  assert.equal(impossible.length, 4, 'four rows say 31 September');
  assert.ok(
    impossible.every((i) => i.severity === 'warning'),
    'every one of them is answered elsewhere in the file, so nothing is lost'
  );
  assert.equal(plan.summary.errors, 0, 'and no date at all is dropped from this file');
  const fromFile = events.flatMap((e) => e.suggestions.filter((s) => s.fromFile));
  assert.equal(fromFile.length, 4, 'the two activities carry the repair on each of the two boards that need it');
  assert.ok(fromFile.every((s) => s.applied));

  // The three rows whose year is out by one.
  const backwards = events.filter((e) =>
    e.issues.some((i) => i.severity === 'warning' && /אחרי/.test(i.message))
  );
  assert.equal(backwards.length, 6, 'three broken rows, on the two boards that carry them');
  assert.ok(
    backwards.every((e) => e.suggestions.filter((s) => !s.fromFile).length === 1),
    'each is offered exactly one year to change — not one per field it clashes with'
  );
  assert.ok(
    backwards.every((e) => e.suggestions.every((s) => s.fromFile || !s.applied)),
    'and none of them is applied without a person ticking it'
  );

  // The three rows, and the field that actually carries the typo in each.
  const suspect = (startsWith: string, year: string) => {
    const found = backwards.find(
      (e) => e.title.startsWith(startsWith) && e.values.actualDate.startsWith(year)
    );
    assert.ok(found, `expected a flagged "${startsWith}" in ${year}`);
    return found!.suggestions.find((s) => !s.fromFile)!;
  };

  const purim = suspect('פורים', '2029');
  assert.equal(purim.field, 'kickoffMeetingDate', 'the meeting is the outlier, not the event');
  assert.equal(purim.to, '2028-12-02', 'so the meeting moves back a year, not the event forward');

  const pesach = suspect('פסח', '2029');
  assert.equal(pesach.field, 'kickoffDate');
  assert.equal(pesach.to, '2028-12-30');

  const conference = suspect('ועידת ישראל', '2027');
  assert.equal(conference.field, 'kickoffDate');
  assert.equal(conference.to, '2027-01-26');

  assert.equal(
    events.flatMap((e) => e.suggestions.filter((s) => !s.fromFile)).length,
    6,
    'one repair per broken row per board — not one per field it clashes with'
  );

  assert.equal(
    events.filter((e) => e.values.campaignEndDate).length,
    0,
    'the file has one column for the event and its end, so nothing is stored twice'
  );

  // Per board, so a number can be checked against one sheet rather than three.
  const byBoard = Object.fromEntries(
    plan.boards.map((b) => [
      b.boardName,
      {
        meeting: b.events.filter((e) => e.values.kickoffMeetingDate).length,
        air: b.events.filter((e) => e.values.kickoffDate).length,
        holiday: b.events.filter((e) => e.values.category === 'holiday').length
      }
    ])
  );
  assert.deepEqual(byBoard['גאנט 26-27-28'], { meeting: 45, air: 45, holiday: 0 });
  assert.deepEqual(byBoard['לוח שנה 2026-27'], { meeting: 35, air: 35, holiday: 18 });
  assert.deepEqual(byBoard['גאנט קמפיין מכירות'], { meeting: 45, air: 45, holiday: 18 });

  // The whole point: the meeting and the go-live are months apart.
  const gaps = events
    .filter((e) => e.values.kickoffMeetingDate && e.values.kickoffDate)
    .map((e) => (Date.parse(e.values.kickoffDate!) - Date.parse(e.values.kickoffMeetingDate!)) / 86_400_000);
  assert.ok(
    gaps.filter((g) => g > 20).length > 60,
    'in most activities the meeting is a month or more before the go-live — they are not the same date'
  );

  console.log(
    `import: הקובץ האמיתי — ${parsed.rows.length} שורות → ` +
      `${plan.boards.length} לוחות · ${plan.summary.events} אירועים · ` +
      `${plan.summary.errors} שגיאות · ${plan.summary.warnings} אזהרות · ${plan.summary.conflicts} סתירות ✓`
  );
} else {
  console.log('import: docs/real-data.xlsx אינו כאן — הבדיקה על הקובץ האמיתי דולגה');
}

console.log('import: כל הבדיקות עברו ✓');
