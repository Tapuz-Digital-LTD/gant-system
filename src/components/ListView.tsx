import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, Plus, Inbox, AlertTriangle, Check } from 'lucide-react';
import { EventItem, TaskItem, FilterState, UserAccess, isFloating } from '../types';
import { filterEvents } from '../utils/filterEvents';
import type { Can } from '../hooks/useCan';
import { formatDate, calculateEventProgress } from '../utils/dateHelpers';
import { CATEGORY_META, PRIORITY_META, isOverdue } from '../utils/eventMeta';
import { Button, Badge, Dot, Tooltip, cn } from './ui';

interface ListViewProps {
  events: EventItem[];
  users: UserAccess[];
  filterState: FilterState;
  onOpenEventDetail: (event: EventItem) => void;
  onToggleTaskStatus: (task: TaskItem) => void;
  onOpenAddEvent: () => void;
  can: Can;
}

export const ListView: React.FC<ListViewProps> = ({
  events,
  users,
  filterState,
  onOpenEventDetail,
  onToggleTaskStatus,
  onOpenAddEvent,
  can
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const canToggle = can('task.edit');
  const canAdd = can('event.create');

  const filteredEvents = useMemo(() => filterEvents(events, filterState), [events, filterState]);
  const userNames = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (filteredEvents.length === 0) {
    return (
      <EmptyState
        hasFilters={Boolean(filterState.search) || filterState.category !== 'all' || filterState.year !== 'all'}
        canEdit={canAdd}
        onAdd={onOpenAddEvent}
      />
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        {/* column header */}
        <div className="grid grid-cols-[2rem_1fr_7rem_7rem_9rem] items-center gap-3 border-b border-line bg-canvas px-4 py-2.5 text-xs font-semibold text-ink-tertiary">
          <span />
          <span>אירוע</span>
          <span>תאריך התנעה</span>
          <span>תאריך אמת</span>
          <span>משימות</span>
        </div>

        <ul className="divide-y divide-line">
          {filteredEvents.map((ev) => {
            const isOpen = expanded.has(ev.id);
            const progress = calculateEventProgress(ev);
            const meta = CATEGORY_META[ev.category];
            const lateCount = (ev.tasks || []).filter((t) => isOverdue(t.dueDate, t.status)).length;

            return (
              <li key={ev.id}>
                <div className="grid grid-cols-[2rem_1fr_7rem_7rem_9rem] items-start gap-3 px-4 py-3 transition-colors hover:bg-subtle">
                  <button
                    onClick={() => toggle(ev.id)}
                    aria-expanded={isOpen}
                    aria-label={isOpen ? 'הסתר משימות' : 'הצג משימות'}
                    className="grid h-5 w-5 place-items-center rounded text-ink-tertiary hover:bg-muted hover:text-ink"
                  >
                    {isOpen ? <ChevronDown className="h-4.5 w-4.5" /> : <ChevronLeft className="h-4.5 w-4.5" />}
                  </button>

                  <button onClick={() => onOpenEventDetail(ev)} className="flex min-w-0 flex-col gap-0.5 text-start">
                    <span className="flex w-full min-w-0 items-center gap-1.5">
                      <Dot className={meta.dot} />
                      <span className="truncate text-md font-semibold text-ink">{ev.title}</span>
                      {lateCount > 0 && (
                        <Tooltip label={`${lateCount} משימות באיחור`}>
                          <span className="flex items-center gap-0.5 text-late">
                            <AlertTriangle className="h-4 w-4" />
                            <span className="text-xs font-semibold tnum">{lateCount}</span>
                          </span>
                        </Tooltip>
                      )}
                    </span>
                    {ev.note && <span className="w-full text-xs leading-snug text-ink-tertiary">{ev.note}</span>}
                  </button>

                  <span className="text-base text-ink-secondary tnum">
                    {ev.kickoffDate ? formatDate(ev.kickoffDate) : '—'}
                  </span>
                  <span className="text-base text-ink-secondary tnum">
                    {isFloating(ev) ? 'החודש' : formatDate(ev.actualDate)}
                  </span>

                  <div className="flex items-center gap-2">
                    {progress.totalTasks === 0 ? (
                      <span className="text-xs text-ink-tertiary">אין משימות</span>
                    ) : (
                      <>
                        <div className="h-1 w-12 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn('h-full rounded-full', progress.percentage === 100 ? 'bg-done' : 'bg-ink-secondary')}
                            style={{ width: `${progress.percentage}%` }}
                          />
                        </div>
                        <span className="text-xs text-ink-tertiary tnum">
                          {progress.completedTasks}/{progress.totalTasks}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-line bg-canvas px-4 py-3 ps-14">
                    {!ev.tasks || ev.tasks.length === 0 ? (
                      <div className="flex items-center gap-2 py-1">
                        <span className="text-xs text-ink-tertiary">עוד אין משימות באירוע הזה</span>
                        <button
                          onClick={() => onOpenEventDetail(ev)}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          הוספת משימה
                        </button>
                      </div>
                    ) : (
                      <ul className="flex flex-col gap-0.5">
                        {ev.tasks.map((task) => {
                          const late = isOverdue(task.dueDate, task.status);
                          const done = task.status === 'done';
                          const prio = PRIORITY_META[task.priority];

                          return (
                            <li key={task.id} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-subtle">
                              <button
                                onClick={() => canToggle && onToggleTaskStatus(task)}
                                disabled={!canToggle}
                                aria-label={done ? 'סמן את המשימה כלא הושלמה' : 'סמן את המשימה כהושלמה'}
                                className={cn(
                                  'grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors',
                                  done ? 'border-done bg-done text-white' : 'border-line-strong bg-surface hover:border-ink-secondary',
                                  !canToggle && 'cursor-not-allowed opacity-60'
                                )}
                              >
                                {done && <Check className="h-4 w-4" strokeWidth={3} />}
                              </button>

                              <span className={cn('min-w-0 flex-1 truncate text-base', done ? 'text-ink-tertiary line-through' : 'text-ink')}>
                                {task.title}
                              </span>

                              {(task.priority === 'urgent' || task.priority === 'high') && !done && (
                                <Badge tone={prio.tone}>{prio.label}</Badge>
                              )}
                              <span className="w-20 shrink-0 truncate text-xs text-ink-tertiary">{task.assigneeId ? (userNames.get(task.assigneeId) ?? '—') : '—'}</span>
                              {task.dueDate && (
                                <span className={cn('w-14 shrink-0 text-xs tnum', late ? 'font-semibold text-late' : 'text-ink-tertiary')}>
                                  {formatDate(task.dueDate)}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

export function EmptyState({
  hasFilters,
  canEdit,
  onAdd
}: {
  hasFilters: boolean;
  canEdit: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-20 text-center">
      <Inbox className="h-6 w-6 text-ink-disabled" aria-hidden="true" />
      <p className="text-base font-semibold text-ink">
        {hasFilters ? 'אין כאן אירועים שמתאימים למה שבחרת' : 'עוד אין אירועים בלוח'}
      </p>
      <p className="max-w-xs text-sm text-ink-tertiary">
        {hasFilters ? 'נסה לשנות את הסינון או לנקות את החפש אירוע או משימה' : 'הוסף אירוע ראשון כדי להתחיל'}
      </p>
      {!hasFilters && canEdit && (
        <Button variant="primary" size="sm" onClick={onAdd} className="mt-2">
          <Plus className="h-4.5 w-4.5" />
          אירוע חדש
        </Button>
      )}
    </div>
  );
}
