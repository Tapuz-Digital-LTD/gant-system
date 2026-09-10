// Run: npx tsx server/export/export.test.ts
//
// Two halves. The first builds a workbook from hand-made rows and pins what a
// person opening the file gets: the sheets, the direction, real dates, Hebrew,
// and a title that cannot execute. The second is the requirement the whole
// module is shaped by — **an export must import back without losing anything**
// — and it proves it by feeding the bytes straight into the importer.
import assert from 'node:assert/strict';
import { buildWorkbook, SHEET, type ExportData, type ExportEvent } from './xlsx.ts';
import { createExportRouter } from './routes.ts';
import { columnFor } from '../import/parse.ts';
import { readWorkbook } from '../import/workbook.ts';
import { allEvents, buildPlan } from '../import/plan.ts';

const ExcelJS = (await import('exceljs')).default;

/** Everything the exporter needs, said once, so a case reads as a case. */
const event = (over: Partial<ExportEvent> & Pick<ExportEvent, 'title' | 'actualDate'>): ExportEvent => ({
  boardName: 'אירועים וקמפיינים',
  category: 'campaign',
  status: 'in_progress',
  kickoffMeetingDate: null,
  workStartDate: null,
  reviewDate: null,
  freezeDate: null,
  kickoffDate: null,
  announceDate: null,
  actualPrecision: 'day',
  campaignEndDate: null,
  prepMonths: 0,
  note: null,
  description: null,
  taskCount: 0,
  doneTaskCount: 0,
  ...over
});

/** One event with every date filled in — the row the round trip is really about. */
const hanukkah = event({
  title: 'חנוכה 2026',
  category: 'holiday',
  kickoffMeetingDate: '2026-09-04',
  workStartDate: '2026-09-20',
  reviewDate: '2026-10-11',
  freezeDate: '2026-10-25',
  kickoffDate: '2026-11-04',
  announceDate: '2026-11-05',
  actualDate: '2026-12-04',
  campaignEndDate: '2026-12-31',
  prepMonths: 3,
  note: 'נר ראשון',
  description: 'מבצע חנוכה מול ועדי עובדים',
  taskCount: 4,
  doneTaskCount: 3
});

/** A floating event: it happens *during* a month, and no day was ever chosen. */
const summer = event({
  title: 'מבצע קיץ 2027',
  actualDate: '2027-07-01',
  actualPrecision: 'month',
  prepMonths: 2,
  kickoffMeetingDate: '2027-04-11'
});

/** A title that a spreadsheet would run if nobody stopped it. */
const injected = event({
  title: '=HYPERLINK("http://evil","דוח")',
  actualDate: '2027-01-15',
  kickoffMeetingDate: '2026-11-01'
});

const data: ExportData = {
  boards: [
    { name: 'אירועים וקמפיינים', description: 'הלוח הראשי', eventCount: 3, archived: false, createdAt: new Date('2026-01-05T22:30:00Z') },
    { name: 'תפעול ו-B2B', description: '', eventCount: 0, archived: true, createdAt: null }
  ],
  events: [hanukkah, summer, injected],
  tasks: [
    {
      boardName: 'אירועים וקמפיינים',
      eventTitle: 'חנוכה 2026',
      title: 'עיצוב באנרים',
      status: 'done',
      priority: 'high',
      assigneeName: 'דנה כהן',
      startDate: '2026-10-01',
      endDate: '2026-10-20',
      dueDate: '2026-10-20',
      completedAt: new Date('2026-10-19T08:00:00Z')
    },
    {
      boardName: 'אירועים וקמפיינים',
      eventTitle: 'חנוכה 2026',
      title: '=cmd|calc',
      status: 'todo',
      priority: 'urgent',
      assigneeName: null,
      startDate: null,
      endDate: null,
      dueDate: null,
      completedAt: null
    }
  ],
  meta: {
    scope: 'all',
    boardNames: ['אירועים וקמפיינים', 'תפעול ו-B2B'],
    from: '2026-01-01',
    to: '2027-12-31',
    categories: [],
    statuses: [],
    assignees: [],
    generatedAt: new Date('2026-09-10T06:00:00Z'),
    generatedBy: 'דנה כהן'
  }
};

const file = await buildWorkbook(data);
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(file);

