import type { Repo } from '../db/repo.js';
import { israelNow, type NotificationPrefs } from './prefs.js';
import {
  buildDigest,
  remindersForMilestones,
  remindersForTasks,
  type DigestSection,
  type Reminder
} from './reminders.js';

/**
 * One person's day, assembled.
 *
 * The engine in `reminders.ts` decides *what* is worth saying; this fetches
 * what it needs and nothing more. Kept separate so the rules can be argued with
 * in a test without a database anywhere near them.
 */

export interface PersonDigest {
  userId: string;
  sections: DigestSection[];
  reminders: Reminder[];
  /** What a manager also sees: other people's work that has gone wrong. */
  team: DigestSection[];
}

export async function digestFor(
  repo: Repo,
  person: { id: string; isGuest: boolean },
  prefs: NotificationPrefs,
  today = israelNow().date
): Promise<PersonDigest> {
  const boardIds = await repo.visibleBoardIds(person);

  const [tasks, milestones] = await Promise.all([
    repo.liveTasksForDigest(boardIds),
    repo.upcomingMilestones(boardIds, today, addDays(today, Math.max(prefs.milestoneBeforeDays, 0)))
  ]);

  // `assigned_at` comes back as a Date from the driver; the rules work on
  // YYYY-MM-DD so that "how many days" never depends on a time of day.
  const asReminderTask = (t: (typeof tasks)[number]) => ({
    ...t,
    assignedAt: t.assignedAt ? t.assignedAt.toISOString().slice(0, 10) : null
  });

  const mine = tasks.filter((t) => t.assigneeId === person.id).map(asReminderTask);

  /*
   * Campaign dates go to the people running that campaign.
   *
   * They used to go to everyone who could see the board, which is every member
   * of staff — so on the morning of any go-live, all eight employees received
   * the same email about an event none of them were working on. That is the
   * flood that teaches an organisation to filter these into a folder.
   *
   * "Running it" means holding a task on it. Somebody who is watching a
   * campaign without any of the work is watching, and can look.
   *
   * A manager who asked for the wider view still gets all of them: that is what
   * they turned the setting on for.
   */
  const involved = new Set(tasks.filter((t) => t.assigneeId === person.id).map((t) => t.eventId));
  const relevant =
    prefs.managerScope === 'none' ? milestones.filter((m) => involved.has(m.eventId)) : milestones;

  const reminders = [
    ...remindersForTasks(mine, prefs, today),
    ...remindersForMilestones(relevant, prefs, today)
  ];

  /*
   * A manager's half.
   *
   * Only what has gone wrong on somebody else's plate — late work, and work
   * nobody has picked up. Never "so-and-so moved a card", which is activity
   * rather than news and is exactly what makes a manager stop reading.
   *
   * 'team' and 'all' both mean "the boards this person can reach" today. The
   * distinction earns its own query when there are teams to distinguish.
   */
  let team: DigestSection[] = [];
  if (prefs.managerScope !== 'none') {
    const others = tasks.filter((t) => t.assigneeId && t.assigneeId !== person.id).map(asReminderTask);
    const theirs = remindersForTasks(others, { ...prefs, dueBeforeDays: 0 }, today);
    team = buildDigest(theirs.filter((r) => r.severity === 1 || r.kind === 'task_stalled'));
  }

  return { userId: person.id, sections: buildDigest(reminders), reminders, team };
}

/** True when there is anything at all worth sending. */
export function hasAnything(digest: PersonDigest): boolean {
  return digest.sections.length > 0 || digest.team.length > 0;
}

/**
 * The digest as plain text.
 *
 * Deliberately plain: it has to read the same in an email, in a log line during
 * the log-only period, and in the preview somebody approves before any of it is
 * switched on.
 */
export function digestText(digest: PersonDigest, greeting: string): string {
  const lines: string[] = [greeting, ''];

  for (const section of digest.sections) {
    lines.push(`${section.heading} (${section.items.length})`);
    for (const item of section.items) lines.push(`   · ${item.title} — ${item.body}`);
    lines.push('');
  }

  if (digest.team.length > 0) {
    lines.push('אצל הצוות');
    for (const section of digest.team) {
      for (const item of section.items) lines.push(`   · ${item.title} — ${item.body}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
