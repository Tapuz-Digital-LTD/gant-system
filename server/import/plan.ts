/**
 * Rows from a workbook, reconciled into the events they describe.
 *
 * Three jobs, in order:
 *   1. work out which rows are the same activity said twice
 *   2. work out which value wins where two rows disagree, and say so out loud
 *   3. refuse to invent anything — a broken date is reported, and a repair is
 *      offered only when the file itself contains the answer
 *
 * Nothing here touches the database. `apply.ts` does that, from the plan this
 * produces, so what a person approves on screen is exactly what runs.
 */
import type { SourceRow, Column } from './parse.js';
import { categoryFromText, statusFromText, type CategoryValue } from '../vocabulary.js';

export type Severity = 'error' | 'warning';

export interface ImportIssue {
  severity: Severity;
  /** Where a person should look in their own file. */
  where: string;
  field?: string;
  message: string;
}

export interface Suggestion {
  field: string;
  fieldLabel: string;
  from: string;
  to: string;
  /** Why this is being offered, in an employee's words. */
  reason: string;
  /** True when the answer came from the file itself rather than from a rule. */
  fromFile: boolean;
  /**
   * Whether the plan already uses it.
   *
   * A repair the file supplies is applied and shown ticked — refusing to read
   * "01.10.2027" off the next sheet because a person has not clicked yet is
   * pedantry, not care. A repair derived from a rule is shown unticked and
   * changes nothing until somebody says so.
   */
  applied: boolean;
}

export interface Conflict {
  field: string;
  fieldLabel: string;
  values: { value: string; where: string[] }[];
  chosen: string;
}

export type Action = 'create' | 'update' | 'unchanged' | 'skip';

export interface EventValues {
  title: string;
  category: CategoryValue;
  status?: 'todo' | 'in_progress' | 'ready_kickoff' | 'done';
  actualDate: string;
  actualPrecision: 'day' | 'month';
  prepMonths: number;
  kickoffMeetingDate: string | null;
  workStartDate: string | null;
  reviewDate: string | null;
  freezeDate: string | null;
  kickoffDate: string | null;
  announceDate: string | null;
  campaignEndDate: string | null;
  note: string | null;
  description: string | null;
}

export interface PlannedEvent {
  /** Stable across re-imports of the same file. Stored on the row. */
  sourceKey: string;
  /**
   * This row's address in the plan: which sheet, and which activity in it.
   *
   * A source key is unique inside a board, and the same activity can appear on
   * two sheets — which are now two boards. Decisions a person makes on screen
   * are keyed by this, so ticking a repair on one board cannot silently apply
   * it on another.
   */
  planKey: string;
  /** The sheet the rows came from. */
  sheet: string;
  title: string;
  action: Action;
  values: EventValues;
  /** Every sheet and row this event was assembled from. */
  sources: string[];
  issues: ImportIssue[];
  conflicts: Conflict[];
  suggestions: Suggestion[];
  /**
   * The fields the file actually said something about.
   *
   * An update writes only these. Without it, importing a file that never
   * mentions a category would reset every campaign somebody had classified by
   * hand back to the default — an import that quietly undoes people's work.
   */
  stated: string[];
  /** Set when an existing event matched. */
  existingId?: string;
  /** For an update: what would actually change. */
  changes?: { field: string; fieldLabel: string; from: string; to: string }[];
}

export interface PlanSummary {
  sourceRows: number;
  events: number;
  create: number;
  update: number;
  unchanged: number;
  skip: number;
  tasks: number;
  errors: number;
  warnings: number;
  conflicts: number;
  suggestions: number;
}

/**
 * One sheet, and the board it becomes.
 *
 * The structure of the workbook is the structure of the import: a workbook is a
 * set of sheets, and each sheet that holds a table is a board. Reading three
 * sheets into one board merges campaigns that the people who wrote the file
 * deliberately kept apart, and it does it invisibly — which is exactly what
 * happened the first time this ran.
 */
export interface BoardPlan {
  sheet: string;
  /** Defaults to the sheet's own name, and a person may change it. */
  boardName: string;
  /** Set when a board of that name is already there; null means it is created. */
  boardId: string | null;
  include: boolean;
  events: PlannedEvent[];
  summary: PlanSummary;
}

export interface ImportPlan {
  boards: BoardPlan[];
  /** Sheets that produced no table, and the reason, so nothing goes missing quietly. */
  skipped: { sheet: string; rows: number; reason: string }[];
  /** Totals across the boards that are actually going in. */
  summary: PlanSummary;
}

/** The names a person sees. Mirrors src/data/milestones.ts on purpose. */
export const FIELD_LABELS: Record<string, string> = {
  title: 'שם האירוע',
  category: 'סוג האירוע',
  status: 'מצב',
  actualDate: 'תאריך האירוע',
  actualPrecision: 'דיוק התאריך',
  prepMonths: 'חודשי הכנה',
  kickoffMeetingDate: 'ישיבת התנעה',
  workStartDate: 'תחילת עבודה',
  reviewDate: 'בקרה',
  freezeDate: 'הקפאת שינויים',
  kickoffDate: 'עלייה לאוויר',
  announceDate: 'הודעה לחברה',
  campaignEndDate: 'סיום הקמפיין',
  note: 'הערה',
  description: 'תיאור'
};

