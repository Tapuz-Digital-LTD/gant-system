// The report engine against a real Postgres running in-process, and the routes
// over real HTTP against it. Every expected number below is hand-calculated
// from the fixture — a test that asks the code what the answer is proves only
// that the code is consistent with itself.
// Run: npx tsx server/reports/reports.test.ts
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { ZodError } from 'zod';
import { mountBodyParsers } from '../http.ts';
import { ForbiddenError, UnauthenticatedError } from '../access.ts';
import { NotFoundError } from '../db/repo.ts';
import { createRepo, createReportsRepo } from '../db/repo.ts';
import type { Actor } from '../access.ts';
import type { Database } from '../db/client.ts';
import * as schema from '../db/schema.ts';
import { reportModel, type ReportDefinition } from './model.ts';
import { drillRows, runReport, type ReportResult } from './run.ts';
import { createReportsRouter } from './routes.ts';

const pg = new PGlite();
const dir = new URL('../db/migrations/', import.meta.url);
for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  for (const stmt of readFileSync(new URL(file, dir), 'utf-8').split('--> statement-breakpoint')) {
    const s = stmt.trim();
    if (s) await pg.exec(s);
  }
}
const db = drizzle(pg, { schema }) as unknown as Database;
const repo = createRepo(db);
const reportsRepo = createReportsRepo(db);

/* ------------------------------------------------------------------
   Fixture.

   Dates are deliberately far from today in both directions: 2020 is
   past and 2099 is future whenever this suite runs, so "late" is a
   fact of the fixture rather than of the day somebody ran it.
   ------------------------------------------------------------------ */

const [dana, yossi, admin, guest] = await db
  .insert(schema.users)
  .values([
    { email: 'dana@xtra.co.il', name: 'דנה', role: 'editor', isGuest: false },
    { email: 'yossi@xtra.co.il', name: 'יוסי', role: 'editor', isGuest: false },
    { email: 'admin@xtra.co.il', name: 'מנהלת', role: 'admin', isGuest: false },
    { email: 'agency@outside.com', name: 'משרד פרסום', role: 'viewer', isGuest: true }
  ])
  .returning();

const [b1, b2, b3] = await db
  .insert(schema.boards)
  .values([
    { name: 'אירועים וקמפיינים' },
    { name: 'סושיאל ותוכן' },
    { name: 'לוח שנסגר', archivedAt: new Date('2025-01-01T00:00:00Z') }
  ])
  .returning();

// The guest was invited to the social board and to nothing else.
await repo.grantBoardAccess(b2.id, guest.id, 'viewer');

type NewEvent = typeof schema.events.$inferInsert;
const ev = (o: NewEvent): NewEvent => o;

const [e1, e2, e3, e4, e5, e6, e7, e8, e11, e9, e10] = await db
  .insert(schema.events)
  .values([
    ev({ boardId: b1.id, title: 'ראש השנה', category: 'holiday', status: 'done', actualDate: '2024-01-15', kickoffDate: '2023-12-01', kickoffMeetingDate: '2023-11-01' }),
    ev({ boardId: b1.id, title: 'קמפיין חורף', category: 'campaign', status: 'in_progress', actualDate: '2024-01-20', kickoffDate: '2024-01-05' }),
    ev({ boardId: b1.id, title: 'פסח', category: 'holiday', status: 'todo', actualDate: '2024-04-10', kickoffMeetingDate: '2024-02-01' }),
    ev({ boardId: b1.id, title: 'מבצע קיץ', category: 'campaign', status: 'todo', actualDate: '2024-07-01', kickoffDate: '2024-06-15', kickoffMeetingDate: '2024-05-01' }),
    ev({ boardId: b1.id, title: 'יום המשפחה', category: 'b2b', status: 'done', actualDate: '2025-02-10', kickoffDate: '2025-01-20', kickoffMeetingDate: '2024-12-01' }),
    ev({ boardId: b2.id, title: 'תוכן ינואר', category: 'social', status: 'todo', actualDate: '2024-01-25' }),
    ev({ boardId: b2.id, title: 'תוכן מרץ', category: 'social', status: 'in_progress', actualDate: '2024-03-05', kickoffDate: '2024-03-01', kickoffMeetingDate: '2024-02-15' }),
    ev({ boardId: b2.id, title: 'קמפיין סושיאל', category: 'campaign', status: 'done', actualDate: '2025-02-20' }),
    // No tasks at all — the zero-denominator case for completionPct.
    ev({ boardId: b1.id, title: 'אירוע בלי משימות', category: 'operational', status: 'todo', actualDate: '2024-09-01' }),
    ev({ boardId: b1.id, title: 'אירוע בארכיון', category: 'campaign', status: 'done', actualDate: '2024-01-30', archivedAt: new Date('2025-01-01T00:00:00Z') }),
    ev({ boardId: b3.id, title: 'אירוע בלוח שנסגר', category: 'campaign', status: 'done', actualDate: '2024-01-31' })
  ])
  .returning();

