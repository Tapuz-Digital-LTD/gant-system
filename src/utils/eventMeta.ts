import { BadgePercent, Building2, MessageCircle, PartyPopper, Shapes, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EventCategory, TaskStatus, TaskPriority } from '../types';
import type { StatusFill } from '../components/ui';

/** Category presentation, shared by every view so a colour always means one thing. */
export const CATEGORY_META: Record<
  EventCategory,
  { label: string; hint: string; dot: string; text: string; soft: string; icon: LucideIcon }
> = {
  holiday: {
    label: 'חג ומועד',
    hint: 'ראש השנה, פסח, יום העצמאות',
    dot: 'bg-cat-holiday',
    text: 'text-cat-holiday',
    soft: 'bg-cat-holiday/10',
    icon: PartyPopper
  },
  campaign: {
    label: 'קמפיין',
    hint: 'מבצע או פעילות שיווקית מול לקוחות',
    dot: 'bg-cat-campaign',
    text: 'text-cat-campaign',
    soft: 'bg-cat-campaign/10',
    icon: BadgePercent
  },
  b2b: {
    label: 'ועדים וארגונים',
    hint: 'פעילות מול ועדי עובדים וחברות',
    dot: 'bg-cat-b2b',
    text: 'text-cat-b2b',
    soft: 'bg-cat-b2b/10',
    icon: Building2
  },
  social: {
    label: 'סושיאל',
    hint: 'תוכן ברשתות החברתיות',
    dot: 'bg-cat-social',
    text: 'text-cat-social',
    soft: 'bg-cat-social/10',
    icon: MessageCircle
  },
  operational: {
    label: 'תפעול',
    hint: 'עבודה פנימית, מערכות ותהליכים',
    dot: 'bg-cat-operational',
    text: 'text-cat-operational',
    soft: 'bg-cat-operational/10',
    icon: Wrench
  },
  other: {
    label: 'אחר',
    hint: 'כל דבר שלא מתאים לשאר',
    dot: 'bg-cat-other',
    text: 'text-cat-other',
    soft: 'bg-cat-other/10',
    icon: Shapes
  }
};

export const STATUS_META: Record<TaskStatus, { label: string; fill: StatusFill }> = {
  todo: { label: 'עוד לא התחיל', fill: 'todo' },
  in_progress: { label: 'בתהליך', fill: 'progress' },
  ready_kickoff: { label: 'מוכן לעלייה לאוויר', fill: 'ready' },
  done: { label: 'הושלם', fill: 'done' }
};

export const PRIORITY_META: Record<TaskPriority, { label: string; tone: 'neutral' | 'progress' | 'late' }> = {
  low: { label: 'נמוכה', tone: 'neutral' },
  medium: { label: 'בינונית', tone: 'neutral' },
  high: { label: 'גבוהה', tone: 'progress' },
  urgent: { label: 'דחופה', tone: 'late' }
};

/** Today as YYYY-MM-DD in the viewer's own calendar — never a UTC instant. */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function currentMonthKey(): string {
  return todayISO().slice(0, 7);
}

/** A task is late when its due date has passed and it is not done. */
export function isOverdue(dueDate: string | undefined, status: TaskStatus): boolean {
  if (!dueDate || status === 'done') return false;
  return dueDate < todayISO();
}

/**
 * Avatar colour derived from the person, not stored on them — so it always
 * belongs to the current palette instead of whatever hex the record was seeded with.
 */
const AVATAR_COLORS = [
  'bg-cat-b2b',
  'bg-cat-social',
  'bg-cat-operational',
  'bg-cat-holiday',
  'bg-cat-campaign',
  'bg-ready'
];

export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