const DATE_FIELDS = [
  'kickoffMeetingDate',
  'workStartDate',
  'reviewDate',
  'freezeDate',
  'kickoffDate',
  'announceDate',
  'campaignEndDate'
] as const;

export const normaliseTitle = (t: string) => t.trim().replace(/\s+/g, ' ');

/* ------------------------------------------------------------------ dates */

export interface ParsedDate {
  raw: string;
  iso?: string;
  /** Month precision: the raw text named a month and no day. */
  monthOnly?: boolean;
  error?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

function realDate(y: number, m: number, d: number): boolean {
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

const MONTH_LENGTH = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/**
 * Every date shape the planning file and the system's own export use.
 * Anything else is reported as unreadable rather than interpreted.
 */
export function parseDate(raw: string | undefined): ParsedDate | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;

  let m: RegExpExecArray | null;

  // 2026-12-04 — what Excel's own date cells and our export produce.
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text))) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return realDate(y, mo, d)
      ? { raw: text, iso: `${y}-${pad(mo)}-${pad(d)}` }
      : { raw: text, error: `אין ${d} ב${MONTH_LENGTH[mo] ?? `חודש ${mo}`}` };
  }

  // 04.12.2026 · 04/12/2026 · 4-12-2026 — how people write dates here.
  if ((m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text))) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (mo < 1 || mo > 12) return { raw: text, error: `אין חודש ${mo}` };
    return realDate(y, mo, d)
      ? { raw: text, iso: `${y}-${pad(mo)}-${pad(d)}` }
      : { raw: text, error: `אין ${d} ב${MONTH_LENGTH[mo]}` };
  }

  // 12.2026 · 2026-12 — a whole month, with no day chosen.
  if ((m = /^(\d{1,2})[./-](\d{4})$/.exec(text))) {
    const [mo, y] = [Number(m[1]), Number(m[2])];
    if (mo < 1 || mo > 12) return { raw: text, error: `אין חודש ${mo}` };
    return { raw: text, iso: `${y}-${pad(mo)}-01`, monthOnly: true };
  }
  if ((m = /^(\d{4})-(\d{1,2})$/.exec(text))) {
    const [y, mo] = [Number(m[1]), Number(m[2])];
    if (mo < 1 || mo > 12) return { raw: text, error: `אין חודש ${mo}` };
    return { raw: text, iso: `${y}-${pad(mo)}-01`, monthOnly: true };
  }

  return { raw: text, error: 'לא הצלחנו לקרוא את זה כתאריך' };
}

/** A year outside this range is a typo, not a plan. */
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/* ------------------------------------------------- rows → candidate events */

interface Candidate {
  where: string;
  sheet: string;
  /** A block that carries חודשי הכנה or the Hebrew flag is the typed one. */
  master: boolean;
  title: string;
  fields: Partial<Record<string, ParsedDate>>;
  prepMonths?: number;
  hebrew: boolean;
  note?: string;
  description?: string;
  category?: string;
  status?: string;
}

/**
 * One row, read as an event.
 *
 * The one piece of local knowledge in this file: **a block with no "תאריך
 * האירוע" column uses "ת. סיום קמפיין" for the event's own date.** That is what
 * the customer's file means by it — Hanukkah's "campaign end" is the first
 * candle — and the formulas prove it: the go-live column is computed as that
 * date minus the preparation months. Importing it as a campaign end would give
 * every one of the 51 events the same date twice.
 *
 * A block that has both columns is taken at its word, which is what makes the
 * system's own export round-trip.
 */
function toCandidate(row: SourceRow): Candidate {
  const v = row.values;
  const get = (c: Column) => parseDate(v[c]);

  const actualColumn = get('actualDate');
  const endColumn = get('campaignEndDate');
  const hasActualColumn = v.actualDate !== undefined;

  const fields: Partial<Record<string, ParsedDate>> = {};
  for (const f of DATE_FIELDS) {
    if (f === 'campaignEndDate') continue;
    const parsed = get(f as Column);
    if (parsed) fields[f] = parsed;
  }
  const actual = hasActualColumn ? actualColumn : endColumn;
  if (actual) fields.actualDate = actual;
  if (hasActualColumn && endColumn) fields.campaignEndDate = endColumn;

  const prep = v.prepMonths !== undefined ? Number(v.prepMonths) : undefined;

  return {
    where: row.where,
    sheet: row.sheet,
    master: v.prepMonths !== undefined || v.hebrewAnchor !== undefined,
    title: normaliseTitle(v.title ?? ''),
    fields,
    prepMonths: Number.isFinite(prep) ? prep : undefined,
    hebrew: (v.hebrewAnchor ?? '').trim() === '1',
    note: v.note,
    description: v.description,
    category: v.category,
    status: v.status
  };
}

/* ---------------------------------------------------------- reconciliation */