type NewTask = typeof schema.tasks.$inferInsert;
const tk = (o: NewTask): NewTask => o;
const at = (iso: string) => new Date(iso);

await db.insert(schema.tasks).values([
  // board 1 — eight tasks
  tk({ eventId: e1.id, title: 'עיצוב באנרים', status: 'done', priority: 'high', assigneeId: dana.id, dueDate: '2024-01-10', createdAt: at('2024-01-01T09:00:00Z'), completedAt: at('2024-01-06T09:00:00Z') }),
  tk({ eventId: e1.id, title: 'טעינת שוברים', status: 'done', priority: 'medium', assigneeId: dana.id, dueDate: '2024-01-05', createdAt: at('2024-01-01T09:00:00Z'), completedAt: at('2024-01-08T09:00:00Z') }),
  tk({ eventId: e1.id, title: 'דיוור', status: 'todo', priority: 'low', assigneeId: yossi.id, dueDate: '2020-01-01' }),
  tk({ eventId: e2.id, title: 'קופי', status: 'in_progress', priority: 'urgent', assigneeId: dana.id, dueDate: '2099-01-01' }),
  tk({ eventId: e2.id, title: 'מדיה', status: 'todo', priority: 'medium' }),
  tk({ eventId: e3.id, title: 'תכנון', status: 'done', priority: 'medium', assigneeId: yossi.id, createdAt: at('2024-02-01T09:00:00Z'), completedAt: at('2024-02-04T09:00:00Z') }),
  tk({ eventId: e4.id, title: 'קריאייטיב', status: 'todo', priority: 'high', assigneeId: yossi.id, dueDate: '2020-06-01' }),
  tk({ eventId: e5.id, title: 'סיכום', status: 'done', priority: 'low', assigneeId: dana.id, dueDate: '2025-02-01', createdAt: at('2025-01-25T09:00:00Z'), completedAt: at('2025-01-30T09:00:00Z') }),
  // board 2 — four tasks
  tk({ eventId: e6.id, title: 'פוסטים', status: 'done', priority: 'medium', assigneeId: yossi.id, dueDate: '2024-01-20', createdAt: at('2024-01-10T09:00:00Z'), completedAt: at('2024-01-25T09:00:00Z') }),
  tk({ eventId: e7.id, title: 'וידאו', status: 'in_progress', priority: 'high', assigneeId: dana.id, dueDate: '2099-03-01' }),
  tk({ eventId: e7.id, title: 'סטוריז', status: 'todo', priority: 'low', assigneeId: yossi.id, dueDate: '2020-03-01' }),
  tk({ eventId: e8.id, title: 'ניתוח', status: 'done', priority: 'medium', dueDate: '2025-02-25', createdAt: at('2025-02-20T09:00:00Z'), completedAt: at('2025-02-22T09:00:00Z') }),
  // Behind the archive door. Nothing below may ever count these.
  tk({ eventId: e9.id, title: 'משימה בארכיון', status: 'todo', priority: 'low', dueDate: '2020-01-01' }),
  tk({ eventId: e10.id, title: 'משימה בלוח שנסגר', status: 'todo', priority: 'low', dueDate: '2020-01-01' })
]);

