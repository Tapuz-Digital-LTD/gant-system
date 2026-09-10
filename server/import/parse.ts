/**
 * An Excel workbook, turned into rows this product understands.
 *
 * The file this was built for is not a table. The same activity appears on
 * three sheets in two different column layouts, one of which is computed from
 * the other by formula — so "read the sheets and insert the rows" produces four
 * copies of every campaign. See docs/analysis/excel-source.md.
 *
 * The approach here is the opposite: find the *header cells*, wherever they are,
 * work out which column means what, and read only what those columns say. A
 * sheet with no recognisable header is reported as skipped, with the reason, and
 * never guessed at.
 *
 * exceljs is imported lazily by the caller: it is the heaviest dependency in the
 * project and has no business on the cold-start path of a calendar request.
 */

/** The fields a header cell can name. */
export type Column =
  | 'title'
  | 'kickoffMeetingDate'
  | 'workStartDate'
  | 'reviewDate'
  | 'freezeDate'
  | 'kickoffDate'
  | 'announceDate'
  | 'actualDate'
  | 'campaignEndDate'
  | 'prepMonths'
  | 'hebrewAnchor'
  | 'category'
  | 'status'
  | 'note'
  | 'description';

/**
 * What a header cell may say, for each column.
 *
 * Two vocabularies on purpose: the words the customer's own planning file uses,
 * and the words this system writes when it exports. An export must import back
 * without a mapping step, which is the only way a round trip loses nothing.
 */
const HEADERS: Record<Column, string[]> = {
  title: ['תאור', 'תיאור', 'שם האירוע', 'אירוע', 'שם'],
  kickoffMeetingDate: ['ת. התנעה', 'ת.התנעה', 'תאריך התנעה', 'ישיבת התנעה'],
  workStartDate: ['תחילת עבודה', 'ת. תחילת עבודה', 'מתי מתחילים לעבוד'],
  reviewDate: ['ת. בקרה', 'ת.בקרה', 'תאריך בקרה', 'בקרה'],
  freezeDate: ['ת. הקפאה', 'ת.הקפאה', 'תאריך הקפאה', 'הקפאת שינויים'],
  kickoffDate: ['ת. השקה', 'ת.השקה', 'תאריך השקה', 'עלייה לאוויר', 'עליה לאוויר'],
  announceDate: ['הודעה לחברה', 'ת. הודעה לחברה'],
  actualDate: ['תאריך האירוע', 'ת. אירוע', 'מועד האירוע', 'תאריך החג', 'תחילת המבצע'],
  campaignEndDate: ['ת. סיום קמפיין', 'תאריך סיום קמפיין', 'סיום הקמפיין', 'סיום קמפיין'],
  prepMonths: ['הכנה', 'חודשי הכנה', 'זמן הכנה'],
  hebrewAnchor: ['עברי'],
  category: ['סוג האירוע', 'קטגוריה', 'סוג'],
  status: ['מצב', 'סטטוס', 'מצב העבודה'],
  note: ['הערה', 'הערות'],
  description: ['פירוט', 'תיאור מלא']
};

const clean = (s: string) => s.trim().replace(/\s+/g, ' ');

/** Which column a header cell names, or null when it names none of them. */
export function columnFor(header: string): Column | null {
  const needle = clean(header);
  if (!needle) return null;
  for (const [column, words] of Object.entries(HEADERS) as [Column, string[]][]) {
    if (words.some((w) => clean(w) === needle)) return column;
  }
  return null;
}

/** A cell, flattened to the text a person would see in Excel. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    // Excel dates arrive as UTC midnight; taking the ISO date keeps the day.
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (Array.isArray(v.richText)) return (v.richText as { text: string }[]).map((r) => r.text).join('');
    // A formula cell carries its last computed result. That is what the person
    // reading the file saw, so that is what we import.
    if ('result' in v && v.result !== undefined && v.result !== null) return cellText(v.result);
    if (typeof v.text === 'string') return v.text;
    if ('error' in v) return '';
    return '';
  }
  return String(value).trim();
}

/** One header row found on a sheet, and where each of its columns is. */
export interface Block {
  sheet: string;
  headerRow: number;
  /** 1-based column index per field. */
  columns: Partial<Record<Column, number>>;
}

