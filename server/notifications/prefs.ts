/**
 * What somebody wants to hear about, and how.
 *
 * The defaults are the product's opinion, and the opinion is: a notification
 * system is not good because it sends a lot. In-app is on because it costs
 * nobody anything and waits to be looked at. Email carries one digest a day and
 * only when there is something in it. SMS is off, because a text message
 * interrupts a person and almost nothing here is worth interrupting somebody
 * for.
 *
 * Read leniently on purpose: someone who has never opened the settings screen
 * has no row at all, and must still get sensible behaviour.
 *
 * `src/data/notifications.ts` mirrors this for the settings screen, and a test
 * asserts the two agree — the client cannot import server code, and two
 * defaults that quietly drift apart are worse than one that is written twice.
 */

export type EmailMode = 'digest' | 'off';
export type SmsMode = 'off' | 'urgent';

/** How wide a person's digest reaches. Offered only where permission allows. */
export type ManagerScope = 'none' | 'team' | 'all';

export interface NotificationPrefs {
  /** In-app is always on. It is the one channel that cannot interrupt anybody. */
  email: EmailMode;
  sms: SmsMode;
  /** Israel time, 0–23. */
  digestHour: number;
  /** 0 = Sunday. The Israeli working week by default. */
  digestDays: number[];
  /** Remind about work nobody has started after this many days. 0 turns it off. */
  stalledAfterDays: number;
  /** Warn this many days before a due date. 0 turns it off. */
  dueBeforeDays: number;
  /** Say something once a day about work whose date has passed. */
  overdue: boolean;
  /** Milestones on a campaign — review, freeze, go-live, end — this far ahead. */
  milestoneBeforeDays: number;
  managerScope: ManagerScope;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  email: 'digest',
  sms: 'off',
  digestHour: 8,
  digestDays: [0, 1, 2, 3, 4],
  stalledAfterDays: 3,
  dueBeforeDays: 2,
  overdue: true,
  milestoneBeforeDays: 3,
  managerScope: 'none'
};

const clampInt = (value: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof value === 'number' ? Math.round(value) : Number.NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/**
 * Anything at all in, valid preferences out.
 *
 * Stored JSON is not input we control forever: it was written by an older
 * version of this file, or by a hand-edited row. Every read passes through
 * here, so no screen and no job has to wonder whether a value is sane.
 */
export function readPrefs(raw: unknown, defaults: Partial<NotificationPrefs> = {}): NotificationPrefs {
  const base = { ...DEFAULT_PREFS, ...sanitisePartial(defaults) };
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { ...base, ...sanitisePartial(r as Partial<NotificationPrefs>) };
}

function sanitisePartial(r: Record<string, unknown> | Partial<NotificationPrefs>): Partial<NotificationPrefs> {
  const v = r as Record<string, unknown>;
  const out: Partial<NotificationPrefs> = {};

  if (v.email === 'digest' || v.email === 'off') out.email = v.email;
  if (v.sms === 'off' || v.sms === 'urgent') out.sms = v.sms;
  if (v.managerScope === 'none' || v.managerScope === 'team' || v.managerScope === 'all') {
    out.managerScope = v.managerScope;
  }
  if (v.digestHour !== undefined) out.digestHour = clampInt(v.digestHour, 0, 23, DEFAULT_PREFS.digestHour);
  if (v.stalledAfterDays !== undefined) {
    out.stalledAfterDays = clampInt(v.stalledAfterDays, 0, 30, DEFAULT_PREFS.stalledAfterDays);
  }
  if (v.dueBeforeDays !== undefined) {
    out.dueBeforeDays = clampInt(v.dueBeforeDays, 0, 14, DEFAULT_PREFS.dueBeforeDays);
  }
  if (v.milestoneBeforeDays !== undefined) {
    out.milestoneBeforeDays = clampInt(v.milestoneBeforeDays, 0, 30, DEFAULT_PREFS.milestoneBeforeDays);
  }
  if (typeof v.overdue === 'boolean') out.overdue = v.overdue;

  if (Array.isArray(v.digestDays)) {
    const days = [...new Set(v.digestDays.filter((d): d is number => typeof d === 'number' && d >= 0 && d <= 6))];
    // An empty list would mean "never", which the digest switch already says.
    // Reading it as "no days chosen yet" keeps the two controls from disagreeing.
    if (days.length > 0) out.digestDays = days.sort((a, b) => a - b);
  }

  return out;
}

/**
 * Has this person's digest come due, and have they not had today's yet?
 *
 * The rule used to be "is it exactly their hour", which requires the job to run
 * every hour. On a schedule that runs once a day that rule sends nothing at
 * all, silently: the single run lands at 07:00, everybody chose 08:00, nobody
 * matches, and nothing looks broken because nothing threw.
 *
 * "Their hour has arrived, and not yet today" is correct on both schedules, and
 * it self-heals — a run that never happened is caught by the next one rather
 * than being lost.
 */
export function isDigestDue(
  prefs: NotificationPrefs,
  at: { hour: number; weekday: number; date: string },
  lastSentOn: string | null
): boolean {
  if (!prefs.digestDays.includes(at.weekday)) return false;
  if (at.hour < prefs.digestHour) return false;
  return lastSentOn !== at.date;
}

/** The hour and weekday in Israel, whatever the server's own clock is set to. */
export function israelNow(now = new Date()): { hour: number; weekday: number; date: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    weekday: 'short'
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    hour: Number(get('hour')) % 24,
    weekday: weekdays[get('weekday')] ?? 0,
    date: `${get('year')}-${get('month')}-${get('day')}`
  };
}
