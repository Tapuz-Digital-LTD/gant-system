import { and, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { israelNow } from '../notifications/prefs.js';
import {
  CATEGORY_LABELS,
  DATASETS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  reportDefinition,
  type ColumnType,
  type EventDateField,
  type EventDimension,
  type EventMeasure,
  type ReportCell,
  type ReportDefinition,
  type TaskDateField,
  type TaskDimension,
  type TaskMeasure
} from './model.js';

/**
 * Running a report, entirely inside Postgres.
 *
 * Two rules hold in this file and nowhere else can they be relaxed:
 *
 *  · Every group, count, sum and average is computed by the database. Nothing
 *    here fetches rows and reduces them in JavaScript. A report over a year of
 *    a shared workspace is thousands of tasks, and pulling them into a
 *    serverless function to count them is the exact failure `docs/deploy/
 *    performance.md` was written about — except it would arrive as memory
 *    rather than as latency, and only once the data grew.
 *
 *  · Nothing a client sends is ever spliced into SQL text. Dimensions and
 *    measures arrive as names, are looked up in a fixed map, and a name that is
 *    not in the map throws. Every value — dates, ids, enum members — is a bound
 *    parameter. There is no third path.
 */

/** More groups than a person reads, and the point at which a chart stops being one. */
const ROW_CAP = 1000;
/** One cell's worth of records. Enough to recognise them, not enough to be a data dump. */
const DRILL_CAP = 200;

/** A group with no value: an event with no go-live date, a task with no assignee. */
export interface ReportScope {
  /** Null for staff (unfiltered). A list — possibly empty — for a guest. */
  boardIds: string[] | null;
}

export interface ReportColumn {
  key: string;
  label: string;
  type: ColumnType;
}

export type ReportRow = Record<string, string | number | null>;

export interface ReportResult {
  columns: ReportColumn[];
  rows: ReportRow[];
  /** How many groups the query matched, before the cap. */
  total: number;
  truncated: boolean;
}

export interface DrillResult {
  columns: ReportColumn[];
  rows: ReportRow[];
  total: number;
  truncated: boolean;
}

export class UnknownReportTermError extends Error {
  constructor(what: string) {
    super(`אין לנו מדד או פילוח בשם הזה: ${what}`);
    this.name = 'UnknownReportTermError';
  }
}

/* ------------------------------------------------------------------
   Dimensions.

   `key` is what the query groups by and what a drill-down is later
   matched against; `display` is what a person reads. They differ only
   where the key is an id — nobody wants a uuid on an axis.
   ------------------------------------------------------------------ */

interface DimensionSql {
  key: SQL;
  display?: SQL;
  /** Enum values arrive as their database spelling and are named here, not in SQL. */
  labels?: Record<string, string>;
  /** Group by the key (months, years, enums sort naturally) or by the name (people, boards). */
  sort: 'key' | 'label';
  /** What the null group is called. Always a real Hebrew answer, never an empty cell. */
  empty: string;
}

const EVENT_DIMENSION_SQL: Record<EventDimension, DimensionSql> = {
  month: { key: sql`to_char(e.actual_date, 'YYYY-MM')`, sort: 'key', empty: 'ללא תאריך' },
  quarter: { key: sql`to_char(e.actual_date, 'YYYY-"Q"Q')`, sort: 'key', empty: 'ללא תאריך' },
  year: { key: sql`to_char(e.actual_date, 'YYYY')`, sort: 'key', empty: 'ללא תאריך' },
  category: { key: sql`e.category::text`, labels: CATEGORY_LABELS, sort: 'key', empty: 'ללא סוג' },
  status: { key: sql`e.status::text`, labels: STATUS_LABELS, sort: 'key', empty: 'ללא מצב' },
  board: { key: sql`b.id::text`, display: sql`b.name`, sort: 'label', empty: 'ללא לוח' },
  kickoffMonth: {
    key: sql`to_char(e.kickoff_date, 'YYYY-MM')`,
    sort: 'key',
    empty: 'בלי תאריך עלייה לאוויר'
  },
  meetingMonth: {
    key: sql`to_char(e.kickoff_meeting_date, 'YYYY-MM')`,
    sort: 'key',
    empty: 'בלי ישיבת התנעה'
  }
};

const TASK_DIMENSION_SQL: Record<TaskDimension, DimensionSql> = {
  assignee: { key: sql`t.assignee_id::text`, display: sql`u.name`, sort: 'label', empty: 'ללא אחראי' },
  status: { key: sql`t.status::text`, labels: STATUS_LABELS, sort: 'key', empty: 'ללא מצב' },
  priority: { key: sql`t.priority::text`, labels: PRIORITY_LABELS, sort: 'key', empty: 'ללא עדיפות' },
  board: { key: sql`b.id::text`, display: sql`b.name`, sort: 'label', empty: 'ללא לוח' },
  event: { key: sql`t.event_id::text`, display: sql`e.title`, sort: 'label', empty: 'ללא אירוע' },
  dueMonth: { key: sql`to_char(t.due_date, 'YYYY-MM')`, sort: 'key', empty: 'בלי תאריך יעד' },
  /*
   * Completion is a moment, and a moment lands on a day only once you say
   * where. A task ticked off at 23:30 on the 31st belongs to that month for the
   * person who ticked it — reading it in UTC would move it to the next one.
   */
  completedMonth: {
    key: sql`to_char(t.completed_at at time zone 'Asia/Jerusalem', 'YYYY-MM')`,
    sort: 'key',
    empty: 'עוד לא הושלמו'
  }
};

/* ------------------------------------------------------------------
   Measures. Every one is an aggregate; none of them can be computed
   without the group, which is the point.
   ------------------------------------------------------------------ */

/** `today` in Israel, so "late" means what a person here would call late. */
type MeasureSql = (today: string) => SQL;

/** Done out of total, or null when there was nothing to do — never a misleading 0%. */
const donePct = (total: SQL, done: SQL): SQL =>
  sql`round(100.0 * ${done} / nullif(${total}, 0), 1)::float8`;

const EVENT_MEASURE_SQL: Record<EventMeasure, MeasureSql> = {
  // `distinct`, because the tasks join multiplies an event by its task count.
  count: () => sql`count(distinct e.id)::int`,
  taskCount: () => sql`count(t.id)::int`,
  doneTaskCount: () => sql`count(t.id) filter (where t.status = 'done')::int`,
  completionPct: () =>
    donePct(sql`count(t.id)`, sql`count(t.id) filter (where t.status = 'done')`),
  lateTaskCount: (today) =>
    sql`count(t.id) filter (where t.status <> 'done' and t.due_date < ${today}::date)::int`
};

const TASK_MEASURE_SQL: Record<TaskMeasure, MeasureSql> = {
  count: () => sql`count(t.id)::int`,
  doneCount: () => sql`count(t.id) filter (where t.status = 'done')::int`,
  openCount: () => sql`count(t.id) filter (where t.status <> 'done')::int`,
  lateCount: (today) =>
    sql`count(t.id) filter (where t.status <> 'done' and t.due_date < ${today}::date)::int`,
  completionPct: () => donePct(sql`count(t.id)`, sql`count(t.id) filter (where t.status = 'done')`),
  avgDaysToComplete: () =>
    sql`round(
          (avg(extract(epoch from (t.completed_at - t.created_at)) / 86400.0)
            filter (where t.completed_at is not null))::numeric, 1)::float8`,
  /*
   * A task with no due date is neither on time nor late — it had no date to
   * meet. Counting it as a success would let a team raise this number by
   * leaving deadlines blank, so it is left out of both halves of the fraction.
   */
  onTimePct: () =>
    donePct(
      sql`count(t.id) filter (where t.status = 'done' and t.due_date is not null)`,
      sql`count(t.id) filter (where t.status = 'done' and t.due_date is not null
            and (t.completed_at at time zone 'Asia/Jerusalem')::date <= t.due_date)`
    )
};

/* ------------------------------------------------------------------
   Date fields the range filter may name. Timestamps are read as an
   Israeli day for the same reason completion months are.
   ------------------------------------------------------------------ */

const EVENT_DATE_SQL: Record<EventDateField, SQL> = {
  actualDate: sql`e.actual_date`,
  kickoffDate: sql`e.kickoff_date`,
  kickoffMeetingDate: sql`e.kickoff_meeting_date`,
  workStartDate: sql`e.work_start_date`,
  reviewDate: sql`e.review_date`,
  freezeDate: sql`e.freeze_date`,
  announceDate: sql`e.announce_date`,
  campaignEndDate: sql`e.campaign_end_date`
};

const TASK_DATE_SQL: Record<TaskDateField, SQL> = {
  dueDate: sql`t.due_date`,
  startDate: sql`t.start_date`,
  endDate: sql`t.end_date`,
  completedAt: sql`(t.completed_at at time zone 'Asia/Jerusalem')::date`,
  createdAt: sql`(t.created_at at time zone 'Asia/Jerusalem')::date`
};

/* ------------------------------------------------------------------
   The tables each dataset reads.
   ------------------------------------------------------------------ */

/** Events, with their tasks alongside — every event measure but `count` needs them. */
const EVENTS_AGG_FROM = sql`from events e
  join boards b on b.id = e.board_id
  left join tasks t on t.event_id = e.id`;

/** The same rows without the multiplying join, for listing events one per line. */
const EVENTS_PLAIN_FROM = sql`from events e
  join boards b on b.id = e.board_id`;

const TASKS_FROM = sql`from tasks t
  join events e on e.id = t.event_id
  join boards b on b.id = e.board_id
  left join users u on u.id = t.assignee_id`;

/** A bound list for `in (...)`. Never string-joined — each value is its own parameter. */
const boundList = (values: readonly string[]): SQL =>
  sql.join(
    values.map((v) => sql`${v}`),
    sql`, `
  );

/**
 * Everything the query is allowed to see, in one place.
 *
 * Board scope comes from the session and is ANDed in last, so a definition that
 * names somebody else's board simply intersects to nothing. The caller cannot
 * widen it: there is no code path where `filters.boardIds` replaces the scope
 * rather than narrowing it.
 */
function buildWhere(definition: ReportDefinition, scope: ReportScope, today: string): SQL {
  const conditions: SQL[] = [];

  if (!definition.includeArchived) {
    conditions.push(sql`b.archived_at is null`, sql`e.archived_at is null`);
  }

  // The session's scope first, so it is never the thing somebody forgets.
  if (scope.boardIds) conditions.push(sql`b.id::text in (${boundList(scope.boardIds)})`);

  const shared = definition.filters;
  if (shared.boardIds?.length) conditions.push(sql`b.id::text in (${boundList(shared.boardIds)})`);
  if (shared.categories?.length) {
    conditions.push(sql`e.category::text in (${boundList(shared.categories)})`);
  }

  if (definition.dataset === 'events') {
    const f = definition.filters;
    if (f.dateField && (f.from || f.to)) {
      const column = EVENT_DATE_SQL[f.dateField];
      if (!column) throw new UnknownReportTermError(f.dateField);
      if (f.from) conditions.push(sql`${column} >= ${f.from}::date`);
      if (f.to) conditions.push(sql`${column} <= ${f.to}::date`);
    }
    if (f.statuses?.length) conditions.push(sql`e.status::text in (${boundList(f.statuses)})`);
    if (f.onlyOpen) conditions.push(sql`e.status <> 'done'`);
    /*
     * An event has no due date of its own, so "late" here can only mean that
     * work inside it is late. `exists` rather than a join: the answer is
     * yes-or-no, and joining would multiply the event again.
     */
    if (f.onlyLate) {
      conditions.push(sql`exists (
        select 1 from tasks lt
         where lt.event_id = e.id and lt.status <> 'done' and lt.due_date < ${today}::date)`);
    }
  } else {
    const f = definition.filters;
    if (f.dateField && (f.from || f.to)) {
      const column = TASK_DATE_SQL[f.dateField];
      if (!column) throw new UnknownReportTermError(f.dateField);
      if (f.from) conditions.push(sql`${column} >= ${f.from}::date`);
      if (f.to) conditions.push(sql`${column} <= ${f.to}::date`);
    }
    if (f.statuses?.length) conditions.push(sql`t.status::text in (${boundList(f.statuses)})`);
    if (f.priorities?.length) conditions.push(sql`t.priority::text in (${boundList(f.priorities)})`);
    if (f.assigneeIds?.length) {
      conditions.push(sql`t.assignee_id::text in (${boundList(f.assigneeIds)})`);
    }
    if (f.onlyOpen) conditions.push(sql`t.status <> 'done'`);
    if (f.onlyLate) conditions.push(sql`t.status <> 'done'`, sql`t.due_date < ${today}::date`);
  }

  return and(...conditions) ?? sql`true`;
}

function dimensionOf(definition: ReportDefinition): DimensionSql {
  const found =
    definition.dataset === 'events'
      ? EVENT_DIMENSION_SQL[definition.dimension as EventDimension]
      : TASK_DIMENSION_SQL[definition.dimension as TaskDimension];
  if (!found) throw new UnknownReportTermError(definition.dimension);
  return found;
}

/**
 * `pg` hands back `numeric` as a string and `float8` as a number; PGlite is not
 * always the same. A report that shows "12.5" in one place and 12.5 in another
 * because of a driver is not a rounding problem, it is a trust problem.
 */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const emptyResult = (columns: ReportColumn[]): ReportResult => ({
  columns,
  rows: [],
  total: 0,
  truncated: false
});

/** The columns a result declares, built from the model so the labels have one source. */
function columnsFor(definition: ReportDefinition): ReportColumn[] {
  const ds = DATASETS[definition.dataset];
  const dimensions: Record<string, { label: string }> = ds.dimensions;
  const measures: Record<string, { label: string; type: ColumnType }> = ds.measures;

  return [
    { key: 'group', label: dimensions[definition.dimension].label, type: 'text' },
    ...definition.measures.map((name: string) => {
      const meta = measures[name];
      if (!meta) throw new UnknownReportTermError(name);
      return { key: name, label: meta.label, type: meta.type };
    })
  ];
}

interface GroupedRow {
  group_key: string | null;
  group_label: string | null;
  total_groups: number;
  [alias: string]: string | number | null;
}

/**
 * One report, one round trip.
 *
 * The definition is parsed here as well as at the route. That is not
 * belt-and-braces for its own sake: `runReport` is exported and will be called
 * from a scheduled job or a test that never went through the router, and the
 * closed model is only closed if nothing can reach the SQL builder around it.
 */
export async function runReport(
  db: Database,
  definition: ReportDefinition,
  scope: ReportScope
): Promise<ReportResult> {
  const parsed = reportDefinition.parse(definition);
  const columns = columnsFor(parsed);

  // A guest invited to nothing sees nothing, and asks the database nothing.
  if (scope.boardIds && scope.boardIds.length === 0) return emptyResult(columns);

  const today = israelNow().date;
  const dim = dimensionOf(parsed);
  const where = buildWhere(parsed, scope, today);

  const measureSql = parsed.measures.map((name: string, i: number) => {
    const build =
      parsed.dataset === 'events'
        ? EVENT_MEASURE_SQL[name as EventMeasure]
        : TASK_MEASURE_SQL[name as TaskMeasure];
    if (!build) throw new UnknownReportTermError(name);
    return sql`${build(today)} as ${sql.identifier(`m${i}`)}`;
  });

  /*
   * `count(*) over ()` is the group count before the limit, so `truncated` is a
   * fact rather than "we asked for one more and got it". Window functions run
   * after grouping and before LIMIT, which is exactly the moment we need.
   */
  const rows = await db.execute<GroupedRow>(sql`
    select ${dim.key} as group_key,
           ${dim.display ?? dim.key} as group_label,
           ${sql.join(measureSql, sql`, `)},
           count(*) over ()::int as total_groups
      ${parsed.dataset === 'events' ? EVENTS_AGG_FROM : TASKS_FROM}
     where ${where}
     group by 1, 2
     order by ${dim.sort === 'label' ? sql`2` : sql`1`} asc nulls last
     limit ${ROW_CAP + 1}
  `);

  const total = rows.rows.length ? Number(rows.rows[0].total_groups) : 0;

  return {
    columns,
    total,
    truncated: total > ROW_CAP,
    rows: rows.rows.slice(0, ROW_CAP).map((row) => {
      const out: ReportRow = {
        group: label(row, dim),
        // Carried alongside the label, not in `columns`: it is what a click
        // sends back to `drillRows`, not something anybody reads.
        groupKey: row.group_key
      };
      parsed.measures.forEach((name: string, i: number) => {
        out[name] = toNumber(row[`m${i}`]);
      });
      return out;
    })
  };
}

function label(row: GroupedRow, dim: DimensionSql): string {
  if (row.group_key === null) return dim.empty;
  if (dim.labels) return dim.labels[row.group_key] ?? row.group_key;
  return row.group_label ?? row.group_key;
}

/* ------------------------------------------------------------------
   Drill-down: the records behind one bar.
   ------------------------------------------------------------------ */

const EVENT_DRILL_COLUMNS: ReportColumn[] = [
  { key: 'title', label: 'שם האירוע', type: 'text' },
  { key: 'board', label: 'לוח', type: 'text' },
  { key: 'category', label: 'סוג', type: 'text' },
  { key: 'status', label: 'מצב', type: 'text' },
  { key: 'actualDate', label: 'תאריך האירוע', type: 'text' },
  { key: 'kickoffDate', label: 'עלייה לאוויר', type: 'text' },
  { key: 'taskCount', label: 'משימות', type: 'number' }
];

const TASK_DRILL_COLUMNS: ReportColumn[] = [
  { key: 'title', label: 'שם המשימה', type: 'text' },
  { key: 'event', label: 'אירוע', type: 'text' },
  { key: 'board', label: 'לוח', type: 'text' },
  { key: 'assignee', label: 'אחראי', type: 'text' },
  { key: 'status', label: 'מצב', type: 'text' },
  { key: 'priority', label: 'עדיפות', type: 'text' },
  { key: 'dueDate', label: 'תאריך יעד', type: 'text' },
  { key: 'completedAt', label: 'הושלמה בתאריך', type: 'text' }
];

interface DrillRecord {
  // `db.execute` wants a plain row shape; the named fields below are what the
  // two selects below actually return.
  [column: string]: unknown;
  id: string;
  title: string | null;
  board: string | null;
  event?: string | null;
  category?: string | null;
  status: string | null;
  priority?: string | null;
  assignee?: string | null;
  actual_date?: string | null;
  kickoff_date?: string | null;
  due_date?: string | null;
  completed_at?: string | null;
  task_count?: number | null;
  total_rows: number;
}

/**
 * The records that make up one grouped cell.
 *
 * The filter is the report's own `where` plus one more term, so the list can
 * never contain a record the chart did not count — including the board scope,
 * which is applied here for the same reason and from the same place.
 *
 * Dates come back through `to_char`. `pg` turns a DATE column into a JavaScript
 * Date at the *server's* midnight, which is how a civil date becomes an instant
 * and then becomes the day before; a report is the last place that should
 * happen.
 */
export async function drillRows(
  db: Database,
  definition: ReportDefinition,
  cell: ReportCell,
  scope: ReportScope
): Promise<DrillResult> {
  const parsed = reportDefinition.parse(definition);
  const columns = parsed.dataset === 'events' ? EVENT_DRILL_COLUMNS : TASK_DRILL_COLUMNS;

  if (scope.boardIds && scope.boardIds.length === 0) {
    return { columns, rows: [], total: 0, truncated: false };
  }

  const today = israelNow().date;
  const dim = dimensionOf(parsed);
  const where = buildWhere(parsed, scope, today);
  // `is not distinct from` so the "no date" bucket drills like every other one;
  // `= null` would quietly return nothing and look like an empty group.
  const cellMatch = sql`${dim.key} is not distinct from ${cell.groupKey}`;

  const select =
    parsed.dataset === 'events'
      ? sql`select e.id,
                   e.title,
                   b.name as board,
                   e.category::text as category,
                   e.status::text as status,
                   to_char(e.actual_date, 'YYYY-MM-DD') as actual_date,
                   to_char(e.kickoff_date, 'YYYY-MM-DD') as kickoff_date,
                   (select count(*)::int from tasks dt where dt.event_id = e.id) as task_count,
                   count(*) over ()::int as total_rows
              ${EVENTS_PLAIN_FROM}
             where ${where} and ${cellMatch}
             order by e.actual_date asc nulls last, e.title asc
             limit ${DRILL_CAP + 1}`
      : sql`select t.id,
                   t.title,
                   b.name as board,
                   e.title as event,
                   u.name as assignee,
                   t.status::text as status,
                   t.priority::text as priority,
                   to_char(t.due_date, 'YYYY-MM-DD') as due_date,
                   to_char(t.completed_at at time zone 'Asia/Jerusalem', 'YYYY-MM-DD') as completed_at,
                   count(*) over ()::int as total_rows
              ${TASKS_FROM}
             where ${where} and ${cellMatch}
             order by t.due_date asc nulls last, t.title asc
             limit ${DRILL_CAP + 1}`;

  const result = await db.execute<DrillRecord>(select);
  const total = result.rows.length ? Number(result.rows[0].total_rows) : 0;

  return {
    columns,
    total,
    truncated: total > DRILL_CAP,
    rows: result.rows.slice(0, DRILL_CAP).map((r) =>
      parsed.dataset === 'events'
        ? {
            id: r.id,
            title: r.title,
            board: r.board,
            category: r.category ? CATEGORY_LABELS[r.category as keyof typeof CATEGORY_LABELS] ?? r.category : null,
            status: r.status ? STATUS_LABELS[r.status as keyof typeof STATUS_LABELS] ?? r.status : null,
            actualDate: r.actual_date ?? null,
            kickoffDate: r.kickoff_date ?? null,
            taskCount: toNumber(r.task_count)
          }
        : {
            id: r.id,
            title: r.title,
            event: r.event ?? null,
            board: r.board,
            assignee: r.assignee ?? 'ללא אחראי',
            status: r.status ? STATUS_LABELS[r.status as keyof typeof STATUS_LABELS] ?? r.status : null,
            priority: r.priority
              ? PRIORITY_LABELS[r.priority as keyof typeof PRIORITY_LABELS] ?? r.priority
              : null,
            dueDate: r.due_date ?? null,
            completedAt: r.completed_at ?? null
          }
    )
  };
}