/* ------------------------------------------------------------- the route --- */
{
  /*
   * The schema is built when the module loads, so a schema that throws there
   * takes down every route mounted beside it on the first request — not on this
   * line. TypeScript cannot see it: zod refuses `.partial()` on a refined
   * schema at runtime and says nothing at compile time. Asking for the router
   * is the whole check.
   */
  assert.ok(createExportRouter(), 'the router builds');
}

/* ---------------------------------------------------------- the sheets ---- */
{
  assert.deepEqual(
    wb.worksheets.map((ws) => ws.name),
    [SHEET.boards, SHEET.events, SHEET.tasks],
    'the sheets come out named and in order'
  );

  for (const ws of wb.worksheets) {
    const view = ws.views[0];
    assert.equal(view?.rightToLeft, true, `${ws.name}: a Hebrew sheet opens right to left`);
    assert.equal(view?.state, 'frozen', `${ws.name}: the header row stays put while the rows scroll`);
    assert.equal(view?.ySplit, 1, `${ws.name}: exactly the header row is frozen`);
    assert.equal(ws.getRow(1).getCell(1).font?.bold, true, `${ws.name}: the header row is a header`);
  }

  // A sheet with no rows is not written at all, rather than written empty.
  const eventsOnly = new ExcelJS.Workbook();
  await eventsOnly.xlsx.load(await buildWorkbook({ ...data, boards: [], tasks: [] }));
  assert.deepEqual(eventsOnly.worksheets.map((ws) => ws.name), [SHEET.events], 'an empty sheet is absent, not blank');
}

/* --------------------------------------------------- the column contract --- */
{
  const ws = wb.getWorksheet(SHEET.events)!;
  const header = (col: number) => ws.getRow(1).getCell(col).value;

  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(header),
    [
      'שם האירוע', 'סוג האירוע', 'מצב',
      'ישיבת התנעה', 'תחילת עבודה', 'ת. בקרה', 'ת. הקפאה', 'ת. השקה',
      'הודעה לחברה', 'תאריך האירוע', 'ת. סיום קמפיין',
      'הכנה', 'הערה', 'פירוט'
    ],
    'the importable columns, in one unbroken run'
  );

  // Every one of them is a word the importer already knows. Without this the
  // round trip below fails somewhere far less obvious.
  const expected = [
    'title', 'category', 'status',
    'kickoffMeetingDate', 'workStartDate', 'reviewDate', 'freezeDate', 'kickoffDate',
    'announceDate', 'actualDate', 'campaignEndDate',
    'prepMonths', 'note', 'description'
  ];
  expected.forEach((column, i) => {
    assert.equal(columnFor(String(header(i + 1))), column, `"${header(i + 1)}" must mean ${column}`);
  });

  // The spacer, and what it protects: the reporting columns must be invisible
  // to the importer, or they end up inside the block and tear it in two.
  assert.equal(header(15), null, 'column 15 is the deliberate gap');
  assert.equal(columnFor(String(header(16))), null, 'the project column is not an importable header');
  assert.equal(header(16), 'שם הפרויקט');
}

/* ------------------------------------------------------------- the cells --- */
{
  const ws = wb.getWorksheet(SHEET.events)!;
  const row = ws.getRow(2);

  assert.equal(row.getCell(1).value, 'חנוכה 2026', 'Hebrew survives, because nobody hand-built the XML');
  assert.equal(row.getCell(2).value, 'חג ומועד', 'and the category is a word, not an enum');

  const actual = row.getCell(10);
  assert.ok(actual.value instanceof Date, 'a date cell holds a real date, not text that looks like one');
  assert.equal((actual.value as Date).toISOString().slice(0, 10), '2026-12-04', 'and it is the day that was stored');
  assert.equal(actual.numFmt, 'dd/mm/yyyy', 'shown as a day, because the day is known');
  assert.equal(row.getCell(12).value, 3, 'preparation months stay a number Excel can add up');
  assert.equal(row.getCell(19).value, 0.75, 'three of four tasks done');
  assert.equal(row.getCell(19).numFmt, '0%', 'and shown as a share, not as 0.75');

  // The floating event: a real date Excel can sort, showing only what is known.
  const floating = ws.getRow(3);
  assert.ok(floating.getCell(10).value instanceof Date);
  assert.equal(floating.getCell(10).numFmt, 'mm/yyyy', 'a month must not be shown as a day nobody chose');

  // The reason src/utils/csv.ts exists, applied to every user-typed cell.
  assert.equal(
    ws.getRow(4).getCell(1).value,
    `'=HYPERLINK("http://evil","דוח")`,
    'a title that opens with = is neutralised, not executed'
  );
  const tasks = wb.getWorksheet(SHEET.tasks)!;
  assert.equal(tasks.getRow(3).getCell(3).value, `'=cmd|calc`, 'and so is a task title');

  const boards = wb.getWorksheet(SHEET.boards)!;
  assert.equal(boards.getRow(2).getCell(4).value, 'פעיל');
  assert.equal(boards.getRow(3).getCell(4).value, 'בארכיון');
  // 22:30 UTC is the 6th in Israel, and the 6th is the day it was created here.
  assert.equal((boards.getRow(2).getCell(5).value as Date).toISOString().slice(0, 10), '2026-01-06');
}

