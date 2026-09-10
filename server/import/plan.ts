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
  category: 'holiday' | 'campaign' | 'b2b' | 'social' | 'operational' | 'other';
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

export interface ImportPlan {
  events: PlannedEvent[];
  issues: ImportIssue[];
  summary: {
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
  };
}

/** The names a person sees. Mirrors src/data/milestones.ts on purpose. */
export const FIELD_LABELS: Record<string, string> = {
  title: 'שם האירוע',
  category: 'סוג האירוע',
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
    category: v.category
  };
}

/* ---------------------------------------------------------- reconciliation */

/**
 * Which rows are the same activity.
 *
 * The kickoff meeting is the anchor when there is one: it is typed by hand,
 * never computed, and no two instances of a campaign share it. Everything else
 * falls back to name plus year — the file holds "חנוכה" three times, once per
 * year, and those are three events.
 */
function group(candidates: Candidate[]): Candidate[][] {
  const yearOf = (c: Candidate) =>
    c.fields.actualDate?.iso?.slice(0, 4) ??
    c.fields.campaignEndDate?.iso?.slice(0, 4) ??
    c.fields.kickoffMeetingDate?.iso?.slice(0, 4) ??
    '?';

  const byMeeting = new Map<string, Candidate[]>();
  const byYear = new Map<string, Candidate[]>();

  for (const c of candidates) {
    const meeting = c.fields.kickoffMeetingDate?.iso;
    const key = meeting ? `${c.title}|m:${meeting}` : `${c.title}|y:${yearOf(c)}`;
    const target = meeting ? byMeeting : byYear;
    if (!target.has(key)) target.set(key, []);
    target.get(key)!.push(c);
  }

  /** The year a meeting-anchored group belongs to: the one most of its rows say. */
  const groupYear = (list: Candidate[]) => {
    const counts = new Map<string, number>();
    for (const c of list) counts.set(yearOf(c), (counts.get(yearOf(c)) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  };

  // A master row carries no meeting date, so it lands in the year map. Fold it
  // into the meeting group for the same activity and year, or the file's two
  // halves become two events.
  const out: Candidate[][] = [];
  for (const list of byMeeting.values()) {
    const yearKey = `${list[0].title}|y:${groupYear(list)}`;
    const siblings = byYear.get(yearKey);
    if (siblings) {
      byYear.delete(yearKey);
      out.push([...list, ...siblings]);
    } else {
      out.push(list);
    }
  }
  out.push(...byYear.values());
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
 * Every backwards pair in the real file is a year typed wrong in exactly one
 * field. Shifting that field by a year and finding the whole story in order
 * again is strong evidence — but it is still a suggestion that a person ticks,
 * never something applied on the way in.
 */
function orderIssues(values: EventValues, where: string): { issues: ImportIssue[]; suggestions: Suggestion[] } {
  const issues: ImportIssue[] = [];
  const suggestions: Suggestion[] = [];
  const at = (f: string) => (values as unknown as Record<string, string | null>)[f];

  for (let i = 0; i < STORY.length; i++) {
    for (let j = i + 1; j < STORY.length; j++) {
      const a = at(STORY[i].field);
      const b = at(STORY[j].field);
      if (!a || !b || a <= b) continue;

      issues.push({
        severity: 'warning',
        where,
        field: STORY[i].field,
        message: `${STORY[i].label} (${a}) אחרי ${STORY[j].label} (${b})`
      });

      for (const [field, other, shift] of [
        [STORY[i].field, b, 1],
        [STORY[j].field, a, -1]
      ] as [string, string, number][]) {
        const current = at(field)!;
        const moved = `${Number(current.slice(0, 4)) - shift * 1}${current.slice(4)}`;
        const fixed = shift > 0 ? moved <= other : moved >= other;
        if (fixed && !suggestions.some((s) => s.field === field)) {
          suggestions.push({
            field,
            fieldLabel: FIELD_LABELS[field] ?? field,
            from: current,
            to: moved,
            reason: 'השנה בשדה הזה חורגת בשנה משאר השורה. עם התיקון סדר התאריכים מסתדר',
            fromFile: false,
            applied: false
          });
        }
      }
    }
  }
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

export interface PlanOptions {
  /** Events already on the board, for matching. */
  existing?: ExistingEvent[];
  /** Rule-based suggestions the person ticked, keyed by `${sourceKey}:${field}`. */
  accepted?: Set<string>;
  /** File-based repairs the person un-ticked. The field is then left empty. */
  rejected?: Set<string>;
  /** Events the person chose not to import, by source key. */
  excluded?: Set<string>;
}

export function buildPlan(rows: SourceRow[], options: PlanOptions = {}): ImportPlan {
  const accepted = options.accepted ?? new Set<string>();
  const rejected = options.rejected ?? new Set<string>();
  const excluded = options.excluded ?? new Set<string>();
  const candidates = rows.map(toCandidate).filter((c) => c.title);
  const planIssues: ImportIssue[] = [];

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
    }

    const actual = resolved.actualDate;
    const sourceKey = `${title}|${actual?.iso?.slice(0, 4) ?? resolved.kickoffMeetingDate?.iso?.slice(0, 4) ?? '?'}`;

    if (!actual?.iso) {
      events.push({
        sourceKey,
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
    const prepRow = list.find((c) => c.master && c.prepMonths !== undefined) ?? list.find((c) => c.prepMonths !== undefined);
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

    const categoryRow = list.find((c) => c.hebrew) ?? list.find((c) => c.category);
    const stated = ['title', 'actualDate', 'actualPrecision'];
    if (prepRow) stated.push('prepMonths');
    if (categoryRow) stated.push('category');
    for (const f of DATE_FIELDS) if (resolved[f]?.iso) stated.push(f);
    if (list.some((c) => c.note)) stated.push('note');
    if (list.some((c) => c.description)) stated.push('description');

    const values: EventValues = {
      title,
      // The only classification the file states is the Hebrew-calendar flag.
      // Everything else keeps the system default and can be changed after.
      category: list.some((c) => c.hebrew) ? 'holiday' : 'campaign',
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
      const key = `${sourceKey}:${s.field}`;
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

    const match =
      options.existing?.find((e) => e.sourceKey === sourceKey) ??
      options.existing?.find(
        (e) => normaliseTitle(e.title) === title && e.actualDate === values.actualDate
      );

    let action: Action = match ? 'update' : 'create';
    let changes: PlannedEvent['changes'];
    if (match) {
      changes = diff(match.values, values, stated);
      if (changes.length === 0) action = 'unchanged';
    }
    // An error on a field is never a reason to throw the whole event away: the
    // field is left empty, and the row says which one and why.
    if (excluded.has(sourceKey)) action = 'skip';

    events.push({
      sourceKey,
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

  const count = (a: Action) => events.filter((e) => e.action === a).length;
  const all = [...planIssues, ...events.flatMap((e) => e.issues)];

  return {
    events,
    issues: planIssues,
    summary: {
      sourceRows: rows.length,
      events: events.length,
      create: count('create'),
      update: count('update'),
      unchanged: count('unchanged'),
      skip: count('skip'),
      tasks: 0,
      errors: all.filter((i) => i.severity === 'error').length,
      warnings: all.filter((i) => i.severity === 'warning').length,
      conflicts: events.reduce((n, e) => n + e.conflicts.length, 0),
      suggestions: events.reduce((n, e) => n + e.suggestions.length, 0)
    }
  };
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
