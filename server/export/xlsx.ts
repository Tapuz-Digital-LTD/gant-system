/**
 * The workbook this system hands back.
 *
 * Three rules shape everything below.
 *
 * **What we write, we must be able to read.** The header words are the
 * importer's own vocabulary (`HEADERS` in server/import/parse.ts), and the
 * importable columns sit in one unbroken run. The importer starts a new table
 * at the first column it does not recognise, so the deliberate blank column
 * after "פירוט" is what keeps the reporting columns *outside* the block instead
 * of tearing the block in half — and a torn block loses every column after the
 * tear, silently. export.test.ts feeds a workbook built here straight back
 * through the importer and compares every date.
 *
 * **A date is a date.** Excel sorts, filters and subtracts real dates and does
 * none of that with text that happens to look like one. A month-precision event
 * is written as a real date too, carrying a number format that shows only the
 * month — see `eventDate`.
 *
 * **Nobody hand-builds XML.** Hebrew, RTL and the shared-string table all come
 * out right for free as long as the file is written by exceljs. exceljs is
 * imported inside the function and nowhere else, for the reason
 * docs/deploy/performance.md gives: it is the heaviest dependency in the
 * project, and a request that draws a calendar must not pay to start it.
 */
import type { Workbook, Worksheet } from 'exceljs';
import type { EventCategory, TaskStatus, TaskPriority, DatePrecision } from '../../src/types.js';
import { csvCell } from '../../src/utils/csv.js';
import { israelNow } from '../notifications/prefs.js';

export type ExportScope = 'board' | 'boards' | 'events' | 'tasks' | 'all';

export interface ExportBoard {
  name: string;
  description: string | null;
  eventCount: number;
  archived: boolean;
  createdAt: Date | null;
}

export interface ExportEvent {
  boardName: string;
  title: string;
  category: EventCategory;
  status: TaskStatus;
  kickoffMeetingDate: string | null;
  workStartDate: string | null;
  reviewDate: string | null;
  freezeDate: string | null;
  kickoffDate: string | null;
  announceDate: string | null;
  /** Always a full YYYY-MM-DD. Month precision anchors to the 1st. */
  actualDate: string;
  actualPrecision: DatePrecision;
  campaignEndDate: string | null;
  prepMonths: number;
  note: string | null;
  description: string | null;
  taskCount: number;
  doneTaskCount: number;
}

export interface ExportTask {
  boardName: string;
  eventTitle: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeName: string | null;
  startDate: string | null;
  endDate: string | null;
  dueDate: string | null;
  completedAt: Date | null;
}

/** What was asked for, so the file itself can say what it is a picture of. */
export interface ExportMeta {
  scope: ExportScope;
  /** The boards actually in scope after the session decided — not what was asked for. */
  boardNames: string[];
  from: string | null;
  to: string | null;
  categories: EventCategory[];
  statuses: TaskStatus[];
  /** People the tasks were narrowed to, by name. */
  assignees: string[];
  generatedAt: Date;
  generatedBy: string;
}

/** One array per sheet: a sheet exists when its array has rows, and not otherwise. */
export interface ExportData {
  boards: ExportBoard[];
  events: ExportEvent[];
  tasks: ExportTask[];
  meta: ExportMeta;
}

export const SHEET = {
  boards: 'פרויקטים',
  events: 'אירועים',
  tasks: 'משימות'
} as const;

/**
 * Mirrors of src/utils/eventMeta.ts, for the same reason
 * server/notifications/milestone-labels.ts mirrors the milestone names: the
 * client list imports lucide-react, which has no business inside a serverless
 * function, and the client cannot import server code either.
 */
const CATEGORY_LABELS: Record<EventCategory, string> = {
  holiday: 'חג ומועד',
  campaign: 'קמפיין',
  b2b: 'ועדים וארגונים',
  social: 'סושיאל',
  operational: 'תפעול',
  other: 'אחר'
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'עוד לא התחיל',
  in_progress: 'בתהליך',
  ready_kickoff: 'מוכן לעלייה לאוויר',
  done: 'הושלם'
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'נמוכה',
  medium: 'בינונית',
  high: 'גבוהה',
  urgent: 'דחופה'
};

const SCOPE_LABELS: Record<ExportScope, string> = {
  board: 'פרויקט אחד',
  boards: 'פרויקטים',
  events: 'אירועים',
  tasks: 'משימות',
  all: 'הכול'
};

/* ------------------------------------------------------------------ cells */

const DAY_FORMAT = 'dd/mm/yyyy';
const MONTH_FORMAT = 'mm/yyyy';

/** A real Excel date, plus how much of it a person is allowed to read. */
interface DateCell {
  readonly date: Date;
  readonly numFmt: string;
}