/**
 * Which rows are the same activity.
 *
 * The kickoff meeting is the anchor when there is one: it is typed by hand,
 * never computed, and no two instances of a campaign share it. Everything else
 * — the "master" rows, which carry only a date and a preparation count — falls
 * back to the activity's own date.
 *
 * Pairing the two halves is the hard part, and matching them on the year was
 * wrong. One sheet holds "הכנת תקציב" three times, and one of those plan rows
 * ends on 1 January, so its year is the *next* one; the year rule handed it the
 * following year's master and left the real one orphaned with no preparation
 * months at all. Two of the three came out describing a year nobody wrote down.
 *
 * So they are matched on how close their dates actually are, nearest first, one
 * partner each. A master and its plan row describe the same instance and land
 * within days of each other; two instances of the same activity are a year
 * apart. Sixty days is comfortably inside that gap.
 */
const SAME_INSTANCE_DAYS = 60;

function group(candidates: Candidate[]): Candidate[][] {
  const anchorOf = (c: Candidate) =>
    c.fields.actualDate?.iso ?? c.fields.campaignEndDate?.iso ?? c.fields.kickoffMeetingDate?.iso ?? null;

  const withMeeting = new Map<string, Candidate[]>();
  const withoutMeeting = new Map<string, Candidate[]>();

  for (const c of candidates) {
    const meeting = c.fields.kickoffMeetingDate?.iso;
    const key = meeting ? `${c.title}|m:${meeting}` : `${c.title}|d:${anchorOf(c) ?? '?'}`;
    const target = meeting ? withMeeting : withoutMeeting;
    if (!target.has(key)) target.set(key, []);
    target.get(key)!.push(c);
  }

  /** A group's own date: what the rows in it say the activity happens on. */
  const groupAnchor = (list: Candidate[]) => {
    const dates = list.map(anchorOf).filter((d): d is string => Boolean(d)).sort();
    return dates[0] ?? null;
  };

  const meetingGroups = [...withMeeting.values()].map((list) => ({ list, anchor: groupAnchor(list) }));
  const masterGroups = [...withoutMeeting.values()].map((list) => ({
    list,
    anchor: groupAnchor(list),
    title: list[0].title
  }));

  const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

  /*
   * Nearest first, one partner each.
   *
   * Greedy over a sorted list of candidate pairs: the closest pair in the whole
   * activity is certainly right, so it is taken, and both sides are then out of
   * the running. What is left is matched the same way until nothing is close
   * enough, and whatever remains stands on its own.
   */
  const pairs: { m: number; y: number; distance: number }[] = [];
  meetingGroups.forEach((m, mi) => {
    masterGroups.forEach((y, yi) => {
      if (y.title !== m.list[0].title) return;
      if (!m.anchor || !y.anchor) return;
      const distance = days(m.anchor, y.anchor);
      if (distance <= SAME_INSTANCE_DAYS) pairs.push({ m: mi, y: yi, distance });
    });
  });
  pairs.sort((a, b) => a.distance - b.distance);

  const takenMeeting = new Set<number>();
  const takenMaster = new Set<number>();
  const merged = new Map<number, number>();
  for (const pair of pairs) {
    if (takenMeeting.has(pair.m) || takenMaster.has(pair.y)) continue;
    takenMeeting.add(pair.m);
    takenMaster.add(pair.y);
    merged.set(pair.m, pair.y);
  }

  const out: Candidate[][] = [];
  meetingGroups.forEach((m, mi) => {
    const partner = merged.get(mi);
    out.push(partner === undefined ? m.list : [...m.list, ...masterGroups[partner].list]);
  });
  masterGroups.forEach((y, yi) => {
    if (!takenMaster.has(yi)) out.push(y.list);
  });
  return out;
}

/* -------------------------------------------------------------- resolution */

interface Resolved<T> {
  value: T | null;
  conflict?: Conflict;
  issues: ImportIssue[];
  suggestions: Suggestion[];
}

/**
 * One value out of several rows, and an honest account of the disagreement.
 *
 * Order of preference: a date the calendar accepts beats one it does not; a
 * hand-typed block beats a computed one; after that the value most rows agree
 * on wins. A tie falls to the first row in the file, so the answer is the same
 * every time the same file is read.
 */