const STAFF = { boardIds: null };
const GUEST_SCOPE = { boardIds: [b2.id] };

/** The counts a dimension produced, as a plain object — order is asserted separately. */
function counts(result: ReportResult, measure = 'count'): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const row of result.rows) out[String(row.group)] = row[measure] as number | null;
  return out;
}

const events = (dimension: string, measures: string[] = ['count'], extra: object = {}) =>
  ({ dataset: 'events', dimension, measures, ...extra }) as unknown as ReportDefinition;
const tasks = (dimension: string, measures: string[] = ['count'], extra: object = {}) =>
  ({ dataset: 'tasks', dimension, measures, ...extra }) as unknown as ReportDefinition;

// ---------- events: every dimension groups correctly ----------

assert.deepEqual(counts(await runReport(db, events('month'), STAFF)), {
  '2024-01': 3,
  '2024-03': 1,
  '2024-04': 1,
  '2024-07': 1,
  '2024-09': 1,
  '2025-02': 2
}, 'month groups by the event date');

const byMonth = await runReport(db, events('month'), STAFF);
assert.deepEqual(byMonth.rows.map((r) => r.group), ['2024-01', '2024-03', '2024-04', '2024-07', '2024-09', '2025-02'], 'months come back in order');
assert.equal(byMonth.total, 6, 'total is the number of groups');
assert.equal(byMonth.truncated, false);
assert.deepEqual(byMonth.columns, [
  { key: 'group', label: 'חודש האירוע', type: 'text' },
  { key: 'count', label: 'מספר אירועים', type: 'number' }
], 'columns carry the Hebrew labels from the model');

assert.deepEqual(counts(await runReport(db, events('quarter'), STAFF)), {
  '2024-Q1': 4, '2024-Q2': 1, '2024-Q3': 2, '2025-Q1': 2
}, 'quarter buckets three months at a time');

assert.deepEqual(counts(await runReport(db, events('year'), STAFF)), { '2024': 7, '2025': 2 });

assert.deepEqual(counts(await runReport(db, events('category'), STAFF)), {
  'ועדים וארגונים': 1, 'חג ומועד': 2, 'סושיאל': 2, 'קמפיין': 3, 'תפעול': 1
}, 'categories come back named, not as their database spelling');

assert.deepEqual(counts(await runReport(db, events('status'), STAFF)), {
  'הושלם': 3, 'בתהליך': 2, 'עוד לא התחיל': 4
});

assert.deepEqual(counts(await runReport(db, events('board'), STAFF)), {
  'אירועים וקמפיינים': 6, 'סושיאל ותוכן': 3
});

assert.deepEqual(counts(await runReport(db, events('kickoffMonth'), STAFF)), {
  '2023-12': 1, '2024-01': 1, '2024-03': 1, '2024-06': 1, '2025-01': 1, 'בלי תאריך עלייה לאוויר': 4
}, 'events with no go-live date are a named group, not a blank one');

assert.deepEqual(counts(await runReport(db, events('meetingMonth'), STAFF)), {
  '2023-11': 1, '2024-02': 2, '2024-05': 1, '2024-12': 1, 'בלי ישיבת התנעה': 4
}, 'ישיבת התנעה groups on its own column, not on the go-live one');

// The empty bucket sorts last, so a chart does not open with "no date".
const kickoffOrder = (await runReport(db, events('kickoffMonth'), STAFF)).rows.map((r) => r.group);
assert.equal(kickoffOrder[kickoffOrder.length - 1], 'בלי תאריך עלייה לאוויר');

// ---------- events: every measure computes correctly ----------

const evMeasures = await runReport(
  db,
  events('board', ['count', 'taskCount', 'doneTaskCount', 'completionPct', 'lateTaskCount']),
  STAFF
);
const b1Row = evMeasures.rows.find((r) => r.group === 'אירועים וקמפיינים')!;
const b2Row = evMeasures.rows.find((r) => r.group === 'סושיאל ותוכן')!;

