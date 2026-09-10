/*
 * Loaded on first use, not on every cold start.
 *
 * @hebcal/core is the largest dependency in the function by a wide margin, and
 * exactly one endpoint needs it. Parsing it during startup taxed every request
 * that never asks about holidays — which is almost all of them.
 */
type HebcalModule = typeof import('@hebcal/core');
let hebcal: HebcalModule | undefined;

async function loadHebcal(): Promise<HebcalModule> {
  hebcal ??= await import('@hebcal/core');
  return hebcal;
}

/**
 * The real Hebrew calendar, computed — never typed.
 *
 * The prototype's holiday dates were entered by hand and 22 of 28 were wrong,
 * some by four days. Nothing here is stored; every date is derived on request,
 * so leap years and postponements are always right.
 */

export type HolidayKind = 'major' | 'minor' | 'modern' | 'fast' | 'roshchodesh';

export interface Holiday {
  date: string;
  title: string;
  hebrewDate: string;
  kind: HolidayKind;
  /** A day people do not work — the planning constraint that actually matters. */
  isYomTov: boolean;
}

function classify(mask: number, flags: HebcalModule['flags']): HolidayKind {
  if (mask & flags.MAJOR_FAST || mask & flags.MINOR_FAST) return 'fast';
  if (mask & flags.MODERN_HOLIDAY) return 'modern';
  if (mask & flags.ROSH_CHODESH) return 'roshchodesh';
  if (mask & flags.MINOR_HOLIDAY) return 'minor';
  return 'major';
}

const HEB_MONTHS = [
  '', 'ניסן', 'אייר', 'סיוון', 'תמוז', 'אב', 'אלול',
  'תשרי', 'חשוון', 'כסלו', 'טבת', 'שבט', 'אדר', 'אדר א׳', 'אדר ב׳'
];

function hebrewDateOf(hd: InstanceType<HebcalModule['HDate']>): string {
  const month = HEB_MONTHS[hd.getMonth()] ?? '';
  return `${hd.getDate()} ב${month}`;
}

/** Israeli observance, Hebrew titles, one entry per day. */
export async function holidaysBetween(from: string, to: string): Promise<Holiday[]> {
  const { HebrewCalendar, HDate, flags } = await loadHebcal();
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);

  const raw = HebrewCalendar.calendar({
    start: new HDate(start),
    end: new HDate(end),
    il: true,
    locale: 'he',
    sedrot: false,
    candlelighting: false,
    omer: false,
    noMinorFast: false,
    noRoshChodesh: true,
    noSpecialShabbat: true
  });

  const seen = new Set<string>();
  const out: Holiday[] = [];

  for (const ev of raw) {
    const hd = ev.getDate();
    const date = hd.greg().toISOString().slice(0, 10);
    // Strip nikud: it renders inconsistently at small sizes.
    const title = ev.render('he').replace(/[֑-ׇ]/g, '');
    const key = `${date}|${title}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      date,
      title,
      hebrewDate: hebrewDateOf(hd),
      kind: classify(ev.getFlags(), flags),
      isYomTov: Boolean(ev.getFlags() & flags.CHAG)
    });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}
