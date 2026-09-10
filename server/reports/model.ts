import { z } from 'zod';

/**
 * The report vocabulary, closed on purpose.
 *
 * The client never sends SQL, never sends a column name, and never sends a
 * table. It sends a dataset, one dimension, a list of measures and a list of
 * filters — all of them names that appear in this file. `run.ts` maps those
 * names to fixed SQL fragments, and a name that is not in the map is an error
 * rather than a fallback. That is the whole injection surface, closed at the
 * schema instead of sanitised after the fact.
 *
 * Every entry carries its own Hebrew `label` and `hint` because the picker is
 * rendered straight from `reportModel()`. A word that lives here and again in a
 * React component is a word that will eventually disagree with itself.
 */

/* ------------------------------------------------------------------
   Value vocabularies. These mirror the enums in db/schema.ts — the
   database is the authority on which values exist, this is the
   authority on what a person is shown when one comes back.
   ------------------------------------------------------------------ */

export const CATEGORY_VALUES = ['holiday', 'campaign', 'b2b', 'social', 'operational', 'other'] as const;
export const STATUS_VALUES = ['todo', 'in_progress', 'ready_kickoff', 'done'] as const;
export const PRIORITY_VALUES = ['low', 'medium', 'high', 'urgent'] as const;

export const CATEGORY_LABELS: Record<(typeof CATEGORY_VALUES)[number], string> = {
  holiday: 'חג ומועד',
  campaign: 'קמפיין',
  b2b: 'ועדים וארגונים',
  social: 'סושיאל',
  operational: 'תפעול',
  other: 'אחר'
};

export const STATUS_LABELS: Record<(typeof STATUS_VALUES)[number], string> = {
  todo: 'עוד לא התחיל',
  in_progress: 'בתהליך',
  ready_kickoff: 'מוכן לעלייה לאוויר',
  done: 'הושלם'
};

export const PRIORITY_LABELS: Record<(typeof PRIORITY_VALUES)[number], string> = {
  low: 'נמוכה',
  medium: 'בינונית',
  high: 'גבוהה',
  urgent: 'דחופה'
};

/** How a number is written on screen. The UI formats from this, not from guesswork. */
export type ColumnType = 'text' | 'number' | 'percent' | 'days';

interface Described {
  label: string;
  hint: string;
}

interface MeasureMeta extends Described {
  type: Exclude<ColumnType, 'text'>;
}

/* ------------------------------------------------------------------
   The datasets.
   ------------------------------------------------------------------ */

