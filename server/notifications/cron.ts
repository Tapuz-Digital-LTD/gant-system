import { timingSafeEqual } from 'node:crypto';
import type { Repo } from '../db/repo.js';
import { digestFor, digestText, hasAnything } from './digest.js';
import { isDigestTime, israelNow } from './prefs.js';

/**
 * The daily digest job — writing nothing, sending nothing, yet.
 *
 * It runs every hour and asks each person "is this your hour?", rather than
 * owning one schedule of its own. That is the whole reason the hour can be a
 * setting instead of a deploy.
 *
 * Nothing leaves the building. Every digest goes to the log, so the messages
 * can be read for a week — real people, real work, real wording — before
 * anybody's phone is involved. Switching a channel on is a separate, deliberate
 * change; it is not a flag somebody flips by accident.
 */

export interface DigestOutcome {
  userId: string;
  name: string;
  /** Reason nothing happened, when nothing happened. */
  skipped?: 'not_their_hour' | 'nothing_to_say';
  sections?: number;
  items?: number;
  text?: string;
}

export interface DigestRun {
  at: { hour: number; weekday: number; date: string };
  /** Deliberately not a channel. Nothing is sent until somebody decides it is. */
  mode: 'log-only';
  considered: number;
  due: number;
  logged: number;
  outcomes: DigestOutcome[];
}

export async function runDigestJob(repo: Repo, at = israelNow()): Promise<DigestRun> {
  const people = await repo.peopleForDigest();
  const outcomes: DigestOutcome[] = [];

  for (const person of people) {
    const prefs = await repo.notificationPrefsFor(person.id);
    if (!isDigestTime(prefs, at)) {
      outcomes.push({ userId: person.id, name: person.name, skipped: 'not_their_hour' });
      continue;
    }

    const digest = await digestFor(repo, person, prefs, at.date);

    // Silence is a feature. "You have nothing today" is a message about
    // nothing, and it is the message that teaches people to stop looking.
    if (!hasAnything(digest)) {
      outcomes.push({ userId: person.id, name: person.name, skipped: 'nothing_to_say' });
      continue;
    }

    const text = digestText(digest, `בוקר טוב ${person.name} — מה דורש טיפול היום`);
    const items = digest.sections.reduce((n, s) => n + s.items.length, 0);
    outcomes.push({ userId: person.id, name: person.name, sections: digest.sections.length, items, text });

    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'digest_log_only',
        userId: person.id,
        date: at.date,
        items,
        text
      })
    );
  }

  const due = outcomes.filter((o) => o.skipped !== 'not_their_hour').length;
  return {
    at,
    mode: 'log-only',
    considered: people.length,
    due,
    logged: outcomes.filter((o) => !o.skipped).length,
    outcomes
  };
}

/**
 * Is this actually the scheduler?
 *
 * With no secret configured the job refuses to run at all — an open endpoint
 * that walks every user's work is not something to leave switched on by
 * default. Compared in constant time so a wrong guess tells the guesser
 * nothing about how wrong it was.
 */
export function cronAuthorised(header: string | undefined): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const given = Buffer.from(header?.replace(/^Bearer /, '') ?? '');
  const want = Buffer.from(secret);
  return given.length === want.length && timingSafeEqual(given, want);
}

export function cronConfigured(): boolean {
  return Boolean(process.env.CRON_SECRET);
}