/** One data row read through a block. */
export interface SourceRow {
  sheet: string;
  /** 1-based row number, as Excel shows it. */
  row: number;
  /** "גיליון!12" — what a person types into the Name Box to go and look. */
  where: string;
  values: Partial<Record<Column, string>>;
}

/** A sheet that produced nothing, and the reason, so no data goes missing quietly. */
export interface SkippedSheet {
  sheet: string;
  rows: number;
  reason: string;
}

export interface ParsedWorkbook {
  blocks: Block[];
  rows: SourceRow[];
  skipped: SkippedSheet[];
  sheetNames: string[];
}

/** The minimum a worksheet has to look like for this module to read it. */
export interface SheetLike {
  name: string;
  rowCount: number;
  columnCount: number;
  cell(row: number, column: number): unknown;
}

/**
 * Header rows are found, not assumed.
 *
 * A row is a header when it holds a title column and at least one date column.
 * Both halves matter: "תאור" alone appears in prose, and a lone date header
 * belongs to a legend rather than to a table.
 *
 * One row can carry several tables — the planning file puts two side by side —
 * so a new block starts at either of two signals:
 *
 *   · a column name that is already claimed, or
 *   · **a gap.** Two tables on one row are always separated by at least one
 *     column that is not a header. Without this rule the left-hand table
 *     swallowed the right-hand one's date columns, and every row came out
 *     holding another activity's kickoff meeting — 91 events instead of 51,
 *     each stitched from two different campaigns.
 *
 * Headers inside one table therefore have to be adjacent, which is what the
 * system's own export writes.
 */
export function findBlocks(sheet: SheetLike, maxScanRows = 40): Block[] {
  const blocks: Block[] = [];

  for (let row = 1; row <= Math.min(sheet.rowCount, maxScanRows); row++) {
    let current: Partial<Record<Column, number>> = {};
    let previousColumn = -1;
    const found: Partial<Record<Column, number>>[] = [];

    for (let col = 1; col <= sheet.columnCount; col++) {
      const column = columnFor(cellText(sheet.cell(row, col)));
      if (!column) continue;

      const gap = previousColumn >= 0 && col - previousColumn > 1;
      if (current[column] !== undefined || gap) {
        found.push(current);
        current = {};
      }
      current[column] = col;
      previousColumn = col;
    }
    found.push(current);

    for (const columns of found) {
      const dates = (Object.keys(columns) as Column[]).filter((c) => c.endsWith('Date'));
      if (columns.title !== undefined && dates.length > 0) {
        blocks.push({ sheet: sheet.name, headerRow: row, columns });
      }
    }
  }

  return blocks;
}

/** Every non-empty data row under a block's header. */
export function readBlock(sheet: SheetLike, block: Block): SourceRow[] {
  const out: SourceRow[] = [];
  const entries = Object.entries(block.columns) as [Column, number][];

  for (let row = block.headerRow + 1; row <= sheet.rowCount; row++) {
    const values: Partial<Record<Column, string>> = {};
    for (const [column, col] of entries) {
      const text = cellText(sheet.cell(row, col));
      if (text) values[column] = text;
    }
    // A row with no name is a spacer, a month heading or the tail of a merge.
    if (!values.title) continue;
    out.push({ sheet: sheet.name, row, where: `${sheet.name}!${row}`, values });
  }
  return out;
}

export function parseSheets(sheets: SheetLike[]): ParsedWorkbook {
  const blocks: Block[] = [];
  const rows: SourceRow[] = [];
  const skipped: SkippedSheet[] = [];

  for (const sheet of sheets) {
    const found = findBlocks(sheet);
    if (found.length === 0) {
      skipped.push({
        sheet: sheet.name,
        rows: sheet.rowCount,
        reason: 'לא נמצאה בגיליון שורת כותרות עם שם אירוע ותאריך'
      });
      continue;
    }

    const before = rows.length;
    for (const block of found) {
      blocks.push(block);
      rows.push(...readBlock(sheet, block));
    }
    if (rows.length === before) {
      skipped.push({ sheet: sheet.name, rows: sheet.rowCount, reason: 'נמצאו כותרות אבל אין מתחתיהן שורות' });
    }
  }

  return { blocks, rows, skipped, sheetNames: sheets.map((s) => s.name) };
}