function resolveDate(field: string, list: Candidate[]): Resolved<ParsedDate> {
  const issues: ImportIssue[] = [];
  const suggestions: Suggestion[] = [];
  const present = list.filter((c) => c.fields[field]);
  if (present.length === 0) return { value: null, issues, suggestions };

  const broken = present.filter((c) => c.fields[field]!.error);

  for (const c of present) {
    const parsed = c.fields[field]!;
    if (parsed.error) {
      // Severity follows the outcome, not the offence: a date another row of
      // the same file spells correctly costs nothing, and a count of "errors"
      // has to mean "things that were lost".
      issues.push({
        severity: 'pending',
        where: c.where,
        field,
        message: `${FIELD_LABELS[field]}: "${parsed.raw}" — ${parsed.error}`
      } as unknown as ImportIssue);
    } else if (parsed.iso) {
      const year = Number(parsed.iso.slice(0, 4));
      if (year < MIN_YEAR || year > MAX_YEAR) {
        issues.push({
          severity: 'error',
          where: c.where,
          field,
          message: `${FIELD_LABELS[field]}: השנה ${year} לא נראית סבירה`
        });
      }
    }
  }

  const usable = present.filter(
    (c) =>
      c.fields[field]!.iso &&
      !c.fields[field]!.error &&
      Number(c.fields[field]!.iso!.slice(0, 4)) >= MIN_YEAR &&
      Number(c.fields[field]!.iso!.slice(0, 4)) <= MAX_YEAR
  );

  if (usable.length === 0) {
    for (const i of issues) {
      if ((i.severity as string) === 'pending') {
        i.severity = 'error';
        i.message += ' — התאריך הזה לא ייובא';
      }
    }
    return { value: null, issues, suggestions };
  }

  const byValue = new Map<string, Candidate[]>();
  for (const c of usable) {
    const iso = c.fields[field]!.iso!;
    if (!byValue.has(iso)) byValue.set(iso, []);
    byValue.get(iso)!.push(c);
  }

  const ranked = [...byValue.entries()].sort((a, b) => {
    const masterA = a[1].some((c) => c.master) ? 0 : 1;
    const masterB = b[1].some((c) => c.master) ? 0 : 1;
    if (masterA !== masterB) return masterA - masterB;
    if (a[1].length !== b[1].length) return b[1].length - a[1].length;
    return a[1][0].where.localeCompare(b[1][0].where);
  });

  const chosen = ranked[0][0];
  const value = byValue.get(chosen)![0].fields[field]!;

  let conflict: Conflict | undefined;
  if (byValue.size > 1) {
    conflict = {
      field,
      fieldLabel: FIELD_LABELS[field] ?? field,
      values: ranked.map(([iso, rows]) => ({ value: iso, where: rows.map((r) => r.where) })),
      chosen
    };
  }

  /*
   * The repair comes from the file, or it does not come at all.
   *
   * Two rows for the same activity, one holding 31.09.2027 and the other
   * 01.10.2027, is the file answering its own question. Using that is not a
   * guess — and it is shown, ticked, so it can be undone. Inventing "the 30th,
   * presumably" would be a guess, and there is no code here that does it.
   */
  for (const c of broken) {
    for (const i of issues) {
      if ((i.severity as string) === 'pending' && i.where === c.where && i.field === field) {
        i.severity = 'warning';
        i.message += ` — השתמשנו ב-${chosen} מ${byValue.get(chosen)![0].where}`;
      }
    }
    if (!suggestions.some((s) => s.field === field)) {
      suggestions.push({
        field,
        fieldLabel: FIELD_LABELS[field] ?? field,
        from: c.fields[field]!.raw,
        to: chosen,
        reason: `בגיליון אחר (${byValue.get(chosen)![0].where}) אותה פעילות רשומה כ-${chosen}`,
        fromFile: true,
        applied: true
      });
    }
  }

  return { value, conflict, issues, suggestions };
}

/**
 * The same activity, elsewhere in the workbook, with a date that can be read.
 *
 * Matched on the name plus a date within the same instance — a campaign's
 * instances are a year apart, so a sixty-day window cannot pick up the wrong
 * one. Returns nothing at all when the workbook does not contain the answer;
 * there is no code here that invents a day.
 */
function repairFromWorkbook(
  field: string,
  list: Candidate[],
  pool: Candidate[]
): { value: ParsedDate; where: string; suggestion: Suggestion } | null {
  const broken = list.find((c) => c.fields[field]?.error);
  if (!broken) return null;

  const anchorOf = (c: Candidate) =>
    c.fields.actualDate?.iso ?? c.fields.campaignEndDate?.iso ?? c.fields.kickoffMeetingDate?.iso ?? null;
  const mine = list.map(anchorOf).find(Boolean) ?? null;

  const answer = pool.find((c) => {
    if (c.title !== broken.title) return false;
    if (list.includes(c)) return false;
    const parsed = c.fields[field];
    if (!parsed?.iso || parsed.error) return false;
    const theirs = anchorOf(c);
    if (!mine || !theirs) return false;
    return Math.abs(Date.parse(mine) - Date.parse(theirs)) / 86_400_000 <= SAME_INSTANCE_DAYS;
  });
  if (!answer) return null;

  return {
    value: answer.fields[field]!,
    where: answer.where,
    suggestion: {
      field,
      fieldLabel: FIELD_LABELS[field] ?? field,
      from: broken.fields[field]!.raw,
      to: answer.fields[field]!.iso!,
      reason: `בגיליון אחר (${answer.where}) אותה פעילות רשומה כ-${answer.fields[field]!.iso}`,
      fromFile: true,
      applied: true
    }
  };
}

/* ------------------------------------------------------------------- order */

const STORY: { field: string; label: string }[] = [
  { field: 'kickoffMeetingDate', label: 'ישיבת ההתנעה' },
  { field: 'workStartDate', label: 'תחילת העבודה' },
  { field: 'reviewDate', label: 'הבקרה' },
  { field: 'freezeDate', label: 'הקפאת השינויים' },
  { field: 'kickoffDate', label: 'העלייה לאוויר' },
  { field: 'announceDate', label: 'ההודעה לחברה' },
  { field: 'actualDate', label: 'תאריך האירוע' }
];

