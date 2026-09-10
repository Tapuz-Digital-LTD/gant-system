// @hebcal/hdate, not @hebcal/core: the calendar arithmetic without the
// holiday database, which the server already owns. Same answers, and it
// keeps ~35kB of gzipped holiday tables out of every page load.
import { HDate } from '@hebcal/hdate';
import { MonthMeta } from '../types';

/**
 * One idea of "the period I am looking at", shared by every view.
 *
 * Before this there were three: the calendar showed one month from a list, the
 * timeline ignored the selection and drew all 23 hard-coded months, and a
 * "year" filter quietly changed both. Picking a month looked like a filter and
 * behaved like a highlight.
 *
 * A period is an anchor day plus a mode. Everything else — the range, the
 * title, the months on a timeline — is derived, so no two views can disagree.
 *
 * All arithmetic runs on UTC milliseconds and comes back as YYYY-MM-DD. Nothing
 * here ever builds a Date from a local-time constructor, which is where the
 * midnight-shifts-a-day bugs come from.
 */

export type PeriodMode = 'month' | 'week';

export interface Period {
  mode: PeriodMode;
  /** Any day inside the period. The period itself is derived from it. */
  anchor: string;
}

const DAY = 86_400_000;

function ms(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function iso(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  return iso(ms(date) + n * DAY);
}

/** Adds whole months, clamping the day so 31 January + 1 lands on 28 February. */
export function addMonths(date: string, n: number): string {
  const d = new Date(ms(date));
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  return iso(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, lastDay)));
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: string): string {
  const d = new Date(ms(date));
  return iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

/** The Israeli working week starts on Sunday. */
export function startOfWeek(date: string): string {
  const d = new Date(ms(date));
  return iso(ms(date) - d.getUTCDay() * DAY);
}

/** Today in the viewer's own calendar — never a UTC instant. */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

/** Absolute month index, so arithmetic works across year boundaries. */
export function monthOrdinal(dateOrKey: string): number {
  const [y, m] = dateOrKey.slice(0, 7).split('-').map(Number);
  return y * 12 + (m - 1);
}

export function monthKeyFromOrdinal(ordinal: number): string {
  return `${Math.floor(ordinal / 12)}-${String((ordinal % 12) + 1).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- the period

export function periodOfToday(mode: PeriodMode = 'month'): Period {
  return { mode, anchor: todayISO() };
}

/** The days this period actually covers. This is what the calendar draws. */
export function periodRange(p: Period): { from: string; to: string } {
  if (p.mode === 'week') {
    const from = startOfWeek(p.anchor);
    return { from, to: addDays(from, 6) };
  }
  return { from: startOfMonth(p.anchor), to: endOfMonth(p.anchor) };
}

/** Previous or next period. The mode decides what "next" means. */
export function shiftPeriod(p: Period, delta: number): Period {
  return p.mode === 'week'
    ? { ...p, anchor: addDays(startOfWeek(p.anchor), delta * 7) }
    : { ...p, anchor: startOfMonth(addMonths(p.anchor, delta)) };
}

/**
 * Switching month↔week keeps the place rather than jumping to today.
 * Going month→week lands on the week containing the 1st, unless today is inside
 * that month, in which case it lands on this week — which is what someone
 * flipping the switch in September actually means.
 */
export function withMode(p: Period, mode: PeriodMode): Period {
  if (p.mode === mode) return p;
  if (mode === 'week') {
    const today = todayISO();
    const anchor = monthKey(today) === monthKey(p.anchor) ? today : startOfMonth(p.anchor);
    return { mode, anchor: startOfWeek(anchor) };
  }
  return { mode, anchor: startOfMonth(p.anchor) };
}

export function isSamePeriod(a: Period, b: Period): boolean {
  if (a.mode !== b.mode) return false;
  const ra = periodRange(a);
  const rb = periodRange(b);
  return ra.from === rb.from && ra.to === rb.to;
}

export function periodContains(p: Period, date: string): boolean {
  const { from, to } = periodRange(p);
  return date >= from && date <= to;
}

// ------------------------------------------------------------------- titles

const MONTH_NAMES = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
];

export function monthName(dateOrKey: string): string {
  return MONTH_NAMES[Number(dateOrKey.slice(5, 7)) - 1];
}

export function monthTitle(dateOrKey: string): string {
  return `${monthName(dateOrKey)} ${dateOrKey.slice(0, 4)}`;
}

/**
 * What the person is looking at, spelled out. A header that says only
 * "ספטמבר" leaves them guessing which year, and a week with no dates leaves
 * them guessing which week.
 */
export function periodTitle(p: Period): string {
  if (p.mode === 'month') return monthTitle(p.anchor);

  const { from, to } = periodRange(p);
  const d1 = Number(from.slice(8, 10));
  const d2 = Number(to.slice(8, 10));

  if (from.slice(0, 7) === to.slice(0, 7)) {
    return `${d1}–${d2} ב${monthName(from)} ${from.slice(0, 4)}`;
  }
  if (from.slice(0, 4) === to.slice(0, 4)) {
    return `${d1} ב${monthName(from)} – ${d2} ב${monthName(to)} ${to.slice(0, 4)}`;
  }
  return `${d1} ב${monthName(from)} ${from.slice(0, 4)} – ${d2} ב${monthName(to)} ${to.slice(0, 4)}`;
}

/**
 * "אלול – תשרי תשפ״ז" — computed rather than listed, so it stays right in any
 * year, including leap years where Adar splits in two.
 *
 * renderGematriya gives "י״ט אלול תשפ״ו"; the day is dropped and the month name
 * kept whole, which matters for the two-word "אדר א׳".
 */
export function hebrewMonthRange(monthKeyStr: string): string {
  const [y, m] = monthKeyStr.split('-').map(Number);
  const monthAndYear = (d: Date) => new HDate(d).renderGematriya(true).split(' ').slice(1);

  const a = monthAndYear(new Date(y, m - 1, 1));
  const b = monthAndYear(new Date(y, m, 0));

  const aText = a.join(' ');
  const bText = b.join(' ');
  if (aText === bText) return aText;

  // Same Hebrew year on both ends: say the year once.
  const aYear = a[a.length - 1];
  if (aYear === b[b.length - 1]) return `${a.slice(0, -1).join(' ')} – ${bText}`;
  return `${aText} – ${bText}`;
}

export function monthMeta(monthKeyStr: string): MonthMeta {
  const [year, monthNumber] = monthKeyStr.split('-').map(Number);
  return {
    key: monthKeyStr,
    title: monthTitle(monthKeyStr),
    hebrew: hebrewMonthRange(monthKeyStr),
    year,
    monthNumber
  };
}

// ------------------------------------------------------------ calendar grid

export interface CalendarDay {
  date: string;
  /** False for the leading and trailing days a month grid borrows from its
   *  neighbours. A week grid has none of those. */
  inPeriod: boolean;
  /** 0 = Sunday. */
  weekday: number;
}

/**
 * The days a calendar draws. A month is padded to whole weeks so the columns
 * line up; a week is exactly seven days and borrows nothing.
 */
export function calendarGrid(p: Period): CalendarDay[] {
  if (p.mode === 'week') {
    const from = startOfWeek(p.anchor);
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(from, i);
      return { date, inPeriod: true, weekday: i };
    });
  }

  const first = startOfMonth(p.anchor);
  const last = endOfMonth(p.anchor);
  const gridStart = startOfWeek(first);
  const days = Math.ceil((ms(last) - ms(gridStart)) / DAY + 1);

  return Array.from({ length: Math.ceil(days / 7) * 7 }, (_, i) => {
    const date = addDays(gridStart, i);
    return { date, inPeriod: date >= first && date <= last, weekday: i % 7 };
  });
}

// ----------------------------------------------------------------- timeline

/**
 * The months a timeline draws: a window that opens at the chosen period and
 * runs forward. A single month says nothing about when work starts, which is
 * the only question the timeline exists to answer.
 */
export function timelineMonths(p: Period, count = 12): MonthMeta[] {
  /*
   * At least one month, always.
   *
   * A zero-length window is not a smaller timeline, it is an empty array that
   * every caller then indexes into — and `months[0].key` on an empty array is
   * a blank screen rather than a narrow one. A count of zero can only arrive by
   * mistake, so the mistake is absorbed here instead of at each of the four
   * places that read months[0].
   */
  const months = Math.max(1, Math.floor(count) || 0) || 1;
  const first = monthOrdinal(p.anchor);
  return Array.from({ length: months }, (_, i) => monthMeta(monthKeyFromOrdinal(first + i)));
}

/** What to ask the server for. The timeline needs its whole window, not the period. */
export function timelineRange(p: Period, count = 12): { from: string; to: string } {
  const months = timelineMonths(p, count);
  return { from: `${months[0].key}-01`, to: endOfMonth(`${months[months.length - 1].key}-01`) };
}
