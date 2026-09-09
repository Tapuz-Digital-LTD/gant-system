import { NotificationPrefs } from './prefs.js';

/**
 * What is worth telling one person today.
 *
 * Pure on purpose: dates in, a list of notifications out. No database, no
 * clock, no sending. Everything about *when* to nag somebody is decided here
 * and can be argued with in a test, which is the only way rules like these
 * stay honest as they accumulate.
 *
 * Three rules run through all of it:
 *
 *  · Nothing recurring is said twice on the same day. Every key carries the
 *    date, and the unique index on notifications does the rest.
 *  · A reminder stops the moment its reason stops. Work that has started is
 *    not "not started"; work that is finished is not anything.
 *  · One line per task, not one per rule. A task that is late *and* was never
 *    started is late — saying both is two notifications about one problem.
 */

export type ReminderKind = 'task_overdue' | 'task_due_soon' | 'task_stalled' | 'milestone_soon';

export interface ReminderTask {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  assigneeId: string | null;
  /** When the work was handed over — the clock a "not started" reminder runs on. */
  assignedAt: string | null;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  boardId: string;
}

export interface ReminderMilestone {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  boardId: string;
  /** The milestone's own key, as in src/data/milestones.ts. */
  key: string;
  label: string;
  date: string;
}

export interface Reminder {
  kind: ReminderKind;
  title: string;
  body: string;
  link: string;
  entity: 'task' | 'event';
  entityId: string;
  dedupeKey: string;
  /** Ranking for the digest and the bell: 1 needs doing, 3 is worth knowing. */
  severity: 1 | 2 | 3;
}

const DAY = 86_400_000;

function daysBetween(from: string, to: string): number {
  const ms = (d: string) => {
    const [y, m, day] = d.slice(0, 10).split('-').map(Number);
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((ms(to) - ms(from)) / DAY);
}

const asDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('.');

function taskLink(t: ReminderTask): string {
  return `/b/${t.boardId}/calendar?d=${t.eventDate}&e=${t.eventId}`;
}

/** Work that is finished, or was never anybody's, is nobody's reminder. */
function isLive(task: ReminderTask): boolean {
  return task.status !== 'done' && Boolean(task.assigneeId);
}

/**
 * One person's reminders for one day.
 *
 * `today` is a YYYY-MM-DD in Israel, so "late" means what a person in Israel
 * would call late rather than what UTC would.
 */
export function remindersForTasks(
  tasks: ReminderTask[],
  prefs: NotificationPrefs,
  today: string
): Reminder[] {
  const out: Reminder[] = [];

  for (const task of tasks) {
    if (!isLive(task)) continue;

    // Late beats everything else this task could say. A task that is overdue
    // and also never started has one problem, and the person knows which.
    if (prefs.overdue && task.dueDate && task.dueDate < today) {
      const late = daysBetween(task.dueDate, today);
      out.push({
        kind: 'task_overdue',
        title: `באיחור: ${task.title}`,
        body: `${task.eventTitle} · היה אמור להסתיים ב-${asDate(task.dueDate)}${late > 1 ? ` (לפני ${late} ימים)` : ''}`,
        link: taskLink(task),
        entity: 'task',
        entityId: task.id,
        dedupeKey: `task_overdue:${task.id}:${today}`,
        severity: 1
      });
      continue;
    }

    if (prefs.dueBeforeDays > 0 && task.dueDate && task.dueDate >= today) {
      const left = daysBetween(today, task.dueDate);
      if (left <= prefs.dueBeforeDays) {
        out.push({
          kind: 'task_due_soon',
          title: `${whenWord(left)}: ${task.title}`,
          body: `${task.eventTitle} · עד ${asDate(task.dueDate)}`,
          link: taskLink(task),
          entity: 'task',
          entityId: task.id,
          dedupeKey: `task_due_soon:${task.id}:${today}`,
          severity: 2
        });
        continue;
      }
    }

    /*
     * Nobody has picked this up.
     *
     * Only for work still sitting in "not started": the moment somebody moves
     * it along, this reminder has nothing left to say and stops on its own —
     * no flag to clear, no state to remember.
     */
    if (prefs.stalledAfterDays > 0 && task.status === 'todo' && task.assignedAt) {
      const waiting = daysBetween(task.assignedAt.slice(0, 10), today);
      if (waiting >= prefs.stalledAfterDays) {
        out.push({
          kind: 'task_stalled',
          title: `עוד לא התחילה: ${task.title}`,
          body: `${task.eventTitle} · הוקצתה לפני ${waiting} ימים`,
          link: taskLink(task),
          entity: 'task',
          entityId: task.id,
          // Said once a week, not once a day. Nagging daily about work somebody
          // has chosen not to start yet is how a person mutes the whole system.
          dedupeKey: `task_stalled:${task.id}:${weekOf(today)}`,
          severity: 2
        });
      }
    }
  }

  return out;
}

/** Campaign dates coming up — review, freeze, go-live, the end of a campaign. */
export function remindersForMilestones(
  milestones: ReminderMilestone[],
  prefs: NotificationPrefs,
  today: string
): Reminder[] {
  if (prefs.milestoneBeforeDays <= 0) return [];

  return milestones
    .filter((m) => m.date >= today && daysBetween(today, m.date) <= prefs.milestoneBeforeDays)
    .map((m) => {
      const left = daysBetween(today, m.date);
      return {
        kind: 'milestone_soon' as const,
        title: `${m.label} — ${m.eventTitle}`,
        body: whenWord(left),
        link: `/b/${m.boardId}/calendar?d=${m.eventDate}&e=${m.eventId}`,
        entity: 'event' as const,
        entityId: m.eventId,
        dedupeKey: `milestone_soon:${m.eventId}:${m.key}:${today}`,
        severity: left === 0 ? 1 : 2
      };
    });
}

function whenWord(daysAway: number): string {
  if (daysAway <= 0) return 'היום';
  if (daysAway === 1) return 'מחר';
  if (daysAway === 2) return 'מחרתיים';
  return `בעוד ${daysAway} ימים`;
}

/** Monday-based week stamp, so a weekly reminder lands once per week. */
function weekOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  const day = new Date(t).getUTCDay();
  return new Date(t - ((day + 6) % 7) * DAY).toISOString().slice(0, 10);
}

export interface DigestSection {
  heading: string;
  severity: 1 | 2 | 3;
  items: Reminder[];
}

/**
 * The day's reminders as one message.
 *
 * Grouped by what they need from the reader — do something, know something —
 * and ordered so the first thing on screen is the first thing to do. An empty
 * digest is not a digest: the caller sends nothing rather than "you have
 * nothing", which is a message about nothing.
 */
export function buildDigest(reminders: Reminder[]): DigestSection[] {
  const HEADINGS: Record<1 | 2 | 3, string> = {
    1: 'דורש טיפול',
    2: 'בימים הקרובים',
    3: 'כדאי לדעת'
  };

  return ([1, 2, 3] as const)
    .map((severity) => ({
      heading: HEADINGS[severity],
      severity,
      items: reminders.filter((r) => r.severity === severity)
    }))
    .filter((section) => section.items.length > 0);
}