// Board 1: six events, eight tasks, four of them done, two overdue (2020 dates).
assert.deepEqual(
  { count: b1Row.count, taskCount: b1Row.taskCount, doneTaskCount: b1Row.doneTaskCount, completionPct: b1Row.completionPct, lateTaskCount: b1Row.lateTaskCount },
  { count: 6, taskCount: 8, doneTaskCount: 4, completionPct: 50, lateTaskCount: 2 }
);
// Board 2: three events, four tasks, two done, one overdue.
assert.deepEqual(
  { count: b2Row.count, taskCount: b2Row.taskCount, doneTaskCount: b2Row.doneTaskCount, completionPct: b2Row.completionPct, lateTaskCount: b2Row.lateTaskCount },
  { count: 3, taskCount: 4, doneTaskCount: 2, completionPct: 50, lateTaskCount: 1 }
);

// The zero-denominator case: an event with no tasks has no completion rate.
// Null, not 0% — "nothing done" is a different statement from "nothing to do".
const september = (await runReport(db, events('month', ['count', 'taskCount', 'completionPct']), STAFF)).rows.find(
  (r) => r.group === '2024-09'
)!;
assert.deepEqual({ count: september.count, taskCount: september.taskCount, completionPct: september.completionPct }, {
  count: 1,
  taskCount: 0,
  completionPct: null
});

// ---------- tasks: every dimension ----------

assert.deepEqual(counts(await runReport(db, tasks('assignee'), STAFF)), {
  'דנה': 5, 'יוסי': 5, 'ללא אחראי': 2
});
assert.deepEqual(counts(await runReport(db, tasks('status'), STAFF)), {
  'הושלם': 6, 'בתהליך': 2, 'עוד לא התחיל': 4
});
assert.deepEqual(counts(await runReport(db, tasks('priority'), STAFF)), {
  'נמוכה': 3, 'בינונית': 5, 'גבוהה': 3, 'דחופה': 1
});
assert.deepEqual(counts(await runReport(db, tasks('board'), STAFF)), {
  'אירועים וקמפיינים': 8, 'סושיאל ותוכן': 4
});
assert.deepEqual(counts(await runReport(db, tasks('event'), STAFF)), {
  'ראש השנה': 3, 'קמפיין חורף': 2, 'פסח': 1, 'מבצע קיץ': 1, 'יום המשפחה': 1,
  'תוכן ינואר': 1, 'תוכן מרץ': 2, 'קמפיין סושיאל': 1
});
assert.deepEqual(counts(await runReport(db, tasks('dueMonth'), STAFF)), {
  '2020-01': 1, '2020-03': 1, '2020-06': 1, '2024-01': 3, '2025-02': 2,
  '2099-01': 1, '2099-03': 1, 'בלי תאריך יעד': 2
});
assert.deepEqual(counts(await runReport(db, tasks('completedMonth'), STAFF)), {
  '2024-01': 3, '2024-02': 1, '2025-01': 1, '2025-02': 1, 'עוד לא הושלמו': 6
});

// ---------- tasks: every measure ----------

const tkMeasures = await runReport(
  db,
  tasks('board', ['count', 'doneCount', 'openCount', 'lateCount', 'completionPct', 'avgDaysToComplete', 'onTimePct']),
  STAFF
);
const t1 = tkMeasures.rows.find((r) => r.group === 'אירועים וקמפיינים')!;
const t2 = tkMeasures.rows.find((r) => r.group === 'סושיאל ותוכן')!;

/*
 * Board 1, by hand:
 *   done      עיצוב באנרים (5d, due 10th, finished 6th → on time)
 *             טעינת שוברים (7d, due 5th, finished 8th  → missed)
 *             תכנון        (3d, no due date at all     → not counted either way)
 *             סיכום        (5d, due 1.2, finished 30.1 → on time)
 *   open      קופי, מדיה, דיוור, קריאייטיב — of which דיוור and קריאייטיב are overdue
 *   average   (5 + 7 + 3 + 5) / 4 = 5
 *   on time   2 of the 3 finished tasks that had a date = 66.7%
 */