export const DATASETS = {
  events: {
    label: 'אירועים',
    hint: 'שורה לכל אירוע, עם המשימות שבתוכו',

    dimensions: {
      month: { label: 'חודש האירוע', hint: 'לפי מתי האירוע עצמו קורה' },
      quarter: { label: 'רבעון האירוע', hint: 'שלושה חודשים בכל קבוצה' },
      year: { label: 'שנת האירוע', hint: 'שנה שלמה בכל קבוצה' },
      category: { label: 'סוג האירוע', hint: 'חג, קמפיין, סושיאל, תפעול ועוד' },
      status: { label: 'מצב האירוע', hint: 'המצב שנקבע לאירוע, לא כזה שמחושב מהמשימות' },
      board: { label: 'לוח', hint: 'באיזה לוח האירוע יושב' },
      kickoffMonth: { label: 'חודש העלייה לאוויר', hint: 'לפי מתי הקמפיין מתחיל להגיע ללקוחות' },
      meetingMonth: { label: 'חודש ישיבת ההתנעה', hint: 'לפי מתי נפגשים ומחלקים את העבודה' }
    },

    measures: {
      count: { label: 'מספר אירועים', hint: 'כמה אירועים יש בקבוצה', type: 'number' },
      taskCount: { label: 'מספר משימות', hint: 'כל המשימות שבאירועים האלה', type: 'number' },
      doneTaskCount: { label: 'משימות שהושלמו', hint: 'משימות שסומנו כהושלמו', type: 'number' },
      completionPct: {
        label: 'אחוז השלמה',
        hint: 'משימות שהושלמו מתוך כלל המשימות. ריק כשאין משימות בכלל',
        type: 'percent'
      },
      lateTaskCount: {
        label: 'משימות באיחור',
        hint: 'תאריך היעד עבר והמשימה עוד לא הושלמה',
        type: 'number'
      }
    },

    /** Which date the range filter applies to. One of the event's own moments. */
    dateFields: {
      actualDate: { label: 'תאריך האירוע', hint: 'מתי האירוע עצמו קורה' },
      kickoffDate: { label: 'עלייה לאוויר', hint: 'מתי הקמפיין מתחיל להגיע ללקוחות' },
      kickoffMeetingDate: { label: 'ישיבת התנעה', hint: 'מתי נפגשים ומחלקים את העבודה' },
      workStartDate: { label: 'תחילת עבודה', hint: 'היום המדויק שבו מתחילים, כשהוא ידוע' },
      reviewDate: { label: 'בקרה', hint: 'מתי בודקים שהכול מתקדם' },
      freezeDate: { label: 'הקפאת שינויים', hint: 'ממתי מפסיקים לבקש שינויים' },
      announceDate: { label: 'הודעה לחברה', hint: 'מתי מודיעים לחברה' },
      campaignEndDate: { label: 'סיום הקמפיין', hint: 'מתי הקמפיין נגמר' }
    },

    filters: ['dateRange', 'boardIds', 'categories', 'statuses', 'onlyOpen', 'onlyLate']
  },

  tasks: {
    label: 'משימות',
    hint: 'שורה לכל משימה, בכל האירועים',

    dimensions: {
      assignee: { label: 'אחראי', hint: 'על שם מי המשימה רשומה' },
      status: { label: 'מצב המשימה', hint: 'עוד לא התחיל, בתהליך, מוכן, הושלם' },
      priority: { label: 'עדיפות', hint: 'נמוכה, בינונית, גבוהה, דחופה' },
      board: { label: 'לוח', hint: 'הלוח שבו יושב האירוע של המשימה' },
      event: { label: 'אירוע', hint: 'האירוע שהמשימה שייכת לו' },
      dueMonth: { label: 'חודש היעד', hint: 'לפי תאריך היעד של המשימה' },
      completedMonth: { label: 'חודש ההשלמה', hint: 'לפי מתי המשימה סומנה כהושלמה' }
    },

    measures: {
      count: { label: 'מספר משימות', hint: 'כמה משימות יש בקבוצה', type: 'number' },
      doneCount: { label: 'משימות שהושלמו', hint: 'משימות שסומנו כהושלמו', type: 'number' },
      openCount: { label: 'משימות פתוחות', hint: 'כל מה שעוד לא הושלם', type: 'number' },
      lateCount: {
        label: 'משימות באיחור',
        hint: 'תאריך היעד עבר והמשימה עוד לא הושלמה',
        type: 'number'
      },
      completionPct: {
        label: 'אחוז השלמה',
        hint: 'הושלמו מתוך הכול. ריק כשאין משימות בכלל',
        type: 'percent'
      },
      avgDaysToComplete: {
        label: 'ימים בממוצע עד השלמה',
        hint: 'מרגע פתיחת המשימה ועד שסומנה כהושלמה',
        type: 'days'
      },
      onTimePct: {
        label: 'אחוז עמידה ביעד',
        hint: 'הושלמו עד תאריך היעד, מתוך המשימות שהושלמו ויש להן תאריך יעד',
        type: 'percent'
      }
    },

    dateFields: {
      dueDate: { label: 'תאריך יעד', hint: 'מתי המשימה אמורה להסתיים' },
      startDate: { label: 'תחילת המשימה', hint: 'מתי מתחילים בה' },
      endDate: { label: 'סיום המשימה', hint: 'מתי היא אמורה להיגמר' },
      completedAt: { label: 'מועד ההשלמה', hint: 'מתי היא סומנה כהושלמה בפועל' },
      createdAt: { label: 'מועד היצירה', hint: 'מתי המשימה נפתחה' }
    },

    filters: [
      'dateRange',
      'boardIds',
      'categories',
      'statuses',
      'priorities',
      'assigneeIds',
      'onlyOpen',
      'onlyLate'
    ]
  }
} as const satisfies Record<
  string,
  Described & {
    dimensions: Record<string, Described>;
    measures: Record<string, MeasureMeta>;
    dateFields: Record<string, Described>;
    filters: readonly string[];
  }