/**
 * Dates that run backwards, and the one repair worth offering.
 *
 * Every backwards row in the real file is a single year typed wrong. The hard
 * part is deciding *which* field carries the typo, and the naive answer —
 * offering to shift either side of every backwards pair — produced nine
 * suggestions for three broken rows, six of them nonsense: it cheerfully
 * proposed moving Purim's launch into 2030 to accommodate a kickoff meeting
 * that was itself the mistake.
 *
 * Two pieces of evidence settle it:
 *
 *   1. **How many rules a field breaks.** A field that is out of order with two
 *      others is the odd one out; the two are not both wrong.
 *   2. **Distance from the event's own date.** Everything in this file is
 *      planned backwards from the event, so the shift that lands nearest to it
 *      is the shift that agrees with how the row was written.
 *
 * At most one suggestion per event, and only when shifting that one field puts
 * the whole story back in order. Anything less certain is reported and left
 * alone.
 */
function orderIssues(
  values: EventValues,
  where: string
): { issues: ImportIssue[]; suggestions: Suggestion[] } {
  const at = (f: string) => (values as unknown as Record<string, string | null>)[f];

  const violations: { earlier: string; later: string }[] = [];
  for (let i = 0; i < STORY.length; i++) {
    for (let j = i + 1; j < STORY.length; j++) {
      const a = at(STORY[i].field);
      const b = at(STORY[j].field);
      if (a && b && a > b) violations.push({ earlier: STORY[i].field, later: STORY[j].field });
    }
  }
  if (violations.length === 0) return { issues: [], suggestions: [] };

  const label = (field: string) => STORY.find((s) => s.field === field)?.label ?? field;

  /** Each field, and how many rules it is on the wrong side of. */
  const blame = new Map<string, number>();
  for (const v of violations) {
    blame.set(v.earlier, (blame.get(v.earlier) ?? 0) + 1);
    blame.set(v.later, (blame.get(v.later) ?? 0) + 1);
  }

  const shiftYear = (date: string, years: number) =>
    `${Number(date.slice(0, 4)) + years}${date.slice(4)}`;

  const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

  /** A field is shifted back when it is too late in the story, forward when too early. */
  const candidates = [...blame.keys()]
    .map((field) => {
      const asEarly = violations.some((v) => v.earlier === field);
      const moved = shiftYear(at(field)!, asEarly ? -1 : 1);
      const after = { ...(values as unknown as Record<string, string | null>), [field]: moved };
      const stillBroken = violations.some((v) => {
        const a = after[v.earlier];
        const b = after[v.later];
        return a && b && a > b;
      });
      return {
        field,
        moved,
        blame: blame.get(field) ?? 0,
        fixes: !stillBroken,
        distance: days(moved, values.actualDate)
      };
    })
    .filter((c) => c.fixes)
    .sort((a, b) => b.blame - a.blame || a.distance - b.distance);

  const worst = violations[0];
  const suspect = candidates[0]?.field ?? worst.earlier;

  const issues: ImportIssue[] = [
    {
      severity: 'warning',
      where,
      field: suspect,
      message:
        `${label(worst.earlier)} (${at(worst.earlier)}) אחרי ${label(worst.later)} (${at(worst.later)})` +
        (violations.length === 2
          ? ' ועוד סתירה אחת בשורה הזאת'
          : violations.length > 2
            ? ` ועוד ${violations.length - 1} סתירות בשורה הזאת`
            : '')
    }
  ];

  const suggestions: Suggestion[] = candidates[0]
    ? [
        {
          field: candidates[0].field,
          fieldLabel: FIELD_LABELS[candidates[0].field] ?? candidates[0].field,
          from: at(candidates[0].field)!,
          to: candidates[0].moved,
          reason: `נראה שהשנה כאן חורגת בשנה משאר השורה. עם התיקון כל התאריכים חוזרים לסדר`,
          fromFile: false,
          applied: false
        }
      ]
    : [];

  return { issues, suggestions };
}

/* --------------------------------------------------------------- the plan */

export interface ExistingEvent {
  id: string;
  sourceKey: string | null;
  title: string;
  actualDate: string;
  values: EventValues;
}

/** How one sheet should be treated, as the person on the screen decided. */
export interface SheetChoice {
  sheet: string;
  boardName?: string;
  boardId?: string | null;
  include?: boolean;
}

export interface PlanOptions {
  /** What a person changed about the sheet-to-board mapping. */
  sheets?: SheetChoice[];
  /** Events already on each target board, keyed by board id. */
  existingByBoard?: Map<string, ExistingEvent[]>;
  /** Rule-based suggestions the person ticked, keyed by `${planKey}:${field}`. */
  accepted?: Set<string>;
  /** File-based repairs the person un-ticked. The field is then left empty. */
  rejected?: Set<string>;
  /** Events the person chose to leave out, by plan key. */
  excluded?: Set<string>;
}