assert.deepEqual(
  { count: t1.count, doneCount: t1.doneCount, openCount: t1.openCount, lateCount: t1.lateCount,
    completionPct: t1.completionPct, avgDaysToComplete: t1.avgDaysToComplete, onTimePct: t1.onTimePct },
  { count: 8, doneCount: 4, openCount: 4, lateCount: 2, completionPct: 50, avgDaysToComplete: 5, onTimePct: 66.7 }
);

/*
 * Board 2, by hand:
 *   done   פוסטים (15d, due 20.1, finished 25.1 → missed)
 *          ניתוח  (2d,  due 25.2, finished 22.2 → on time)
 *   average (15 + 2) / 2 = 8.5 · on time 1 of 2 = 50%
 */
assert.deepEqual(
  { count: t2.count, doneCount: t2.doneCount, openCount: t2.openCount, lateCount: t2.lateCount,
    completionPct: t2.completionPct, avgDaysToComplete: t2.avgDaysToComplete, onTimePct: t2.onTimePct },
  { count: 4, doneCount: 2, openCount: 2, lateCount: 1, completionPct: 50, avgDaysToComplete: 8.5, onTimePct: 50 }
);

// onTimePct with nothing finished has no denominator, and says so with null
// rather than with a 0% that reads like a failure.
const urgent = (await runReport(db, tasks('priority', ['count', 'doneCount', 'onTimePct']), STAFF)).rows.find(
  (r) => r.group === 'דחופה'
)!;
assert.deepEqual({ count: urgent.count, doneCount: urgent.doneCount, onTimePct: urgent.onTimePct }, {
  count: 1,
  doneCount: 0,
  onTimePct: null
});

// ---------- filters ----------

assert.deepEqual(
  counts(await runReport(db, events('board', ['count'], { filters: { categories: ['holiday', 'campaign'] } }), STAFF)),
  { 'אירועים וקמפיינים': 4, 'סושיאל ותוכן': 1 },
  'a category filter narrows both boards'
);

assert.deepEqual(
  counts(await runReport(db, events('year', ['count'], { filters: { dateField: 'actualDate', from: '2025-01-01' } }), STAFF)),
  { '2025': 2 },
  'a range applies to the date column it names'
);

assert.deepEqual(
  counts(await runReport(db, events('year', ['count'], { filters: { dateField: 'kickoffMeetingDate', from: '2024-01-01' } }), STAFF)),
  { '2024': 3, '2025': 1 },
  // Four events have a kickoff meeting in 2024 — and one of them (יום המשפחה)
  // happens in 2025, which is exactly why the two dates are separate columns.
  'the same range on ישיבת התנעה is a different question and a different answer'
);

assert.deepEqual(
  counts(await runReport(db, tasks('board', ['count'], { filters: { onlyLate: true } }), STAFF)),
  { 'אירועים וקמפיינים': 2, 'סושיאל ותוכן': 1 }
);

assert.deepEqual(
  counts(await runReport(db, tasks('status', ['count'], { filters: { assigneeIds: [yossi.id] } }), STAFF)),
  // יוסי has five tasks: תכנון and פוסטים finished, דיוור, קריאייטיב and סטוריז not.
  { 'הושלם': 2, 'עוד לא התחיל': 3 }
);

// ---------- the archive stays shut unless it is asked for ----------

const openOnly = counts(await runReport(db, events('board'), STAFF));
assert.equal(Object.keys(openOnly).length, 2, 'an archived board is not a group');
assert.equal(openOnly['אירועים וקמפיינים'], 6, 'an archived event is not counted');

const withArchive = counts(await runReport(db, events('board', ['count'], { includeArchived: true }), STAFF));
assert.deepEqual(withArchive, { 'אירועים וקמפיינים': 7, 'לוח שנסגר': 1, 'סושיאל ותוכן': 3 },
  'asking for the archive returns it, and only then');

// ---------- THE SECURITY ASSERTION ----------
//
// A guest invited to one board must not be able to learn a number about
// another, no matter what the definition says. Scope comes from the session and
// is ANDed in; a definition naming somebody else's board can only intersect
// with what the session already allows, never replace it.