>;

export type DatasetName = keyof typeof DATASETS;

export type EventDimension = keyof (typeof DATASETS)['events']['dimensions'];
export type EventMeasure = keyof (typeof DATASETS)['events']['measures'];
export type EventDateField = keyof (typeof DATASETS)['events']['dateFields'];

export type TaskDimension = keyof (typeof DATASETS)['tasks']['dimensions'];
export type TaskMeasure = keyof (typeof DATASETS)['tasks']['measures'];
export type TaskDateField = keyof (typeof DATASETS)['tasks']['dateFields'];

export type Dimension = EventDimension | TaskDimension;
export type Measure = EventMeasure | TaskMeasure;

/** What each filter is called in the picker. Which of them a dataset accepts is `DATASETS[x].filters`. */
export const FILTER_META: Record<string, Described> = {
  dateRange: { label: 'טווח תאריכים', hint: 'בוחרים איזה תאריך סופרים, ומאיזה יום עד איזה יום' },
  boardIds: { label: 'לוחות', hint: 'רק הלוחות שסימנת. תמיד מוגבל למה שמותר לך לראות' },
  categories: { label: 'סוגי אירוע', hint: 'חג, קמפיין, סושיאל, תפעול ועוד' },
  statuses: { label: 'מצבים', hint: 'עוד לא התחיל, בתהליך, מוכן, הושלם' },
  priorities: { label: 'עדיפויות', hint: 'נמוכה, בינונית, גבוהה, דחופה' },
  assigneeIds: { label: 'אחראים', hint: 'רק המשימות של האנשים שסימנת' },
  onlyOpen: { label: 'רק מה שלא הושלם', hint: 'מסתיר כל מה שכבר נסגר' },
  onlyLate: { label: 'רק מה שבאיחור', hint: 'תאריך היעד עבר והעבודה לא הושלמה' }
};

/** How the result is drawn. Stored on a saved report, never used by the query. */
export const CHART_KINDS = ['bar', 'line', 'pie', 'table', 'number'] as const;
export const CHART_LABELS: Record<(typeof CHART_KINDS)[number], string> = {
  bar: 'עמודות',
  line: 'קו',
  pie: 'עוגה',
  table: 'טבלה',
  number: 'מספר בודד'
};

/* ------------------------------------------------------------------
   The schema. Anything not in the model is rejected here — there is no
   sanitising step that quietly drops an unknown key and runs anyway.
   ------------------------------------------------------------------ */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'כתוב את התאריך כך: YYYY-MM-DD');

const uuid = z.string().uuid('משהו בפרטים לא הסתדר. רענן את הדף ונסה שוב');

const dateRange = {
  dateField: z.string(),
  from: isoDate.optional(),
  to: isoDate.optional()
};

const sharedFilters = {
  boardIds: z.array(uuid).max(50).optional(),
  categories: z.array(z.enum(CATEGORY_VALUES)).max(CATEGORY_VALUES.length).optional(),
  statuses: z.array(z.enum(STATUS_VALUES)).max(STATUS_VALUES.length).optional(),
  onlyOpen: z.boolean().optional(),
  onlyLate: z.boolean().optional()
};

const eventFilters = z.strictObject({
  ...dateRange,
  dateField: z.enum(Object.keys(DATASETS.events.dateFields) as [EventDateField, ...EventDateField[]]).optional(),
  ...sharedFilters
});

const taskFilters = z.strictObject({
  ...dateRange,
  dateField: z.enum(Object.keys(DATASETS.tasks.dateFields) as [TaskDateField, ...TaskDateField[]]).optional(),
  ...sharedFilters,
  priorities: z.array(z.enum(PRIORITY_VALUES)).max(PRIORITY_VALUES.length).optional(),
  assigneeIds: z.array(uuid).max(50).optional()
});