type Cell = string | number | DateCell | null;

const isDateCell = (value: Cell): value is DateCell =>
  typeof value === 'object' && value !== null && 'numFmt' in value;

/**
 * A stored day, with no zone attached to shift it.
 *
 * These columns are civil dates — "פסח על 21 באפריל" is not an instant — so
 * they are pinned to UTC midnight. Local midnight would land the day before in
 * every timezone west of here, which is how an export ends up one day off.
 */
function utcDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

const day = (iso: string | null): DateCell | null => (iso ? { date: utcDay(iso), numFmt: DAY_FORMAT } : null);

/**
 * The event's own date, at the precision it is actually known to.
 *
 * A floating event happens *during* a month, and writing 01/12/2026 for it
 * would invent a day nobody chose — the first of the month is where a date
 * column has to put it, not a decision anybody made. So the value stays a real
 * date (Excel can still sort and filter it) and the number format shows only
 * the month.
 *
 * What this costs, stated plainly: re-importing reads the cell's value, not its
 * number format, so a month comes back as the 1st with day precision. The date
 * itself is unchanged — the 1st is exactly what the database holds — and a
 * display setting is not data the importer should be trusting. The alternative,
 * a "דיוק" column next to the date, would sit between two header columns and
 * split the importer's block in two, taking "ת. סיום קמפיין" and everything
 * after it out of the import entirely. Losing a flag beats losing four columns.
 */
const eventDate = (event: ExportEvent): DateCell =>
  event.actualPrecision === 'month'
    ? { date: utcDay(event.actualDate), numFmt: MONTH_FORMAT }
    : { date: utcDay(event.actualDate), numFmt: DAY_FORMAT };

/** A timestamp, as the calendar day it was in Israel — 01:00 here is still today. */
const stamp = (at: Date | null): DateCell | null => (at ? day(israelNow(at).date) : null);

/**
 * A cell of somebody's own words, disarmed.
 *
 * Excel, Sheets and LibreOffice all execute a cell that opens with `=`, `+`,
 * `-`, `@`, a tab or a carriage return, and every title, note and person's name
 * in this file is text somebody typed. src/utils/csv.ts owns that character
 * list; owning it twice is how the two copies come to disagree, so the guard is
 * borrowed rather than copied. That module only speaks in quoted CSV fields, so
 * the quoting is undone here — the apostrophe it prepends is the part we want,
 * and it survives the unwrapping.
 */
function text(value: string | null | undefined): string {
  const field = csvCell(value ?? '');
  return field.slice(1, -1).replace(/""/g, '"');
}

/* ----------------------------------------------------------------- sheets */

interface ColumnSpec {
  /** `null` is the deliberate gap that ends the importer's block. */
  header: string | null;
  width: number;
}

function sheetFor(wb: Workbook, name: string, columns: ColumnSpec[]): Worksheet {
  const ws = wb.addWorksheet(name);
  // Hebrew reads right to left, and a sheet that opens left-anchored makes a
  // person scroll sideways to find the first column of their own file.
  ws.views = [{ rightToLeft: true, state: 'frozen', ySplit: 1 }];

  const header = ws.addRow(columns.map((c) => c.header));
  header.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF6' } };
  });
  columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
  });
  return ws;
}

function addRow(ws: Worksheet, values: Cell[]): void {
  const row = ws.addRow(values.map((v) => (isDateCell(v) ? v.date : v)));
  values.forEach((v, i) => {
    if (isDateCell(v)) row.getCell(i + 1).numFmt = v.numFmt;
  });
}

/**
 * The event columns, in the one order that survives a round trip.
 *
 * Everything up to "פירוט" is a word the importer knows, and they are adjacent
 * on purpose. The `null` after them is the spacer; the columns after it are
 * reporting, and the importer is meant to ignore them.
 */
const EVENT_COLUMNS: ColumnSpec[] = [
  { header: 'שם האירוע', width: 32 },
  { header: 'סוג האירוע', width: 16 },
  { header: 'מצב', width: 18 },
  { header: 'ישיבת התנעה', width: 13 },
  { header: 'תחילת עבודה', width: 13 },
  { header: 'ת. בקרה', width: 13 },
  { header: 'ת. הקפאה', width: 13 },
  { header: 'ת. השקה', width: 13 },
  { header: 'הודעה לחברה', width: 13 },
  { header: 'תאריך האירוע', width: 13 },
  { header: 'ת. סיום קמפיין', width: 13 },
  { header: 'הכנה', width: 8 },
  { header: 'הערה', width: 30 },
  { header: 'פירוט', width: 40 },
  { header: null, width: 3 },
  { header: 'שם הפרויקט', width: 24 },
  { header: 'משימות', width: 9 },
  { header: 'משימות שהושלמו', width: 15 },
  { header: 'אחוז השלמה', width: 12 }
];