/* --------------------------------------------------------- the round trip --- */
{
  const parsed = await readWorkbook(file);
  const plan = buildPlan(parsed.rows);
  // One sheet in, one board out — the flat list is that board's events.
  const planned = allEvents(plan);

  assert.equal(plan.boards.length, 1, 'one importable sheet becomes one board');
  assert.equal(plan.boards[0].boardName, SHEET.events, 'named after the sheet it came from');
  assert.equal(plan.summary.events, data.events.length, 'every event comes back, and nothing else does');
  assert.equal(plan.summary.skip, 0, 'and every one of them is importable');

  // The two reporting sheets must produce nothing at all. A tasks sheet that
  // half looked like an event table would invent events out of task rows.
  assert.deepEqual(
    parsed.skipped.map((s) => s.sheet).sort(),
    [SHEET.boards, SHEET.tasks].sort(),
    'the projects and tasks sheets carry no importable table'
  );

  const DATES = [
    'kickoffMeetingDate', 'workStartDate', 'reviewDate', 'freezeDate',
    'kickoffDate', 'announceDate', 'actualDate', 'campaignEndDate'
  ] as const;

  for (const source of data.events) {
    // The one title that changes on the way out is the one that had to.
    const title = /^[=+\-@\t\r]/.test(source.title) ? `'${source.title}` : source.title;
    const back = planned.find((e) => e.title === title);
    assert.ok(back, `"${title}" did not survive the round trip`);
    for (const field of DATES) {
      assert.equal(back!.values[field], source[field], `${title}: ${field} came back different`);
    }
    assert.equal(back!.values.prepMonths, source.prepMonths, `${title}: preparation months`);
    /*
     * The kind of work, in words and back again.
     *
     * This is the assertion that was missing when a real board went out and
     * came back with all eighteen of its holidays turned into campaigns: the
     * sheet said "חג ומועד", nothing on the way in knew what that meant, and
     * the schema default quietly won. server/vocabulary.ts owns the pairing now.
     */
    assert.equal(back!.values.category, source.category, `${title}: the category came back different`);
    assert.equal(back!.values.status, source.status, `${title}: the state came back different`);
  }

  assert.equal(
    planned.find((e) => e.title === 'חנוכה 2026')!.values.note,
    'נר ראשון',
    'the free text comes back too'
  );

  /*
   * The one thing that does not survive, pinned so it stays a decision.
   *
   * A month-precision event is written as a real date on the 1st with a
   * month-only number format. The importer reads cell values, not display
   * settings — rightly, a format is not data — so it comes back as the 1st with
   * day precision. The date itself is identical, which is what the assertions
   * above check. See `eventDate` in xlsx.ts for why the alternative, a "דיוק"
   * column beside the date, would cost four whole columns instead.
   */
  const floating = planned.find((e) => e.title === 'מבצע קיץ 2027')!;
  assert.equal(floating.values.actualDate, '2027-07-01', 'the stored day is unchanged');
  assert.equal(floating.values.actualPrecision, 'day', 'the precision flag is what a number format cannot carry');
}

console.log(
  `export: ${wb.worksheets.length} גיליונות · ${data.events.length} אירועים חזרו מהייבוא עם כל 8 התאריכים ✓`
);