/**
 * A range with no column to apply it to is not a smaller filter, it is an
 * ambiguous one — "since January" of which of the eight dates an event has.
 * Refused rather than defaulted, because a default here silently answers a
 * different question than the one somebody asked.
 */
const needsDateField = (f: { dateField?: string; from?: string; to?: string }) =>
  (!f.from && !f.to) || Boolean(f.dateField);
const DATE_FIELD_MESSAGE = 'בחר על איזה תאריך הטווח חל';

const eventsDefinition = z.strictObject({
  dataset: z.literal('events'),
  dimension: z.enum(Object.keys(DATASETS.events.dimensions) as [EventDimension, ...EventDimension[]]),
  measures: z
    .array(z.enum(Object.keys(DATASETS.events.measures) as [EventMeasure, ...EventMeasure[]]))
    .min(1, 'בחר לפחות מדד אחד')
    .max(6),
  filters: eventFilters.default({}).refine(needsDateField, { message: DATE_FIELD_MESSAGE, path: ['dateField'] }),
  /** The archive is a finished shelf, not a hidden one — it is opt-in, never default. */
  includeArchived: z.boolean().default(false)
});

const tasksDefinition = z.strictObject({
  dataset: z.literal('tasks'),
  dimension: z.enum(Object.keys(DATASETS.tasks.dimensions) as [TaskDimension, ...TaskDimension[]]),
  measures: z
    .array(z.enum(Object.keys(DATASETS.tasks.measures) as [TaskMeasure, ...TaskMeasure[]]))
    .min(1, 'בחר לפחות מדד אחד')
    .max(7),
  filters: taskFilters.default({}).refine(needsDateField, { message: DATE_FIELD_MESSAGE, path: ['dateField'] }),
  includeArchived: z.boolean().default(false)
});

export const reportDefinition = z.discriminatedUnion('dataset', [eventsDefinition, tasksDefinition]);

export type ReportDefinition = z.infer<typeof reportDefinition>;
export type EventDefinition = z.infer<typeof eventsDefinition>;
export type TaskDefinition = z.infer<typeof tasksDefinition>;

/**
 * One grouped cell, as the chart hands it back.
 *
 * `groupKey` is the raw group value the query produced — a month string, an
 * enum value, a board id — and null when the group is "no date". It is never
 * put into SQL as text: it is bound, and compared with `is not distinct from`
 * so the null bucket drills like any other.
 */
export const reportCell = z.strictObject({ groupKey: z.string().max(200).nullable() });
export type ReportCell = z.infer<typeof reportCell>;

export const chartKind = z.enum(CHART_KINDS);
export type ChartKind = z.infer<typeof chartKind>;

/**
 * The whole picker vocabulary, as JSON.
 *
 * Served by `GET /api/reports/model` so the screen never hardcodes a dimension
 * name, a measure name or a Hebrew label. Adding a measure is an entry above
 * and a SQL fragment in run.ts — nothing in the UI.
 */
export function reportModel() {
  const describe = (entries: Record<string, Described>) =>
    Object.entries(entries).map(([key, meta]) => ({ key, ...meta }));

  return {
    datasets: (Object.keys(DATASETS) as DatasetName[]).map((name) => {
      const ds = DATASETS[name];
      return {
        key: name,
        label: ds.label,
        hint: ds.hint,
        dimensions: describe(ds.dimensions),
        measures: Object.entries(ds.measures as Record<string, MeasureMeta>).map(([key, m]) => ({
          key,
          ...m
        })),
        dateFields: describe(ds.dateFields),
        filters: ds.filters.map((key) => ({ key, ...FILTER_META[key] }))
      };
    }),
    values: {
      categories: CATEGORY_VALUES.map((v) => ({ key: v, label: CATEGORY_LABELS[v] })),
      statuses: STATUS_VALUES.map((v) => ({ key: v, label: STATUS_LABELS[v] })),
      priorities: PRIORITY_VALUES.map((v) => ({ key: v, label: PRIORITY_LABELS[v] }))
    },
    charts: CHART_KINDS.map((key) => ({ key, label: CHART_LABELS[key] }))
  };
}