const guestEvents = await runReport(db, events('board', ['count', 'taskCount']), GUEST_SCOPE);
assert.deepEqual(counts(guestEvents), { 'סושיאל ותוכן': 3 }, 'a guest sees only their own board');
assert.equal(guestEvents.rows[0].taskCount, 4, "and only their own board's tasks");

const guestTasks = await runReport(db, tasks('assignee', ['count']), GUEST_SCOPE);
assert.deepEqual(counts(guestTasks), { 'דנה': 1, 'יוסי': 2, 'ללא אחראי': 1 },
  'the totals a guest sees add up to their board alone');

// Naming the board they were not invited to changes nothing: the two lists
// intersect to nothing rather than the request winning.
const guestAskingForB1 = await runReport(
  db,
  events('board', ['count'], { filters: { boardIds: [b1.id] } }),
  GUEST_SCOPE
);
assert.deepEqual(guestAskingForB1.rows, [], 'asking for a board you were not invited to returns nothing');
assert.equal(guestAskingForB1.total, 0);

// Asking for both returns only the permitted one — no leak through a wide list.
const guestAskingForBoth = await runReport(
  db,
  events('board', ['count'], { filters: { boardIds: [b1.id, b2.id] } }),
  GUEST_SCOPE
);
assert.deepEqual(counts(guestAskingForBoth), { 'סושיאל ותוכן': 3 });

// A guest invited to nothing gets an empty result, not everything.
const noBoards = await runReport(db, events('board'), { boardIds: [] });
assert.deepEqual(noBoards.rows, []);
assert.equal(noBoards.total, 0);

// The archive is not a way around the scope either.
const guestArchive = await runReport(db, events('board', ['count'], { includeArchived: true }), GUEST_SCOPE);
assert.deepEqual(counts(guestArchive), { 'סושיאל ותוכן': 3 });

// ---------- a name that is not in the model is refused ----------

await assert.rejects(
  () => runReport(db, events('nonsense'), STAFF),
  /dimension|invalid|option/i,
  'an unknown dimension is rejected at the schema, not sanitised'
);
await assert.rejects(() => runReport(db, events('month', ['avgDaysToComplete']), STAFF),
  'a measure that belongs to the other dataset is refused');
await assert.rejects(() => runReport(db, tasks('month'), STAFF),
  'an event dimension is not available on tasks');
await assert.rejects(
  () => runReport(db, events('month', ['count'], { filters: { dateField: 'actual_date; drop table events', from: '2024-01-01' } }), STAFF),
  'a date field that is not in the fixed list never reaches SQL'
);
await assert.rejects(
  () => runReport(db, events('month', ['count'], { filters: { priorities: ['high'] } }), STAFF),
  'a filter the dataset does not declare is refused rather than ignored'
);

// ---------- drill-down: exactly the records behind one cell ----------

const holidays = await drillRows(db, events('category'), { groupKey: 'holiday' }, STAFF);
assert.deepEqual(holidays.rows.map((r) => r.title), ['ראש השנה', 'פסח'], 'the two holidays, in date order');
assert.equal(holidays.total, 2);
assert.equal(holidays.rows[0].board, 'אירועים וקמפיינים');
assert.equal(holidays.rows[0].actualDate, '2024-01-15', 'a civil date stays a civil date');
assert.equal(holidays.rows[0].taskCount, 3);
assert.equal(holidays.rows[0].status, 'הושלם', 'drill rows are named in Hebrew too');

const yossiTasks = await drillRows(db, tasks('assignee'), { groupKey: yossi.id }, STAFF);
assert.deepEqual(
  yossiTasks.rows.map((r) => r.title).sort(),
  ['דיוור', 'סטוריז', 'פוסטים', 'קריאייטיב', 'תכנון'].sort(),
  'the five tasks that make up the יוסי bar'
);
assert.equal(yossiTasks.total, 5, 'the drill total matches the number the chart drew');

