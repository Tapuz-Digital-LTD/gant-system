import {
  Users,
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
  | 'kickoffMeetingDate'
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
  /**
   * Words that change with the kind of work.
   *
   * A campaign does not "happen" on a day, it starts; a holiday is not
   * something anybody schedules. Asking a marketer "מתי האירוע קורה?" about a
   * sale, directly above a field called "עלייה לאוויר", is how two different
   * dates come to sound like the same date typed twice.
   *
   * Only the wording moves. The field, the meaning and the stored value are
   * identical for every category, so the calendar, the timeline and every
   * export keep reading one thing.
   */
  byCategory?: Partial<Record<EventCategory, Partial<Pick<MilestoneMeta, 'label' | 'short' | 'hint'>>>>;
}

/**
 * What this milestone is called for this kind of work.
 *
 * One function, so a name cannot resolve one way in the form and another way
 * on the calendar.
 */
export function milestoneText(
  meta: MilestoneMeta,
  category: EventCategory | undefined
): Pick<MilestoneMeta, 'label' | 'short' | 'hint'> {
  const override = (category && meta.byCategory?.[category]) || {};
  return {
    label: override.label ?? meta.label,
    short: override.short ?? meta.short,
    hint: override.hint ?? meta.hint
  };
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
    key: 'kickoffMeeting',
    field: 'kickoffMeetingDate',
    label: 'מתי ישיבת ההתנעה?',
    short: 'ישיבת התנעה',
    hint: 'הפגישה שפותחת את העבודה: כל מי שמעורב יושב, מסכמים מה צריך לקרות, ומחלקים משימות.',
    example: 'למשל: 20.10 — כל בעלי התפקידים בחדר אחד',
    icon: Users,
    text: 'text-ms-meeting',
    bg: 'bg-ms-meeting-soft',
    border: 'border-ms-meeting',
    order: 1,
    required: false,
    allowsMonth: false,
    /*
     * Open for everything, and first.
     *
     * It is the one date the planning file records for almost every activity —
     * 45 of 51 — and the moment work is actually handed to people. Hiding it
     * behind "עוד תאריכי תכנון" would bury the field the product exists for.
     */
    openFor: EVERY_CATEGORY,
    byCategory: {
      campaign: { label: 'מתי ישיבת ההתנעה של המבצע?' },
      holiday: { label: 'מתי נפגשים כדי לתכנן?' },
      operational: { label: 'מתי נפגשים כדי לחלק את העבודה?' }
    }
  },
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
    order: 2,
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
    order: 3,
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
    order: 4,
    required: false,
    allowsMonth: false,
    openFor: CUSTOMER_FACING
  },
  {
    key: 'kickoff',
    field: 'kickoffDate',
    label: 'מתי מתחילים לפרסם?',
    short: 'עלייה לאוויר',
    hint: 'היום שבו מתחילים לפרסם החוצה — פרסום, דיוור, טעינת שוברים. למלא רק אם זה יום אחר מהמועד המרכזי.',
    byCategory: {
      campaign: {
        label: 'מתי מתחילים לפרסם את המבצע?',
        hint: 'היום שבו הפרסום יוצא ללקוחות. בדרך כלל לפני שהמבצע עצמו מתחיל — למלא רק אם זה יום אחר.'
      },
      social: {
        label: 'מתי מתחילים לקדם?',
        hint: 'היום שבו מתחילים לקדם את התוכן. למלא רק אם זה יום אחר מהפרסום עצמו.'
      },
      b2b: {
        label: 'מתי מתחילים לפנות ללקוחות?',
        hint: 'היום שבו יוצאת הפנייה הראשונה ללקוחות. למלא רק אם זה יום אחר מתחילת הפעילות.'
      }
    },
    example: 'למשל: 6.12 — הפרסום מתחיל',
    icon: Rocket,
    text: 'text-ms-kickoff',
    bg: 'bg-ms-kickoff-soft',
    border: 'border-ms-kickoff',
    order: 5,
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
    order: 6,
    required: false,
    allowsMonth: false,
    openFor: CUSTOMER_FACING
  },
  {
    key: 'actual',
    field: 'actualDate',
    label: 'מתי האירוע מתקיים?',
    short: 'תאריך האירוע',
    hint: 'המועד של האירוע עצמו. אם אין יום מדויק, אפשר לבחור חודש שלם.',
    byCategory: {
      campaign: {
        label: 'מתי המבצע מתחיל?',
        short: 'תחילת המבצע',
        hint: 'היום הראשון של המבצע מבחינת הלקוח. אם אין יום מדויק, אפשר לבחור חודש שלם.'
      },
      social: {
        label: 'מתי התוכן מתפרסם?',
        short: 'תאריך הפרסום',
        hint: 'היום שבו התוכן עולה. אם אין יום מדויק, אפשר לבחור חודש שלם.'
      },
      b2b: {
        label: 'מתי הפעילות מתחילה?',
        short: 'תחילת הפעילות',
        hint: 'היום הראשון של הפעילות מול הלקוח. אם אין יום מדויק, אפשר לבחור חודש שלם.'
      },
      holiday: {
        label: 'מתי החג חל?',
        short: 'תאריך החג',
        hint: 'היום שבו החג חל. אם אין יום מדויק, אפשר לבחור חודש שלם.'
      },
      operational: {
        label: 'מתי זה צריך להיות מוכן?',
        short: 'מועד היעד',
        hint: 'היום שבו זה חייב להיות גמור. אם אין יום מדויק, אפשר לבחור חודש שלם.'
      }
    },
    example: 'למשל: 14.12 — נר ראשון של חנוכה',
    icon: CalendarDays,
    text: 'text-ms-actual',
    bg: 'bg-ms-actual-soft',
    border: 'border-ms-actual',
    order: 7,
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
    order: 8,
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
    kickoffMeetingDate: meeting,
    workStartDate: work,
    reviewDate: review,
    freezeDate: freeze,
    kickoffDate: kickoff,
    announceDate: announce,
    actualDate: actual,
    campaignEndDate: end
  } = event;

  const after = (a: string | null, b: string | null) => Boolean(a && b && a > b);

  /*
   * The meeting comes first, or the plan is upside down.
   *
   * Three rows in the real planning file have exactly this shape — a year typed
   * wrong in one field — and every one of them was invisible in a spreadsheet.
   */
  for (const [key, date, what] of [
    ['review', review, 'הבקרה'],
    ['freeze', freeze, 'הקפאת השינויים'],
    ['kickoff', kickoff, 'העלייה לאוויר'],
    ['announce', announce, 'ההודעה לחברה']
  ] as const) {
    if (after(meeting, date)) {
      out.push({ key: 'kickoffMeeting', message: `ישיבת ההתנעה אחרי ${what}. בדוק אם זה נכון.` });
      break;
    }
  }
  if (meeting && meeting > actual) {
    out.push({ key: 'kickoffMeeting', message: 'ישיבת ההתנעה אחרי תאריך האירוע. בדוק אם זה נכון.' });
  }

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
      if (m.key === 'workStart' || m.key === 'kickoffMeeting') continue;
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
  event: Pick<EventItem, 'kickoffMeetingDate' | 'workStartDate' | 'actualDate' | 'prepMonths'>
): { date: string; approximate: boolean } {
  const base = (() => {
    if (event.workStartDate) return { date: event.workStartDate, approximate: false };

    const [y, m] = event.actualDate.slice(0, 7).split('-').map(Number);
    const ordinal = y * 12 + (m - 1) - Math.max(0, event.prepMonths || 0);
    const year = Math.floor(ordinal / 12);
    const month = (ordinal % 12) + 1;
    return { date: `${year}-${String(month).padStart(2, '0')}-01`, approximate: true };
  })();

  /*
   * The meeting that hands the work out is a day work has demonstrably started.
   *
   * In the real planning file it falls two to six months before the event, and
   * often before `actualDate - prepMonths` — so without this the bar began
   * after its own first marker, and the marker was drawn off the left edge of
   * the row. An earlier typed day is a fact; the month arithmetic is a guess,
   * and a fact beats a guess.
   */
  if (event.kickoffMeetingDate && event.kickoffMeetingDate < base.date) {
    return { date: event.kickoffMeetingDate, approximate: false };
  }
  return base;
}