/**
 * The whole workbook, as the boards it describes.
 *
 * One plan per sheet, because a sheet is a board. Deduplication happens inside
 * a sheet and never across them: two sheets that both mention "פסח 2027" are
 * two boards that both track it, and quietly folding them into one loses the
 * distinction whoever built the workbook was making.
 */
export function buildPlan(rows: SourceRow[], options: PlanOptions = {}): ImportPlan {
  const choices = new Map((options.sheets ?? []).map((c) => [c.sheet, c]));

  /*
   * Every row in the workbook, for one purpose only: repairing a cell that
   * cannot be read.
   *
   * Sheets do not merge — they are separate boards. But "31.09.2027" is not a
   * date, and when the very same activity is written "01.10.2027" two sheets
   * over, that is the file answering its own question, not another board's
   * opinion. The repair is offered with the sheet and row it came from so it
   * can be seen and refused; nothing else ever crosses a sheet boundary.
   */
  const pool = rows.map(toCandidate).filter((c) => c.title);

  // Sheet order is the workbook's own, so the screen reads like the file.
  const sheets: string[] = [];
  for (const row of rows) if (!sheets.includes(row.sheet)) sheets.push(row.sheet);

  const boards = sheets.map((sheet) => {
    const choice = choices.get(sheet);
    const boardName = choice?.boardName?.trim() || sheet;
    const boardId = choice?.boardId ?? null;
    const include = choice?.include ?? true;

    const events = planSheet(
      rows.filter((r) => r.sheet === sheet),
      sheet,
      boardId ? options.existingByBoard?.get(boardId) : undefined,
      options,
      pool
    );

    return {
      sheet,
      boardName,
      boardId,
      include,
      events,
      summary: summarise(rows.filter((r) => r.sheet === sheet).length, events)
    };
  });

  const live = boards.filter((b) => b.include);

  return {
    boards,
    skipped: [],
    summary: summarise(
      live.reduce((n, b) => n + b.summary.sourceRows, 0),
      live.flatMap((b) => b.events)
    )
  };
}

/** Every event across the boards that are going in. For callers that want the flat list. */
export function allEvents(plan: ImportPlan): PlannedEvent[] {
  return plan.boards.filter((b) => b.include).flatMap((b) => b.events);
}

function summarise(sourceRows: number, events: PlannedEvent[]): PlanSummary {
  const count = (a: Action) => events.filter((e) => e.action === a).length;
  const issues = events.flatMap((e) => e.issues);
  return {
    sourceRows,
    events: events.length,
    create: count('create'),
    update: count('update'),
    unchanged: count('unchanged'),
    skip: count('skip'),
    tasks: 0,
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    conflicts: events.reduce((n, e) => n + e.conflicts.length, 0),
    suggestions: events.reduce((n, e) => n + e.suggestions.length, 0)
  };
}