// The unassigned bucket drills like any other one.
const unassigned = await drillRows(db, tasks('assignee'), { groupKey: null }, STAFF);
assert.deepEqual(unassigned.rows.map((r) => r.title).sort(), ['מדיה', 'ניתוח'].sort());
assert.equal(unassigned.rows[0].assignee, 'ללא אחראי');

// And a guest drilling into a cell is scoped exactly as the chart was.
const guestDrill = await drillRows(db, tasks('assignee'), { groupKey: yossi.id }, GUEST_SCOPE);
assert.deepEqual(guestDrill.rows.map((r) => r.title).sort(), ['סטוריז', 'פוסטים'].sort(),
  'drilling does not reach past the boards the session allows');

// ---------- the model the picker is built from ----------

const model = reportModel();
assert.equal(model.datasets.length, 2);
const eventsModel = model.datasets.find((d) => d.key === 'events')!;
assert.equal(eventsModel.label, 'אירועים');
assert.ok(eventsModel.dimensions.every((d) => d.label && d.hint), 'every dimension carries a label and a hint');
assert.ok(eventsModel.measures.every((m) => m.label && m.hint && m.type), 'every measure says how to write it');
assert.ok(eventsModel.dateFields.some((f) => f.key === 'kickoffMeetingDate' && f.label === 'ישיבת התנעה'));
assert.ok(model.values.categories.some((c) => c.key === 'holiday' && c.label === 'חג ומועד'));

// ---------- saved reports and dashboards, over real HTTP ----------

let current: Actor = { id: dana.id, email: dana.email, name: dana.name, isGuest: false, isOwner: false, role: 'editor' };

const app = express();
mountBodyParsers(app);
app.use((req, _res, next) => {
  req.repo = repo;
  req.actor = current;
  next();
});
app.use('/api/reports', createReportsRouter(() => db));

/*
 * The error contract, as `server/api.ts` states it.
 *
 * Repeated here rather than reused because Express skips a nested router while
 * an error is in flight — a router is a three-argument function, and error
 * dispatch only calls four-argument ones. In production the reports router is
 * mounted *inside* the API router, so the real handler at the end of that same
 * stack answers. This is the smallest thing that reproduces it, and it is why
 * the assertions below can talk about 400 and 403 rather than about which
 * class was thrown.
 */
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ZodError) return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'יש שדה שצריך לתקן' } });
  if (err instanceof UnauthenticatedError) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: err.message } });
  if (err instanceof ForbiddenError) return res.status(403).json({ error: { code: 'FORBIDDEN', message: err.message } });
  if (err instanceof NotFoundError) return res.status(404).json({ error: { code: 'NOT_FOUND', message: err.message } });
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: String(err) } });
});

