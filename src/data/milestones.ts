import {
  Hammer,
  ClipboardCheck,
  Snowflake,
  Rocket,
  Megaphone,
  CalendarDays,
  Flag
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EventCategory, EventItem, MilestoneKey, isFloating } from '../types';

export type { MilestoneKey };

/**
 * The one description of every moment in an event's life.
 *
 * The form, the calendar, the timeline, the event panel, the legend and the
 * export all read this list. Nothing here may be duplicated into a component:
 * a word that appears in two places will eventually disagree with itself, and
 * the whole point of these names is that one thing has one name everywhere.
 *
 * Adding an eighth moment is a column, a row here, and nothing else.
 */

/** The fields on an event that hold a date. */
export type MilestoneField =
  | 'workStartDate'
  | 'reviewDate'
  | 'freezeDate'
  | 'kickoffDate'
  | 'announceDate'
  | 'actualDate'
  | 'campaignEndDate';

export interface MilestoneMeta {
  key: MilestoneKey;
  field: MilestoneField;
  /** The question the form asks. Always a plain question, never a term. */
  label: string;
  /** The short name on a chip, a legend row or a timeline marker. */
  short: string;
  /** One line of explanation under the field, in an employee's words. */
  hint: string;
  /** An example, so nobody has to guess what belongs here. */
  example: string;
  icon: LucideIcon;
  /** Tailwind class names, so a colour is declared once. */
  text: string;
  bg: string;
  border: string;
  /** Where it sits in the story, and the sort order everywhere. */
  order: number;
  /** Only the event date is required, and only it may be a whole month. */
  required: boolean;
  allowsMonth: boolean;
  /**
   * Categories where the form shows this field open rather than behind
   * "עוד תאריכי תכנון". A default, never a rule: every field stays available
   * for every category, and every optional field may be left empty.
   */
  openFor: EventCategory[];
}

/** The categories whose work reaches customers, so the launch dates matter. */
const CUSTOMER_FACING: EventCategory[] = ['campaign', 'social', 'b2b'];
const EVERY_CATEGORY: EventCategory[] = [
  'holiday',
  'campaign',
  'b2b',
  'social',
  'operational',
  'other'
];

export const MILESTONES: MilestoneMeta[] = [
  {
    key: 'workStart',
    field: 'workStartDate',
    label: 'מתי מתחילים לעבוד?',
    short: 'תחילת עבודה',
    hint: 'רק אם ידוע לך היום המדויק. אחרת נחשב לפי זמן ההכנה.',
    example: 'למשל: 12.11 — היום שבו הצוות מתחיל לעבוד על האירוע',
    icon: Hammer,
    text: 'text-ms-workstart',
    bg: 'bg-ms-workstart-soft',
    border: 'border-ms-workstart',
    order: 1,
    required: false,
    allowsMonth: false,
    openFor: []
  },
  {
    key: 'review',
    field: 'reviewDate',
    label: 'מתי בודקים שהכול מתקדם?',
    short: 'בקרה',
    hint: 'פגישה שבה מציגים מה מוכן ומעלים בעיות, בזמן שעוד אפשר לתקן.',
    example: 'למשל: 20.11 — פגישת בקרה עם כל מי שמעורב',
    icon: ClipboardCheck,
    text: 'text-ms-review',
    bg: 'bg-ms-review-soft',
    border: 'border-ms-review',
    order: 2,
    required: false,
    allowsMonth: false,
    openFor: CUSTOMER_FACING
  },
  {
    key: 'freeze',
    field: 'freezeDate',
    label: 'ממתי מפסיקים לבקש שינויים?',
    short: 'הקפאת שינויים',
    hint: 'מכאן מתמקדים בסיום ההכנות. המערכת רק מציגה — היא לא חוסמת עריכה.',
    example: 'למשל: 28.11 — מכאן לא מקבלים בקשות חדשות',
    icon: Snowflake,
    text: 'text-ms-freeze',
    bg: 'bg-ms-freeze-soft',
    border: 'border-ms-freeze',
    order: 3,
    required: false,
    allowsMonth: false,
    openFor: CUSTOMER_FACING
  },
  {
    key: 'kickoff',
    field: 'kickoffDate',
    label: 'מתי עולים לאוויר?',
    short: 'עלייה לאוויר',
    hint: 'היום שבו הקמפיין מתחיל להגיע ללקוחות — פרסום, דיוור, טעינת שוברים.',
    example: 'למשל: 6.12 — הפרסום מתחיל',
    icon: Rocket,
    text: 'text-ms-kickoff',
    bg: 'bg-ms-kickoff-soft',
    border: 'border-ms-kickoff',
    order: 4,
    required: false,
    allowsMonth: false,
    openFor: CUSTOMER_FACING
  },
  {
    key: 'announce',
    field: 'announceDate',
    label: 'מתי מודיעים לחברה?',
    short: 'הודעה לחברה',
    hint: 'הודעה פנימית לצוותים ולעובדים. לא חייב להיות אותו יום של העלייה לאוויר.',
    example: 'למשל: 6.12 — מייל לכל החברה',
    icon: Megaphone,
    text: 'text-ms-announce',
    bg: 'bg-ms-announce-soft',
    border: 'border-ms-announce',
    order: 5,
    required: false,
    allowsMonth: false,
    openFor: CUSTOMER_FACING
  },
  {
    key: 'actual',
    field: 'actualDate',
    label: 'מתי האירוע קורה?',
    short: 'תאריך האירוע',
    hint: 'המועד של האירוע עצמו. אם אין יום מדויק, אפשר לבחור חודש שלם.',
    example: 'למשל: 14.12 — נר ראשון של חנוכה',
    icon: CalendarDays,
    text: 'text-ms-actual',
    bg: 'bg-ms-actual-soft',
    border: 'border-ms-actual',
    order: 6,
    required: true,
    allowsMonth: true,
    openFor: EVERY_CATEGORY
  },
  {
    key: 'campaignEnd',
    field: 'campaignEndDate',
    label: 'מתי הקמפיין מסתיים?',
    short: 'סיום הקמפיין',
    hint: 'הסוף של המהלך, כולל הפניות הטלפוניות ללקוחות בנושא.',
    example: 'למשל: 31.12 — סוף המבצע',
    icon: Flag,
    text: 'text-ms-end',
    bg: 'bg-ms-end-soft',
    border: 'border-ms-end',
    order: 7,
    required: false,
    allowsMonth: false,
    openFor: CUSTOMER_FACING
  }
];

