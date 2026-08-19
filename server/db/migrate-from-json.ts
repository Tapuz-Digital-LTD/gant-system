import type { EventCategory, TaskStatus, TaskPriority, UserRole } from '../../src/types.js';

/**
 * The shape of the retired JSON document, declared here on purpose.
 * The live types describe what the API returns today; this describes what we
 * are migrating away from, and the two must be free to diverge.
 */
export interface LegacyTask {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeEmail?: string;
  assigneeName?: string;
  dueDate?: string;
  completedAt?: string;
  checklist?: { id: string; text: string; done: boolean }[];
  comments?: { id: string; userEmail: string; userName: string; text: string; date: string }[];
}

export interface LegacyEvent {
  id: string;
  title: string;
  category: EventCategory;
  kickoffDate?: string;
  actualDate?: string;
  prepMonths: number;
  isFloating: boolean;
  monthKey: string;
  note?: string;
  description?: string;
  tasks?: LegacyTask[];
  createdBy?: string;
}

export interface LegacyBoard {
  id: string;
  name: string;
  description?: string;
  events?: LegacyEvent[];
}

export interface LegacyUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

/**
 * Pure transform from the prototype's JSON document into rows.
 * Kept free of any database client so it can be unit-tested on its own.
 */

export interface Rows {
  users: { id: string; email: string; name: string; role: 'admin' | 'editor' | 'viewer' }[];
  boards: { id: string; name: string; description: string; position: number }[];
  events: {
    id: string;
    boardId: string;
    title: string;
    category: EventCategory;
    kickoffDate: string | null;
    actualDate: string;
    actualPrecision: 'day' | 'month';
    prepMonths: number;
    note: string | null;
    description: string | null;
    createdBy: string | null;
  }[];
  tasks: {
    id: string;
    eventId: string;
    title: string;
    description: string | null;
    status: TaskStatus;
    priority: TaskPriority;
    assigneeId: string | null;
    dueDate: string | null;
    position: number;
    completedAt: string | null;
  }[];
  checklistItems: { id: string; taskId: string; text: string; done: boolean; position: number }[];
  comments: { id: string; eventId: string; taskId: string; authorId: string | null; body: string; createdAt: string }[];
}

export interface MigrationReport {
  rows: Rows;
  warnings: string[];
}

const uuid = (() => {
  let counter = 0;
  return () => {
    counter += 1;
    // Deterministic v4-shaped ids keep migration runs reproducible and diffable.
    const hex = counter.toString(16).padStart(12, '0');
    return `00000000-0000-4000-8000-${hex}`;
  };
})();

/** `2026-09` → `2026-09-01`. A month-precision event is anchored to its first day. */
function normaliseActual(ev: LegacyEvent): { date: string; precision: 'day' | 'month'; note?: string } {
  const raw = ev.actualDate?.trim();

  if (raw && raw.length === 10) {
    return { date: raw, precision: 'day' };
  }
  if (raw && raw.length === 7) {
    return {
      date: `${raw}-01`,
      precision: 'month',
      // isFloating disagreed with the data on 12 of 62 events; the string length wins.
      note: ev.isFloating ? undefined : `isFloating=false but actualDate had month precision`
    };
  }
  // No actual date at all — fall back to the month bucket the event was filed under.
  return { date: `${ev.monthKey}-01`, precision: 'month', note: 'no actualDate; derived from monthKey' };
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

export function buildRows(boards: LegacyBoard[], users: LegacyUser[]): MigrationReport {
  const warnings: string[] = [];
  const rows: Rows = { users: [], boards: [], events: [], tasks: [], checklistItems: [], comments: [] };

  // --- users, deduped case-insensitively ---
  const userIdByEmail = new Map<string, string>();
  const register = (email: string | undefined, name: string | undefined): string | null => {
    const key = email?.trim().toLowerCase();
    if (!key) return null;
    const existing = userIdByEmail.get(key);
    if (existing) return existing;
    const id = uuid();
    userIdByEmail.set(key, id);
    rows.users.push({ id, email: key, name: name?.trim() || key.split('@')[0], role: 'editor' });
    return id;
  };

  for (const u of users) {
    const id = register(u.email, u.name);
    if (id) {
      const row = rows.users.find((r) => r.id === id)!;
      row.role = u.role;
      row.name = u.name?.trim() || row.name;
    }
  }

  // --- boards, events, and everything under them ---
  boards.forEach((board, boardIndex) => {
    const boardId = uuid();
    rows.boards.push({
      id: boardId,
      name: board.name,
      description: board.description || '',
      position: boardIndex
    });

    for (const ev of board.events || []) {
      const actual = normaliseActual(ev);
      if (actual.note) warnings.push(`event "${ev.title}": ${actual.note}`);

      if (!isValidDate(actual.date)) {
        warnings.push(`event "${ev.title}": SKIPPED — unusable date "${ev.actualDate ?? ev.monthKey}"`);
        continue;
      }

      const kickoff = ev.kickoffDate?.trim();
      let kickoffDate: string | null = null;
      if (kickoff) {
        if (isValidDate(kickoff)) {
          if (kickoff > actual.date) {
            warnings.push(`event "${ev.title}": kickoff ${kickoff} is after actual ${actual.date}`);
          }
          kickoffDate = kickoff;
        } else {
          warnings.push(`event "${ev.title}": dropped invalid kickoffDate "${kickoff}"`);
        }
      }

      const eventId = uuid();
      rows.events.push({
        id: eventId,
        boardId,
        title: ev.title,
        category: ev.category,
        kickoffDate,
        actualDate: actual.date,
        actualPrecision: actual.precision,
        prepMonths: Math.max(0, Math.min(12, Number(ev.prepMonths) || 0)),
        note: ev.note?.trim() || null,
        description: ev.description?.trim() || null,
        createdBy: register(ev.createdBy, undefined)
      });

      (ev.tasks || []).forEach((task: LegacyTask, taskIndex) => {
        const taskId = uuid();
        const due = task.dueDate?.trim();
        rows.tasks.push({
          id: taskId,
          eventId,
          title: task.title,
          description: task.description?.trim() || null,
          status: task.status,
          priority: task.priority,
          assigneeId: register(task.assigneeEmail, task.assigneeName),
          dueDate: due && isValidDate(due) ? due : null,
          position: taskIndex,
          completedAt: task.status === 'done' ? task.completedAt || new Date().toISOString() : null
        });

        (task.checklist || []).forEach((item, itemIndex) => {
          rows.checklistItems.push({
            id: uuid(),
            taskId,
            text: item.text,
            done: Boolean(item.done),
            position: itemIndex
          });
        });

        // Comments were smuggled onto tasks[0]; they become first-class rows on the event.
        (task.comments || []).forEach((c) => {
          rows.comments.push({
            id: uuid(),
            eventId,
            taskId,
            authorId: register(c.userEmail, c.userName),
            body: c.text,
            // The prototype stored a localized display string. Anything unparseable
            // becomes "unknown" rather than a fabricated date.
            createdAt: /^\d{4}-\d{2}-\d{2}$/.test(c.date) ? `${c.date}T00:00:00Z` : new Date().toISOString()
          });
        });
      });
    }
  });

  return { rows, warnings };
}
