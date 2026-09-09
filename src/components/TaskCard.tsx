import React from 'react';
import { AlertTriangle, CalendarClock, GripVertical, User } from 'lucide-react';
import { MyTask, TaskItem, TaskStatus, UserAccess } from '../types';
import { PRIORITY_META, avatarColor, isOverdue, todayISO } from '../utils/eventMeta';
import { formatDate } from '../utils/dateHelpers';
import { addDays } from '../utils/period';
import { Badge, Tooltip, cn } from './ui';

/**
 * One task, readable at a glance.
 *
 * The card carries only what decides whether to pick this one up now: what it
 * is, what it belongs to, when it is due, who owns it. Everything else lives
 * behind opening it — the same bargain Trello makes.
 *
 * The due date is a word before it is a date. "באיחור" and "מחר" are what
 * someone acts on; "14.12.2026" is what they check afterwards.
 */

export interface TaskCardProps {
  task: TaskItem | MyTask;
  /** Shown when the card is away from its event — on "my tasks", say. */
  context?: { eventTitle: string; boardName: string } | null;
  /** Omitted where every card belongs to the same person. */
  assignee?: UserAccess | null;
  onOpen: () => void;
  /** Drag is an extra, never the only way. Buttons do the same job. */
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  dragging?: boolean;
  /** Rendered under the card: the move buttons, a menu, whatever the screen needs. */
  actions?: React.ReactNode;
}

/** When a date stops being a date and becomes a warning. */
export function dueLabel(dueDate: string | null, status: TaskStatus): {
  text: string;
  tone: 'late' | 'soon' | 'calm' | 'done';
} | null {
  if (!dueDate) return null;
  if (status === 'done') return { text: formatDate(dueDate), tone: 'done' };

  const today = todayISO();
  if (dueDate < today) return { text: 'באיחור', tone: 'late' };
  if (dueDate === today) return { text: 'להיום', tone: 'late' };
  if (dueDate === addDays(today, 1)) return { text: 'מחר', tone: 'soon' };
  if (dueDate <= addDays(today, 7)) return { text: `עד ${formatDate(dueDate)}`, tone: 'soon' };
  return { text: formatDate(dueDate), tone: 'calm' };
}

const DUE_STYLE: Record<'late' | 'soon' | 'calm' | 'done', string> = {
  late: 'bg-late-soft text-late',
  soon: 'bg-progress-soft text-progress',
  calm: 'bg-subtle text-ink-secondary',
  done: 'bg-subtle text-ink-tertiary'
};

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  context,
  assignee,
  onOpen,
  draggable,
  onDragStart,
  onDragEnd,
  dragging,
  actions
}) => {
  const due = dueLabel(task.dueDate, task.status);
  const late = isOverdue(task.dueDate ?? undefined, task.status);
  const prio = PRIORITY_META[task.priority];
  const done = task.status === 'done';

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'flex flex-col gap-2 rounded-lg border bg-surface p-3 shadow-card transition-all',
        late ? 'border-late/40' : 'border-line',
        dragging ? 'opacity-40' : 'hover:shadow-raised',
        draggable && 'cursor-grab active:cursor-grabbing'
      )}
    >
      <button onClick={onOpen} className="flex items-start gap-2 text-start">
        {draggable && (
          <GripVertical className="mt-0.5 h-4.5 w-4.5 shrink-0 text-ink-disabled" aria-hidden="true" />
        )}
        <span
          className={cn(
            'min-w-0 flex-1 text-base font-semibold',
            done ? 'text-ink-tertiary line-through' : 'text-ink'
          )}
        >
          {task.title}
        </span>
        {late && (
          <Tooltip label="עבר תאריך היעד">
            <AlertTriangle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-late" aria-hidden="true" />
          </Tooltip>
        )}
      </button>

      {context && (
        <button onClick={onOpen} className="text-start text-sm text-ink-tertiary">
          <span className="truncate">{context.eventTitle}</span>
          <span className="mx-1.5 text-ink-disabled">·</span>
          <span className="truncate">{context.boardName}</span>
        </button>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {due && (
          <span
            className={cn(
              'flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold',
              DUE_STYLE[due.tone]
            )}
          >
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            {due.text}
          </span>
        )}

        {!done && (task.priority === 'urgent' || task.priority === 'high') && (
          <Badge tone={prio.tone}>{prio.label}</Badge>
        )}

        <span className="flex-1" />

        {assignee !== undefined && (
          <Tooltip label={assignee ? assignee.name : 'אין אחראי'}>
            <span
              className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold',
                assignee ? cn(avatarColor(assignee.email), 'text-white') : 'bg-subtle text-ink-tertiary'
              )}
            >
              {assignee ? assignee.name.charAt(0) : <User className="h-4 w-4" aria-hidden="true" />}
            </span>
          </Tooltip>
        )}
      </div>

      {actions}
    </div>
  );
};