const BOARD_COLUMNS: ColumnSpec[] = [
  { header: 'שם הפרויקט', width: 28 },
  { header: 'תיאור הפרויקט', width: 48 },
  { header: 'מספר אירועים', width: 14 },
  { header: 'מצב', width: 12 },
  { header: 'נוצר', width: 13 }
];

/**
 * The task columns.
 *
 * None of these date headers is a word the importer knows, and that is
 * deliberate: the file holds no importable tasks today, and a sheet that half
 * looks like an event table is a sheet the importer would try to read.
 */
const TASK_COLUMNS: ColumnSpec[] = [
  { header: 'אירוע', width: 30 },
  { header: 'שם הפרויקט', width: 22 },
  { header: 'שם המשימה', width: 34 },
  { header: 'סטטוס', width: 18 },
  { header: 'עדיפות', width: 10 },
  { header: 'אחראי', width: 20 },
  { header: 'תאריך התחלה', width: 13 },
  { header: 'תאריך סיום', width: 13 },
  { header: 'תאריך יעד', width: 13 },
  { header: 'הושלם בתאריך', width: 13 }
];

/** What this file is a picture of, in the words of the person who asked for it. */
function describe(meta: ExportMeta): string {
  const parts = [`היקף: ${SCOPE_LABELS[meta.scope]}`];
  if (meta.boardNames.length) parts.push(`פרויקטים: ${meta.boardNames.join(', ')}`);
  if (meta.from || meta.to) parts.push(`תקופה: ${meta.from ?? '—'} עד ${meta.to ?? '—'}`);
  if (meta.categories.length) parts.push(`סוגים: ${meta.categories.map((c) => CATEGORY_LABELS[c]).join(', ')}`);
  if (meta.statuses.length) parts.push(`מצבים: ${meta.statuses.map((s) => STATUS_LABELS[s]).join(', ')}`);
  if (meta.assignees.length) parts.push(`אחראים: ${meta.assignees.join(', ')}`);
  return parts.join(' · ');
}

/**
 * The whole file, as bytes.
 *
 * Needs at least one non-empty array: a workbook with no sheets is a file Excel
 * refuses to open, and handing somebody a broken download is worse than telling
 * them their filter matched nothing. The route says that in Hebrew before it
 * gets here.
 */
export async function buildWorkbook(data: ExportData): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();

  wb.creator = data.meta.generatedBy;
  wb.created = data.meta.generatedAt;
  wb.modified = data.meta.generatedAt;
  wb.title = 'תכנון אירועים — XTRA';
  wb.description = describe(data.meta);

  if (data.boards.length) {
    const ws = sheetFor(wb, SHEET.boards, BOARD_COLUMNS);
    for (const b of data.boards) {
      addRow(ws, [
        text(b.name),
        text(b.description),
        b.eventCount,
        b.archived ? 'בארכיון' : 'פעיל',
        stamp(b.createdAt)
      ]);
    }
  }

  if (data.events.length) {
    const ws = sheetFor(wb, SHEET.events, EVENT_COLUMNS);
    for (const e of data.events) {
      const done = e.taskCount > 0 ? e.doneTaskCount / e.taskCount : null;
      addRow(ws, [
        text(e.title),
        CATEGORY_LABELS[e.category],
        STATUS_LABELS[e.status],
        day(e.kickoffMeetingDate),
        day(e.workStartDate),
        day(e.reviewDate),
        day(e.freezeDate),
        day(e.kickoffDate),
        day(e.announceDate),
        eventDate(e),
        day(e.campaignEndDate),
        e.prepMonths,
        text(e.note),
        text(e.description),
        null,
        text(e.boardName),
        e.taskCount,
        e.doneTaskCount,
        done
      ]);
      if (done !== null) ws.getCell(ws.rowCount, EVENT_COLUMNS.length).numFmt = '0%';
    }
  }

  if (data.tasks.length) {
    const ws = sheetFor(wb, SHEET.tasks, TASK_COLUMNS);
    for (const t of data.tasks) {
      addRow(ws, [
        text(t.eventTitle),
        text(t.boardName),
        text(t.title),
        STATUS_LABELS[t.status],
        PRIORITY_LABELS[t.priority],
        text(t.assigneeName),
        day(t.startDate),
        day(t.endDate),
        day(t.dueDate),
        stamp(t.completedAt)
      ]);
    }
  }

  if (wb.worksheets.length === 0) throw new Error('buildWorkbook: nothing to write');

  return Buffer.from(await wb.xlsx.writeBuffer());
}