export const MILESTONE_BY_KEY: Record<MilestoneKey, MilestoneMeta> = Object.fromEntries(
  MILESTONES.map((m) => [m.key, m])
) as Record<MilestoneKey, MilestoneMeta>;

/** Everything except the event date: the optional ones a person may fill in. */
export const OPTIONAL_MILESTONES = MILESTONES.filter((m) => !m.required);

export interface MilestoneOccurrence {
  meta: MilestoneMeta;
  /** YYYY-MM-DD. For a month-precision event date this is the 1st. */
  date: string;
  /** True when the event date is a whole month, so no day may be shown. */
  monthOnly: boolean;
}

/**
 * The dates an event actually has, in timeline order.
 * An absent date is simply absent — it is never filled in from a sibling.
 */
export function milestonesOf(event: EventItem): MilestoneOccurrence[] {
  return MILESTONES.map((meta) => {
    const date = event[meta.field];
    if (!date) return null;
    return { meta, date, monthOnly: meta.key === 'actual' && isFloating(event) };
  })
    .filter((x): x is MilestoneOccurrence => x !== null)
    .sort((a, b) => a.date.localeCompare(b.date) || a.meta.order - b.meta.order);
}

/** The milestones that fall on one calendar day. Month-only dates never match. */
export function milestonesOnDay(event: EventItem, day: string): MilestoneOccurrence[] {
  return milestonesOf(event).filter((o) => !o.monthOnly && o.date === day);
}

export interface MilestoneWarning {
  key: MilestoneKey;
  message: string;
}

/**
 * Orders that usually mean a typo. These are *warnings*: the business rules are
 * not settled, and a plan the system refuses to record is worse than an odd one
 * it records with a question mark next to it.
 */
export function milestoneWarnings(
  event: Pick<EventItem, MilestoneField | 'actualPrecision'>
): MilestoneWarning[] {
  const out: MilestoneWarning[] = [];
  const {
    workStartDate: work,
    reviewDate: review,
    freezeDate: freeze,
    kickoffDate: kickoff,
    announceDate: announce,
    actualDate: actual,
    campaignEndDate: end
  } = event;

  const after = (a: string | null, b: string | null) => Boolean(a && b && a > b);

  if (after(review, freeze)) {
    out.push({ key: 'review', message: 'הבקרה אחרי הקפאת השינויים. בדוק אם זה נכון.' });
  }
  if (after(freeze, kickoff)) {
    out.push({ key: 'freeze', message: 'הקפאת השינויים אחרי העלייה לאוויר. בדוק אם זה נכון.' });
  }
  if (after(freeze, announce)) {
    out.push({ key: 'freeze', message: 'הקפאת השינויים אחרי ההודעה לחברה. בדוק אם זה נכון.' });
  }
  if (end && end < actual) {
    out.push({ key: 'campaignEnd', message: 'הקמפיין מסתיים לפני תאריך האירוע. בדוק אם זה נכון.' });
  }

  // Anything scheduled before work has started is worth a second look.
  if (work) {
    for (const m of MILESTONES) {
      if (m.key === 'workStart') continue;
      const d = event[m.field];
      if (d && d < work) {
        out.push({ key: m.key, message: `${m.short} לפני שמתחילים לעבוד. בדוק אם זה נכון.` });
      }
    }
  }

  return out;
}

/**
 * Where the work window starts, and whether that is a real day or a guess.
 * `approximate` is the whole reason this returns an object: a bar drawn from a
 * month calculation must not look as precise as one drawn from a typed date.
 */
export function workWindowStart(
  event: Pick<EventItem, 'workStartDate' | 'actualDate' | 'prepMonths'>
): { date: string; approximate: boolean } {
  if (event.workStartDate) return { date: event.workStartDate, approximate: false };

  const [y, m] = event.actualDate.slice(0, 7).split('-').map(Number);
  const ordinal = y * 12 + (m - 1) - Math.max(0, event.prepMonths || 0);
  const year = Math.floor(ordinal / 12);
  const month = (ordinal % 12) + 1;
  return { date: `${year}-${String(month).padStart(2, '0')}-01`, approximate: true };
}