const server = app.listen(0);
const port = (server.address() as { port: number }).port;

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`http://127.0.0.1:${port}/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (text.trimStart().startsWith('<')) {
    throw new Error(`${method} ${path} answered ${res.status} in HTML, not JSON:\n${text.slice(0, 300)}`);
  }
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

// The vocabulary is served, so nothing in the UI has to hardcode it.
let r = await call('GET', '/reports/model');
assert.equal(r.status, 200);
assert.equal(r.json.data.datasets.length, 2);

const definition = { dataset: 'events', dimension: 'month', measures: ['count', 'completionPct'] };

r = await call('POST', '/reports/run', definition);
assert.equal(r.status, 200);
assert.equal(r.json.data.rows.length, 6, 'running over HTTP gives the same six months');

r = await call('POST', '/reports/run', { dataset: 'events', dimension: 'nope', measures: ['count'] });
assert.equal(r.status, 400, 'a definition outside the model is a validation failure, not a 500');
assert.equal(r.json.error.code, 'VALIDATION_FAILED');

r = await call('POST', '/reports/drill', { definition: { dataset: 'events', dimension: 'category', measures: ['count'] }, cell: { groupKey: 'holiday' } });
assert.equal(r.status, 200);
assert.equal(r.json.data.rows.length, 2);

// create
r = await call('POST', '/reports/saved', { name: 'אירועים לפי חודש', definition, chart: 'bar' });
assert.equal(r.status, 201);
const savedId: string = r.json.data.id;
assert.equal(r.json.data.ownerId, dana.id, 'a saved report belongs to whoever saved it');

// list — and it is the whole workspace's, not just the owner's
current = { id: yossi.id, email: yossi.email, name: yossi.name, isGuest: false, isOwner: false, role: 'editor' };
r = await call('GET', '/reports/saved');
assert.equal(r.status, 200);
assert.equal(r.json.data.length, 1, 'somebody else can see a report they did not write');

// duplicate — the copy belongs to whoever made it
r = await call('POST', `/reports/saved/${savedId}/duplicate`);
assert.equal(r.status, 201);
assert.equal(r.json.data.name, 'אירועים לפי חודש (עותק)');
assert.equal(r.json.data.ownerId, yossi.id, 'the copy is the copier\'s to change');
const copyId: string = r.json.data.id;

// a non-owner, non-admin may not change or delete somebody else's
r = await call('PATCH', `/reports/saved/${savedId}`, { name: 'שינוי' });
assert.equal(r.status, 403, 'editing another person\'s saved report is refused');
r = await call('DELETE', `/reports/saved/${savedId}`);
assert.equal(r.status, 403, 'deleting another person\'s saved report is refused');
assert.equal((await call('GET', '/reports/saved')).json.data.length, 2, 'and it is still there');

// but their own copy is theirs
r = await call('DELETE', `/reports/saved/${copyId}`);
assert.equal(r.status, 204);

// an admin can clear up after somebody who left
current = { id: admin.id, email: admin.email, name: admin.name, isGuest: false, isOwner: false, role: 'admin' };
r = await call('DELETE', `/reports/saved/${savedId}`);
assert.equal(r.status, 204, 'an admin may delete a report that is not theirs');
assert.equal((await call('GET', '/reports/saved')).json.data.length, 0);

// dashboard — one per person, and only your own
current = { id: dana.id, email: dana.email, name: dana.name, isGuest: false, isOwner: false, role: 'editor' };
r = await call('POST', '/reports/saved', { name: 'משימות לפי אחראי', definition: { dataset: 'tasks', dimension: 'assignee', measures: ['count'] }, chart: 'pie' });
const forDashboard: string = r.json.data.id;

r = await call('GET', '/reports/dashboard');
assert.equal(r.status, 200);
assert.deepEqual(r.json.data.layout, [], 'somebody who never opened the screen has an empty dashboard, not an error');

r = await call('PUT', '/reports/dashboard', { layout: [{ savedReportId: forDashboard, size: 'large' }] });
assert.equal(r.status, 200);
r = await call('PUT', '/reports/dashboard', { layout: [{ savedReportId: forDashboard, size: 'small' }] });
assert.equal(r.status, 200, 'saving again replaces the arrangement rather than adding a second row');
r = await call('GET', '/reports/dashboard');
assert.deepEqual(r.json.data.layout, [{ savedReportId: forDashboard, size: 'small' }]);

current = { id: yossi.id, email: yossi.email, name: yossi.name, isGuest: false, isOwner: false, role: 'editor' };
assert.deepEqual((await call('GET', '/reports/dashboard')).json.data.layout, [],
  'a dashboard is one person\'s, not the workspace\'s');

r = await call('PUT', '/reports/dashboard', { layout: [{ savedReportId: forDashboard, size: 'enormous' }] });
assert.equal(r.status, 400, 'a size the model does not know is refused');

// A guest running a report over HTTP is scoped from their session, never from the body.
current = { id: guest.id, email: guest.email, name: guest.name, isGuest: true, isOwner: false, role: 'viewer' };
r = await call('POST', '/reports/run', { dataset: 'events', dimension: 'board', measures: ['count'], filters: { boardIds: [b1.id] } });
assert.equal(r.status, 200);
assert.deepEqual(r.json.data.rows, [], 'the route resolves scope from the session, not from the body');

server.close();
await pg.close();
console.log('reports: כל הבדיקות עברו ✓');
