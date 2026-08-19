import { EventCategory, TaskStatus, TaskPriority } from '../types';
import type { StatusFill } from '../components/ui';

/** Category presentation, shared by every view so a colour always means one thing. */
export const CATEGORY_META: Record<EventCategory, { label: string; dot: string; text: string }> = {
  holiday: { label: 'חג ומועד', dot: 'bg-cat-holiday', text: 'text-cat-holiday' },
  campaign: { label: 'קמפיין', dot: 'bg-cat-campaign', text: 'text-cat-campaign' },
  b2b: { label: 'ועדים וארגונים', dot: 'bg-cat-b2b', text: 'text-cat-b2b' },
  social: { label: 'סושיאל', dot: 'bg-cat-social', text: 'text-cat-social' },
  operational: { label: 'תפעול', dot: 'bg-cat-operational', text: 'text-cat-operational' },
  other: { label: 'אחר', dot: 'bg-cat-other', text: 'text-cat-other' }
};

export const STATUS_META: Record<TaskStatus, { label: string; fill: StatusFill }> = {
  todo: { label: 'עוד לא התחיל', fill: 'todo' },
  in_progress: { label: 'בתהליך', fill: 'progress' },
  ready_kickoff: { label: 'מוכן לתאריך התנעה', fill: 'ready' },
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
