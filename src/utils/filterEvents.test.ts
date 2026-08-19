// Run: npx tsx src/utils/filterEvents.test.ts
import assert from 'node:assert/strict';
import { filterEvents } from './filterEvents.ts';
import { EventItem, FilterState, TaskItem } from '../types.ts';

const base: FilterState = {
  search: '',
  category: 'all',
  status: 'all',
  assignee: 'all',
  showKickoffs: true,
  showActuals: true,
  year: 'all'
};

const DANA = '00000000-0000-4000-8000-00000000dana'.slice(0, 36);
const YONI = '00000000-0000-4000-8000-00000000yoni'.slice(0, 36);

const task = (over: Partial<TaskItem> = {}): TaskItem => ({
  id: 't1',
  eventId: 'e1',
  title: 'עיצוב באנרים',
  description: null,
  status: 'todo',
  priority: 'medium',
  assigneeId: DANA,
  startDate: null,
  endDate: null,
  dueDate: null,
  position: 0,
  completedAt: null,
  version: 1,
  ...over
});

const event = (over: Partial<EventItem> = {}): EventItem => ({
  id: 'e1',
  boardId: 'b1',
  title: 'ראש השנה',
  category: 'holiday',
  status: 'todo',
  kickoffDate: '2026-08-15',
  actualDate: '2026-09-11',
  actualPrecision: 'day',
  prepMonths: 4,
  note: 'שיתוף פעולה עם ועדי עובדים',
  description: 'קמפיין תווי שי לחג',
  tasks: [],
  createdAt: '2026-08-01',
  version: 1,
  ...over
});

const only = (evs: EventItem[], f: Partial<FilterState>) =>
  filterEvents(evs, { ...base, ...f }).map((e) => e.id);

// --- no filters ---
assert.deepEqual(only([event()], {}), ['e1'], 'default filter passes everything');

// --- search ---
assert.deepEqual(only([event()], { search: 'ראש' }), ['e1'], 'matches title');
assert.deepEqual(only([event()], { search: 'תווי שי' }), ['e1'], 'matches description');
assert.deepEqual(only([event()], { search: 'ועדי' }), ['e1'], 'matches note');
assert.deepEqual(only([event()], { search: 'פסח' }), [], 'non-match excluded');
assert.deepEqual(only([event()], { search: '   ' }), ['e1'], 'whitespace query is not a filter');
assert.deepEqual(only([event({ title: 'Rosh Hashana' })], { search: 'ROSH' }), ['e1'], 'case-insensitive');
assert.deepEqual(
  only([event({ tasks: [task()] })], { search: 'באנרים' }),
  ['e1'],
  'matches the title of a child task'
);
assert.deepEqual(
  only([event({ tasks: [task({ description: 'ניוזלטר חודשי' })] })], { search: 'ניוזלטר' }),
  ['e1'],
  'matches the description of a child task'
);

// --- category ---
assert.deepEqual(only([event()], { category: 'holiday' }), ['e1']);
assert.deepEqual(only([event()], { category: 'social' }), []);

// --- year: the regression that made views disagree ---
assert.deepEqual(only([event()], { year: '2026' }), ['e1'], 'matches via the derived month key');
assert.deepEqual(only([event()], { year: '2027' }), [], 'wrong year excluded');
assert.deepEqual(
  only([event({ actualDate: '2027-01-05', kickoffDate: null })], { year: '2027' }),
  ['e1'],
  'an event dated in the new year matches it'
);

// --- status / assignee: event matches when any task matches ---
const withTasks = event({
  tasks: [task({ id: 'a', status: 'done' }), task({ id: 'b', status: 'todo', assigneeId: YONI })]
});
assert.deepEqual(only([withTasks], { status: 'done' }), ['e1']);
assert.deepEqual(only([withTasks], { status: 'in_progress' }), []);
assert.deepEqual(only([withTasks], { assignee: YONI }), ['e1']);
assert.deepEqual(only([withTasks], { assignee: 'nobody' }), []);

// An event with no tasks cannot satisfy a task-level filter.
assert.deepEqual(only([event()], { status: 'done' }), [], 'taskless event fails status filter');
assert.deepEqual(only([event()], { assignee: DANA }), [], 'taskless event fails assignee filter');

// --- filters combine with AND ---
assert.deepEqual(only([withTasks], { category: 'holiday', year: '2026', status: 'done' }), ['e1']);
assert.deepEqual(only([withTasks], { category: 'social', year: '2026', status: 'done' }), []);

// --- input safety ---
assert.deepEqual(only([event({ tasks: undefined as unknown as TaskItem[] })], { search: 'ראש' }), ['e1'], 'missing tasks array must not throw');
assert.deepEqual(only([event({ description: null, note: null })], { search: 'ראש' }), ['e1'], 'missing optional text must not throw');
assert.deepEqual(only([], { search: 'x' }), [], 'empty input');

console.log('filterEvents: כל הבדיקות עברו ✓');