/** One sheet's rows, reconciled into the events that sheet describes. */
function planSheet(
  rows: SourceRow[],
  sheet: string,
  existing: ExistingEvent[] | undefined,
  options: PlanOptions,
  pool: Candidate[]
): PlannedEvent[] {
  const accepted = options.accepted ?? new Set<string>();
  const rejected = options.rejected ?? new Set<string>();
  const excluded = options.excluded ?? new Set<string>();
  const candidates = rows.map(toCandidate).filter((c) => c.title);

  const events: PlannedEvent[] = [];

  for (const list of group(candidates)) {
    const title = list.find((c) => c.master)?.title ?? list[0].title;
    const sources = list.map((c) => c.where);
    const issues: ImportIssue[] = [];
    const conflicts: Conflict[] = [];
    const suggestions: Suggestion[] = [];

    const resolved: Record<string, ParsedDate | null> = {};
    for (const field of ['actualDate', ...DATE_FIELDS]) {
      const r = resolveDate(field, list);
      resolved[field] = r.value;
      issues.push(...r.issues);
      if (r.conflict) conflicts.push(r.conflict);
      suggestions.push(...r.suggestions);

      // Nothing readable on this sheet: ask the rest of the workbook before
      // giving up on the date entirely.
      if (!r.value) {
        const repair = repairFromWorkbook(field, list, pool);
        if (repair) {
          resolved[field] = repair.value;
          for (const i of issues) {
            if (i.field === field && i.severity === 'error') {
              i.severity = 'warning';
              i.message = i.message.replace(' — התאריך הזה לא ייובא', ` — השתמשנו ב-${repair.value.iso} מ${repair.where}`);
            }
          }
          suggestions.push(repair.suggestion);
        }
      }
    }

    const actual = resolved.actualDate;
    /*
     * The identity of a row inside its board.
     *
     * The year alone is not enough. One sheet holds "העברת תקציב נותר לשנה
     * הבאה" three times, and two of those instances share a year once a
     * campaign runs into January — keying on the year gave them the same key,
     * and the unique index on (board_id, source_key) would have refused the
     * second one. The date makes them distinct, and it is also what the
     * fallback match uses when a date is corrected and the file re-imported.
     */
    const sourceKey = `${title}|${actual?.iso ?? resolved.kickoffMeetingDate?.iso ?? '?'}`;
    const planKey = `${sheet}::${sourceKey}`;

    if (!actual?.iso) {
      events.push({
        sourceKey,
        planKey,
        sheet,
        title,
        action: 'skip',
        values: emptyValues(title),
        stated: [],
        sources,
        issues: [
          ...issues,
          {
            severity: 'error',
            where: sources[0],
            field: 'actualDate',
            message: 'אין לאירוע הזה תאריך שאפשר לקרוא, ולכן אי אפשר לייבא אותו'
          }
        ],
        conflicts,
        suggestions
      });
      continue;
    }

    // Preparation months: the typed block wins, and a value out of range is
    // clamped with a note rather than silently.
    const prepRow =
      list.find((c) => c.master && c.prepMonths !== undefined) ?? list.find((c) => c.prepMonths !== undefined);
    let prepMonths = prepRow?.prepMonths ?? 0;
    if (!Number.isInteger(prepMonths) || prepMonths < 0 || prepMonths > 12) {
      issues.push({
        severity: 'warning',
        where: prepRow?.where ?? sources[0],
        field: 'prepMonths',
        message: `חודשי הכנה: "${prepRow?.prepMonths}" — נשמר כ-0, כי אפשר רק 0 עד 12`
      });
      prepMonths = 0;
    }

    /*
     * What kind of work this is.
     *
     * A column that names it wins — that is a file this system wrote, or one
     * somebody filled in by hand, and reading the word back is the whole reason
     * an export can be re-imported without losing what it said. Failing that,
     * the Hebrew-calendar flag in the customer's own file means a holiday.
     * Failing both, the schema default stands and nothing is asserted.
     */
    const namedCategory = list.map((c) => categoryFromText(c.category)).find(Boolean) ?? null;
    const namedStatus = list.map((c) => statusFromText(c.status)).find(Boolean) ?? null;
    const categoryRow = namedCategory ? list.find((c) => c.category) : list.find((c) => c.hebrew);

    for (const c of list) {
      if (c.category && !categoryFromText(c.category)) {
        issues.push({
          severity: 'warning',
          where: c.where,
          field: 'category',
          message: `סוג האירוע "${c.category}" לא מוכר — נשמר כברירת המחדל`
        });
      }
    }

    const stated = ['title', 'actualDate', 'actualPrecision'];
    if (prepRow) stated.push('prepMonths');
    if (categoryRow) stated.push('category');
    if (namedStatus) stated.push('status');
    for (const f of DATE_FIELDS) if (resolved[f]?.iso) stated.push(f);
    if (list.some((c) => c.note)) stated.push('note');
    if (list.some((c) => c.description)) stated.push('description');

    const values: EventValues = {
      title,
      category: namedCategory ?? (list.some((c) => c.hebrew) ? 'holiday' : 'campaign'),
      ...(namedStatus ? { status: namedStatus } : {}),
      actualDate: actual.iso,
      actualPrecision: actual.monthOnly ? 'month' : 'day',
      prepMonths,
      kickoffMeetingDate: resolved.kickoffMeetingDate?.iso ?? null,
      workStartDate: resolved.workStartDate?.iso ?? null,
      reviewDate: resolved.reviewDate?.iso ?? null,
      freezeDate: resolved.freezeDate?.iso ?? null,
      kickoffDate: resolved.kickoffDate?.iso ?? null,
      announceDate: resolved.announceDate?.iso ?? null,
      campaignEndDate: resolved.campaignEndDate?.iso ?? null,
      note: list.find((c) => c.note)?.note ?? null,
      description: list.find((c) => c.description)?.description ?? null
    };

    const order = orderIssues(values, sources[0]);
    issues.push(...order.issues);
    suggestions.push(...order.suggestions);

    /*
     * A repair the file supplies is already in `values`; un-ticking it empties
     * the field, because the broken text is not something that can be stored.
     * A repair derived from a rule does nothing until it is ticked.
     */
    for (const s of suggestions) {
      const key = `${planKey}:${s.field}`;
      const target = values as unknown as Record<string, string | null>;
      if (s.fromFile) {
        if (rejected.has(key)) {
          target[s.field] = null;
          s.applied = false;
        }
      } else if (accepted.has(key)) {
        target[s.field] = s.to;
        s.applied = true;
      }
    }

    /*
     * The campaign end and the event date are the same column in the customer's
     * file, so a plan that sets both to one day is the projection showing
     * through rather than a fact. It is dropped, and said out loud.
     */
    if (values.campaignEndDate && values.campaignEndDate === values.actualDate) {
      values.campaignEndDate = null;
    }

    /*
     * Matching is scoped to the board this sheet becomes, and never wider. Two
     * boards may legitimately hold the same campaign; that is not a duplicate,
     * it is two teams tracking the same date.
     */
    const match =
      existing?.find((e) => e.sourceKey === sourceKey) ??
      existing?.find((e) => normaliseTitle(e.title) === title && e.actualDate === values.actualDate);

    let action: Action = match ? 'update' : 'create';
    let changes: PlannedEvent['changes'];
    if (match) {
      changes = diff(match.values, values, stated);
      if (changes.length === 0) action = 'unchanged';
    }
    // An error on a field is never a reason to throw the whole event away: the
    // field is left empty, and the row says which one and why.
    if (excluded.has(planKey)) action = 'skip';

    events.push({
      sourceKey,
      planKey,
      sheet,
      title,
      action,
      values,
      stated,
      sources,
      issues,
      conflicts,
      suggestions,
      existingId: match?.id,
      changes
    });
  }

  events.sort((a, b) => a.values.actualDate.localeCompare(b.values.actualDate) || a.title.localeCompare(b.title));
  flagYearDrift(events, accepted);
  return events;
}

