import React, { useMemo, useState } from 'react';
import { AlertTriangle, GripVertical } from 'lucide-react';
import { EventItem, FilterState, UserAccess, TaskStatus, isFloating } from '../types';
import { filterEvents } from '../utils/filterEvents';
import type { Can } from '../hooks/useCan';
import { formatDate, calculateEventProgress } from '../utils/dateHelpers';
import { CATEGORY_META, STATUS_META, isOverdue } from '../utils/eventMeta';
import { Dot, StatusPill, Tooltip, cn } from './ui';
import { EmptyState } from './ListView';

interface KanbanBoardViewProps {
  events: EventItem[];
  filterState: FilterState;
  onOpenEventDetail: (event: EventItem) => void;
  onOpenAddEvent: () => void;
  onMoveEvent: (event: EventItem, status: TaskStatus) => void;
  can: Can;
}

const COLUMNS: TaskStatus[] = ['todo', 'in_progress', 'ready_kickoff', 'done'];

export const KanbanBoardView: React.FC<KanbanBoardViewProps> = ({
  events,
  filterState,
  onOpenEventDetail,
  onOpenAddEvent,
  onMoveEvent,
  can
}) => {
  // Dragging writes a status, so it needs the edit capability — not a role.
  const canMove = can('event.edit');
  const canAdd = can('event.create');
  const filteredEvents = useMemo(() => filterEvents(events, filterState), [events, filterState]);

  const [dragging, setDragging] = useState<EventItem | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  /** Keyboard equivalent of a drag: pick a card up, then choose a column. */
  const [held, setHeld] = useState<EventItem | null>(null);

  const move = (ev: EventItem, status: TaskStatus) => {
    if (ev.status !== status) onMoveEvent(ev, status);
  };

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
    <div className="flex flex-col gap-2 p-4 sm:p-6">
      {held && (
        <div className="flex items-center gap-2 rounded-lg bg-primary-soft px-3 py-2" role="status">
          <span className="text-base text-ink">
            נבחר: <b>{held.title}</b> — בחר עמודה עם Enter, או Escape לבטל שינוי בשם הלוח
          </span>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((status) => {
          const meta = STATUS_META[status];
          const columnEvents = filteredEvents.filter((ev) => ev.status === status);
          const isTarget = over === status;

          return (
            <section
              key={status}
              className="flex flex-col gap-2"
              onDragOver={(e) => {
                if (!canMove || !dragging) return;
                e.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver((s) => (s === status ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging) move(dragging, status);
                setDragging(null);
                setOver(null);
              }}
            >
              <header className="flex items-center gap-2 px-0.5">
                <StatusPill fill={meta.fill}>{meta.label}</StatusPill>
                <span className="text-sm text-ink-tertiary tnum">{columnEvents.length}</span>
              </header>

              <button
                type="button"
                disabled={!held}
                onClick={() => {
                  if (held) {
                    move(held, status);
                    setHeld(null);
                  }
                }}
                aria-label={`העבר את האירוע ל${meta.label}`}
                className={cn(
                  'flex min-h-32 flex-col gap-2 rounded-xl p-2 text-start transition-colors',
                  isTarget ? 'bg-primary-soft ring-2 ring-primary' : 'bg-subtle/70',
                  held && 'cursor-copy ring-2 ring-dashed ring-primary-line',
                  !held && 'cursor-default'
                )}
              >
                {columnEvents.length === 0 ? (
                  <p className="px-1.5 py-3 text-center text-xs text-ink-tertiary">
                    {isTarget ? 'שחרר כאן' : 'אין כאן אירועים'}
                  </p>
                ) : (
                  columnEvents.map((ev) => {
                    const progress = calculateEventProgress(ev);
                    const cat = CATEGORY_META[ev.category];
                    const lateCount = (ev.tasks || []).filter((t) => isOverdue(t.dueDate, t.status)).length;
                    const isHeld = held?.id === ev.id;

                    return (
                      <div
                        key={ev.id}
                        draggable={canMove}
                        onDragStart={() => setDragging(ev)}
                        onDragEnd={() => {
                          setDragging(null);
                          setOver(null);
                        }}
                        role="button"
                        tabIndex={0}
                        onClick={() => onOpenEventDetail(ev)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !held) {
                            e.preventDefault();
                            onOpenEventDetail(ev);
                          } else if (e.key === ' ' && canMove) {
                            e.preventDefault();
                            setHeld((h) => (h?.id === ev.id ? null : ev));
                          } else if (e.key === 'Escape') {
                            setHeld(null);
                          }
                        }}
                        className={cn(
                          'flex flex-col gap-2 rounded-lg border bg-surface p-3 text-start shadow-card transition-all',
                          canMove && 'cursor-grab active:cursor-grabbing',
                          dragging?.id === ev.id ? 'opacity-40' : 'hover:shadow-raised',
                          isHeld ? 'border-primary ring-2 ring-primary' : 'border-line'
                        )}
                      >
                        <div className="flex items-start gap-1.5">
                          {canMove && (
                            <GripVertical className="mt-0.5 h-5 w-5 shrink-0 text-ink-disabled" aria-hidden="true" />
                          )}
                          <Dot className={cn('mt-1.5', cat.dot)} />
                          <span className="min-w-0 flex-1 text-md font-semibold text-ink">{ev.title}</span>
                          {lateCount > 0 && (
                            <Tooltip label={`${lateCount} משימות באיחור`}>
                              <span className="mt-0.5 text-late">
                                <AlertTriangle className="h-5 w-5" />
                              </span>
                            </Tooltip>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-xs text-ink-tertiary tnum">
                          {ev.kickoffDate && <span>תאריך התנעה {formatDate(ev.kickoffDate)}</span>}
                          <span>אמת {isFloating(ev) ? 'החודש' : formatDate(ev.actualDate)}</span>
                        </div>

                        {progress.totalTasks > 0 && (
                          <div className="flex items-center gap-1.5">
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn('h-full rounded-full', progress.percentage === 100 ? 'bg-done' : 'bg-ink-secondary')}
                                style={{ width: `${progress.percentage}%` }}
                              />
                            </div>
                            <span className="text-xs text-ink-tertiary tnum">
                              {progress.completedTasks}/{progress.totalTasks}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </button>
            </section>
          );
        })}
      </div>

      {canMove && (
        <p className="px-1 text-xs text-ink-tertiary">
          גרור כרטיס בין עמודות, או בחר כרטיס עם Tab ולחץ רווח כדי להעביר אותו במקלדת.
        </p>
      )}
    </div>
  );
};
