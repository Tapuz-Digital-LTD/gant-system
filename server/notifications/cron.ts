import { timingSafeEqual } from 'node:crypto';
import type { Repo } from '../db/repo.js';
import { digestFor, digestText, hasAnything } from './digest.js';
import { deliveryMode, sendEmail } from './inforu.js';
import { isDigestDue, israelNow } from './prefs.js';

/**
 * The hourly job behind every reminder.
 *
 * Two different things happen here, and they are on purpose not on the same
 * schedule.
 *
 * The bell is filled every hour. In-app costs nobody anything and interrupts
 * nobody — it waits to be looked at — so making somebody wait until 08:00 to
 * see that a task went overdue would be withholding it for no reason. The
 * dedupe key carries the date, so "every hour" still means "once, on the day
 * it becomes true".
 *
 * The email goes once, at the hour that person chose, and only if there is
 * something in it. That is the part that arrives whether or not they are
 * looking, so it is the part that has an hour, a set of days, and a switch.
 *
 * Sending is off until GANTT_NOTIFICATIONS_SEND says otherwise; until then the
 * digest goes to the log in full, so a week of real messages about real work
 * can be read before anybody's inbox is involved.
 */

export interface DigestOutcome {
  userId: string;
  name: string;
  /** How many reminders reached the bell — new ones only; repeats are deduped. */
  toBell: number;
  /** Reason no email happened, when none did. */
  skipped?: 'not_their_hour' | 'nothing_to_say' | 'email_off';
  sections?: number;
  items?: number;
  text?: string;
  /** Whether an email actually left the building. */
  emailed?: boolean;
}

export interface DigestRun {
  at: { hour: number; weekday: number; date: string };
  /** What would happen to an email right now, given the environment. */
  mode: 'send' | 'log' | 'unconfigured';
  considered: number;
  /** People whose chosen hour this is. */
  due: number;
  /** Digests with something in them. */
  logged: number;
  /** Emails that actually went out. */
  sent: number;
  /** Reminders newly written to bells this run. */
  toBell: number;
  outcomes: DigestOutcome[];
}

export async function runDigestJob(repo: Repo, at = israelNow()): Promise<DigestRun> {
  const people = await repo.peopleForDigest();
  const outcomes: DigestOutcome[] = [];

  /*
   * Two gates, and the stricter one wins.
   *
   * The environment says whether this deployment may send at all; the switch
   * says whether the organisation has turned the daily summary on. An admin who
   * has switched it off sees exactly the same behaviour as before it was ever
   * connected — the bell still fills, and the digest still goes to the log where
   * it can be read.
   */
  const mode = (await repo.channelSwitches()).digest ? deliveryMode('notification') : 'log';

  for (const person of people) {
    const prefs = await repo.notificationPrefsFor(person.id);
    const digest = await digestFor(repo, person, prefs, at.date);

    /*
     * The bell, every hour.
     *
     * `notify` returns false for a key that already exists, so a reminder
     * appears on the day it becomes true and not once an hour after that.
     * Only the person's own work goes here — a manager's view of other
     * people's problems belongs in their digest, not as items in their bell.
     */
    let toBell = 0;
    for (const reminder of digest.reminders) {
      const fresh = await repo.notify({
        userId: person.id,
        kind: reminder.kind,
        title: reminder.title,
        body: reminder.body,
        link: reminder.link,
        entity: reminder.entity,
        entityId: reminder.entityId,
        dedupeKey: reminder.dedupeKey
      });
      if (fresh) toBell++;
    }

    const base = { userId: person.id, name: person.name, toBell };

    if (!isDigestDue(prefs, at, person.lastDigestOn ?? null)) {
      outcomes.push({ ...base, skipped: 'not_their_hour' });
      continue;
    }
    if (prefs.email === 'off') {
      outcomes.push({ ...base, skipped: 'email_off' });
      continue;
    }

    /*
     * Silence is a feature. "You have nothing today" is a message about
     * nothing, and it is the message that teaches people to stop looking.
     *
     * A quiet day is still marked as handled: otherwise every later run of the
     * day reconsiders this person, and the first hour that produces anything
     * sends them a "morning digest" in the afternoon.
     */
    if (!hasAnything(digest)) {
      await repo.markDigestSent(person.id, at.date);
      outcomes.push({ ...base, skipped: 'nothing_to_say' });
      continue;
    }

    const greeting = `בוקר טוב ${person.name} — מה דורש טיפול היום`;
    const text = digestText(digest, greeting);
    const items = digest.sections.reduce((n, s) => n + s.items.length, 0);

    console.log(
      JSON.stringify({ level: 'info', msg: 'digest', userId: person.id, date: at.date, items, mode, text })
    );

    let emailed = false;
    if (mode === 'send' && person.email) {
      const result = await sendEmail({
        to: person.email,
        name: person.name,
        subject: greeting,
        html: digestHtml(greeting, text),
        text,
        purpose: 'notification'
      });
      emailed = result.ok;
      if (!result.ok) {
        console.error(
          JSON.stringify({ level: 'error', msg: 'digest_not_sent', userId: person.id, error: result.error })
        );
      }
    }

    await repo.markDigestSent(person.id, at.date);
    outcomes.push({ ...base, sections: digest.sections.length, items, text, emailed });
  }

  return {
    at,
    mode,
    considered: people.length,
    due: outcomes.filter((o) => o.skipped !== 'not_their_hour').length,
    logged: outcomes.filter((o) => !o.skipped).length,
    sent: outcomes.filter((o) => o.emailed).length,
    toBell: outcomes.reduce((n, o) => n + o.toBell, 0),
    outcomes
  };
}

/**
 * The digest as an email.
 *
 * The plain text is the source; this only gives it a readable shape. Anything
 * cleverer would mean maintaining two versions of the same message and finding
 * out later that they had drifted.
 */
function digestHtml(greeting: string, text: string): string {
  const body = text
    .split('\n')
    .slice(1)
    .map((line) => {
      const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      if (!escaped.trim()) return '<div style="height:12px"></div>';
      if (escaped.startsWith('   · ')) {
        return `<p style="margin:0 0 6px;padding-inline-start:14px;font-size:15px;color:#1a1f33">• ${escaped.slice(5)}</p>`;
      }
      return `<p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#576078">${escaped}</p>`;
    })
    .join('');

  return `<!doctype html>
<html lang="he" dir="rtl"><body style="margin:0;background:#f3f5f9;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:520px;background:#fff;border-radius:12px;padding:24px;text-align:right">
        <tr><td>
          <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#1a1f33">${greeting}</p>
          ${body}
          <p style="margin:20px 0 0;font-size:12px;color:#848da5">
            אפשר לשנות מה נשלח ומתי, במסך ההגדרות במערכת.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
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
