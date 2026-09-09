import type { AppNotification, NotificationKind } from '../types';

/**
 * Turning an inbox into something a person can read in one glance.
 *
 * Fourteen separate rows saying "משימה באיחור" is not fourteen pieces of news,
 * it is one piece of news fourteen times — and a bell that looks like that is a
 * bell people stop opening. So: sorted by what it asks of the reader, and
 * anything that repeats folded into a single line they can open if they want
 * the detail.
 *
 * The headings are deliberately the same words the daily email uses. Somebody
 * who reads "דורש טיפול" in their inbox at eight should meet the same phrase in
 * the bell at eleven, not a synonym for it.
 *
 * Pure: notifications in, sections out. No fetching, no clock beyond `now`.
 */

/** Below this, a group is just its rows — folding two lines saves nobody anything. */
const FOLD_AT = 3;

const SEVERITY: Record<NotificationKind, 1 | 2 | 3> = {
  // Somebody handed you work, or work of yours is late. Both need you today.
  task_assigned: 1,
  task_overdue: 1,
  task_due_soon: 2,
  task_stalled: 2,
  milestone_soon: 2
};

const HEADINGS: Record<1 | 2 | 3, string> = {
  1: 'דורש טיפול',
  2: 'בימים הקרובים',
  3: 'כדאי לדעת'
};

/** Hebrew names one and two rather than counting them. */
function counted(n: number, one: string, few: string): string {
  if (n === 1) return one;
  if (n === 2) return `שתי ${few}`;
  return `${n} ${few}`;
}

/** What a folded group of this kind is called. */
function foldedTitle(kind: NotificationKind, n: number): string {
  switch (kind) {
    case 'task_overdue':
      return `${counted(n, 'משימה אחת', 'משימות')} באיחור`;
    case 'task_assigned':
      return `${counted(n, 'משימה אחת חדשה', 'משימות חדשות')} אצלך`;
    case 'task_due_soon':
      return `${counted(n, 'משימה אחת', 'משימות')} לקראת תאריך היעד`;
    case 'task_stalled':
      return `${counted(n, 'משימה אחת', 'משימות')} שעוד לא יצאו לדרך`;
    case 'milestone_soon':
      return `${counted(n, 'תאריך אחד', 'תאריכים')} בקמפיינים`;
  }
}

export interface NotificationGroup {
  kind: NotificationKind;
  /** The one-line title, used when the group is folded. */
  title: string;
  items: AppNotification[];
  unread: number;
  /** Whether this is worth showing as one line rather than several. */
  folded: boolean;
}

export interface NotificationSection {
  severity: 1 | 2 | 3;
  heading: string;
  groups: NotificationGroup[];
  unread: number;
}

export function groupNotifications(items: AppNotification[]): NotificationSection[] {
  const sections: NotificationSection[] = [];

  for (const severity of [1, 2, 3] as const) {
    const mine = items.filter((i) => (SEVERITY[i.kind] ?? 2) === severity);
    if (mine.length === 0) continue;

    const byKind = new Map<NotificationKind, AppNotification[]>();
    for (const item of mine) {
      const list = byKind.get(item.kind);
      if (list) list.push(item);
      else byKind.set(item.kind, [item]);
    }

    const groups: NotificationGroup[] = [...byKind.entries()].map(([kind, list]) => {
      // Newest first inside a group: the reason somebody opened the bell is
      // usually the thing that just happened.
      const sorted = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return {
        kind,
        title: foldedTitle(kind, sorted.length),
        items: sorted,
        unread: sorted.filter((i) => !i.readAt).length,
        folded: sorted.length >= FOLD_AT
      };
    });

    // A group with unread news outranks one already read; then the bigger pile.
    groups.sort((a, b) => b.unread - a.unread || b.items.length - a.items.length);

    sections.push({
      severity,
      heading: HEADINGS[severity],
      groups,
      unread: groups.reduce((n, g) => n + g.unread, 0)
    });
  }

  return sections;
}

/** Every notification in a section list, back in reading order. */
export function flatten(sections: NotificationSection[]): AppNotification[] {
  return sections.flatMap((s) => s.groups.flatMap((g) => g.items));
}
