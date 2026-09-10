/**
 * The words for the values, once.
 *
 * `holiday` is a database enum; "חג ומועד" is what a person reads. That pairing
 * was written down three times — in the exporter, in the report model, and
 * implicitly in the importer, which recognised the column and then ignored what
 * was in it. The result was a real hole: a board exported to Excel and imported
 * straight back came in with every one of its eighteen holidays reclassified as
 * a campaign, because nothing on the way in knew that "חג ומועד" meant anything.
 *
 * So the pairing lives here, and the reverse lookup lives here with it. A file
 * this system wrote must import back saying exactly what it said going out.
 */

export const CATEGORY_VALUES = ['holiday', 'campaign', 'b2b', 'social', 'operational', 'other'] as const;
export const STATUS_VALUES = ['todo', 'in_progress', 'ready_kickoff', 'done'] as const;
export const PRIORITY_VALUES = ['low', 'medium', 'high', 'urgent'] as const;

export type CategoryValue = (typeof CATEGORY_VALUES)[number];
export type StatusValue = (typeof STATUS_VALUES)[number];
export type PriorityValue = (typeof PRIORITY_VALUES)[number];

export const CATEGORY_LABELS: Record<CategoryValue, string> = {
  holiday: 'חג ומועד',
  campaign: 'קמפיין',
  b2b: 'ועדים וארגונים',
  social: 'סושיאל',
  operational: 'תפעול',
  other: 'אחר'
};

export const STATUS_LABELS: Record<StatusValue, string> = {
  todo: 'עוד לא התחיל',
  in_progress: 'בתהליך',
  ready_kickoff: 'מוכן לעלייה לאוויר',
  done: 'הושלם'
};

export const PRIORITY_LABELS: Record<PriorityValue, string> = {
  low: 'נמוכה',
  medium: 'בינונית',
  high: 'גבוהה',
  urgent: 'דחופה'
};

const normalise = (text: string) => text.trim().replace(/\s+/g, ' ');

/**
 * A written word back to the value it names.
 *
 * Accepts the label a person reads and the value the database stores, because a
 * spreadsheet that has been through somebody's hands contains both. Anything
 * else returns null — an unrecognised word is left to the caller to report, not
 * quietly turned into a default.
 */
function reverse<T extends string>(values: readonly T[], labels: Record<T, string>) {
  const map = new Map<string, T>();
  for (const value of values) {
    map.set(normalise(labels[value]), value);
    map.set(value, value);
  }
  return (text: string | undefined): T | null => (text ? map.get(normalise(text)) ?? null : null);
}

export const categoryFromText = reverse(CATEGORY_VALUES, CATEGORY_LABELS);
export const statusFromText = reverse(STATUS_VALUES, STATUS_LABELS);
export const priorityFromText = reverse(PRIORITY_VALUES, PRIORITY_LABELS);