/**
 * A year typed wrong that the story order cannot see.
 *
 * Ordering catches a date shoved past the ones after it. It cannot catch a date
 * shoved a year *earlier*, because earlier is where that date is supposed to be
 * anyway: a kickoff meeting typed 2027 instead of 2028 still comes before the
 * go-live and before the event, and the plan reads as valid while describing a
 * campaign that starts seventeen months out.
 *
 * The evidence is in the sheet already. A campaign that runs every year runs to
 * the same shape every year — Purim's meeting is three months before Purim,
 * every time — so an instance whose interval is a year off the ones its
 * siblings agree on is a year typed wrong. Three instances are required, so two
 * can agree and one can be the odd one out; below that there is no pattern,
 * only two numbers.
 *
 * Reported, and offered. Never applied.
 */
function flagYearDrift(events: PlannedEvent[], accepted: Set<string>): void {
  const byTitle = new Map<string, PlannedEvent[]>();
  for (const e of events) {
    if (e.action === 'skip') continue;
    const list = byTitle.get(e.title) ?? [];
    list.push(e);
    byTitle.set(e.title, list);
  }

  const YEAR = 365;
  /** Leap years and month lengths move a gap by a handful of days, never by a month. */
  const SLACK = 40;

  for (const list of byTitle.values()) {
    if (list.length < 3) continue;

    for (const field of DATE_FIELDS) {
      const measured = list
        .map((e) => {
          const value = (e.values as unknown as Record<string, string | null>)[field];
          if (!value) return null;
          return { event: e, gap: (Date.parse(e.values.actualDate) - Date.parse(value)) / 86_400_000 };
        })
        .filter((x): x is { event: PlannedEvent; gap: number } => x !== null);

      if (measured.length < 3) continue;

      const sorted = [...measured].map((m) => m.gap).sort((a, b) => a - b);
      const typical = sorted[Math.floor(sorted.length / 2)];

      for (const m of measured) {
        const drift = m.gap - typical;
        if (Math.abs(Math.abs(drift) - YEAR) > SLACK) continue;

        // The ordering rule may already have this one. One repair per field.
        if (m.event.suggestions.some((s) => s.field === field)) continue;

        const current = (m.event.values as unknown as Record<string, string>)[field];
        const moved = `${Number(current.slice(0, 4)) + (drift > 0 ? 1 : -1)}${current.slice(4)}`;

        m.event.issues.push({
          severity: 'warning',
          where: m.event.sources[0],
          field,
          message:
            `${FIELD_LABELS[field]} רחוק מתאריך האירוע ב-${Math.round(m.gap)} ימים, ` +
            `ובשאר השנים של «${m.event.title}» המרווח הוא ${Math.round(typical)} ימים`
        });

        const suggestion: Suggestion = {
          field,
          fieldLabel: FIELD_LABELS[field] ?? field,
          from: current,
          to: moved,
          reason: `בשאר המופעים של «${m.event.title}» המרווח מתאריך האירוע קבוע. כאן הוא חורג בשנה בדיוק`,
          fromFile: false,
          applied: false
        };

        if (accepted.has(`${m.event.planKey}:${field}`)) {
          (m.event.values as unknown as Record<string, string>)[field] = moved;
          suggestion.applied = true;
        }
        m.event.suggestions.push(suggestion);
      }
    }
  }
}

function emptyValues(title: string): EventValues {
  return {
    title,
    category: 'campaign',
    actualDate: '',
    actualPrecision: 'day',
    prepMonths: 0,
    kickoffMeetingDate: null,
    workStartDate: null,
    reviewDate: null,
    freezeDate: null,
    kickoffDate: null,
    announceDate: null,
    campaignEndDate: null,
    note: null,
    description: null
  };
}

/**
 * What an update would actually change. An import that changes nothing says so.
 *
 * Only fields the file spoke about, and never a blank: a spreadsheet that is
 * silent about the review date is not asking for the review date to be deleted.
 */
export function diff(
  before: EventValues,
  after: EventValues,
  stated: string[]
): NonNullable<PlannedEvent['changes']> {
  const out: NonNullable<PlannedEvent['changes']> = [];
  const says = new Set(stated);
  for (const field of Object.keys(FIELD_LABELS)) {
    if (!says.has(field)) continue;
    const a = (before as unknown as Record<string, unknown>)[field] ?? null;
    const b = (after as unknown as Record<string, unknown>)[field] ?? null;
    if (b === null || b === '') continue;
    if (String(a ?? '') !== String(b)) {
      out.push({ field, fieldLabel: FIELD_LABELS[field] ?? field, from: String(a ?? '—'), to: String(b) });
    }
  }
  return out;
}
