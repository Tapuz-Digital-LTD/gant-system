import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, GripVertical } from 'lucide-react';
import { EventItem, FilterState, UserAccess, TaskStatus, isFloating } from '../types';
import { filterEvents } from '../utils/filterEvents';
import type { Can } from '../hooks/useCan';
import { formatDate, calculateEventProgress } from '../utils/dateHelpers';
import { monthName } from '../utils/period';
import { CATEGORY_META, STATUS_META, isOverdue } from '../utils/eventMeta';
import { Button, Dot, StatusPill, Tooltip, cn } from './ui';
import { EmptyState } from './ListView';

interface KanbanBoardViewProps {
  events: EventItem[];
  filterState: FilterState;
  /** Whether anything is filtered, so the empty state can say why. */
  hasFilters: boolean;
  onOpenEventDetail: (event: EventItem) => void;
  onOpenAddEvent: () => void;
  onMoveEvent: (event: EventItem, status: TaskStatus) => void;
  can: Can;
}

const COLUMNS: TaskStatus[] = ['todo', 'in_progress', 'ready_kickoff', 'done'];

/** Hebrew counts one, two and many differently — and a screen reader reads it aloud. */
const countLabel = (n: number): string =>
  n === 0 ? 'אין אירועים' : n === 1 ? 'אירוע אחד' : n === 2 ? 'שני אירועים' : `${n} אירועים`;

export const KanbanBoardView: React.FC<KanbanBoardViewProps> = ({
  events,
  filterState,
  hasFilters,
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
  const banner = useRef<HTMLDivElement>(null);
  /** The card to stand on again — and the column it has to have reached first. */
  const [refocus, setRefocus] = useState<{ id: string; status: TaskStatus } | null>(null);

  /*
   * Focus has to follow the card.
   *
   * The banner is above the columns, so Tab from a held card walks forward
   * through the rest of the pile and never reaches it. Picking a card up moves
   * focus to the first destination; completing the move puts it back on the
   * card, now in its new column, so the person is still standing where they
   * were. Without both halves the keyboard route exists on paper only.
   */
  useEffect(() => {
    if (held) banner.current?.querySelector('button')?.focus();
  }, [held?.id]);

  /*
   * Wait for the move to have actually happened before standing on the card.
   *
   * The card still exists in its old column for a beat — the write is a round
   * trip. Focusing it there looks like it worked, and then React unmounts that
   * node to build it in the new column and focus falls back to the body. So the
   * condition is the data, not the element: focus only once the event's status
   * is the one we asked for.
   */
  useEffect(() => {
    if (!refocus) return;
    const arrived = filteredEvents.find((e) => e.id === refocus.id)?.status === refocus.status;
    if (!arrived) return;
    document.querySelector<HTMLElement>(`[data-event-card="${refocus.id}"]`)?.focus();
    setRefocus(null);
  }, [refocus, filteredEvents]);

  const move = (ev: EventItem, status: TaskStatus) => {
    if (ev.status !== status) onMoveEvent(ev, status);
  };

  const moveByKeyboard = (ev: EventItem, status: TaskStatus) => {
    move(ev, status);
    setHeld(null);
    setRefocus({ id: ev.id, status });
  };

  if (filteredEvents.length === 0) {
    return (
      <EmptyState
        hasFilters={hasFilters}
        canEdit={canAdd}
        onAdd={onOpenAddEvent}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2 p-4 sm:p-6">
      {/*
        A card that has been picked up needs somewhere to go that a keyboard can
        actually reach. The columns cannot be it: they sit after the cards in
        tab order, so Tab from a held card walks the rest of the pile and never
        arrives. The destinations come to the card instead — named buttons, one
        per column, right where the announcement is.
      */}
      {held && (
        <div
          ref={banner}
          className="flex flex-wrap items-center gap-2 rounded-lg bg-primary-soft px-3 py-2"
          role="status"
          aria-live="polite"
        >
          <span className="text-base text-ink">
            נבחר: <b>{held.title}</b> — לאן להעביר?
          </span>
          {COLUMNS.filter((status) => status !== held.status).map((status) => (
            <Button key={status} size="sm" variant="secondary" onClick={() => moveByKeyboard(held, status)}>
              {STATUS_META[status].label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setHeld(null)}>
            ביטול
          </Button>
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

              {/*
                A plain container, not a button.
                
                It used to be a <button> with every card nested inside it, which
                is invalid, and which made each card's own click a fight with
                its parent's. Dropping is a mouse gesture; the keyboard route is
                the destination buttons above.
              */}
              <ul
                aria-label={`${meta.label} — ${countLabel(columnEvents.length)}`}
                className={cn(
                  'flex min-h-32 list-none flex-col gap-2 rounded-xl p-2 text-start transition-colors',
                  isTarget ? 'bg-primary-soft ring-2 ring-primary' : 'bg-subtle/70',
                  held && 'ring-2 ring-dashed ring-primary-line'
                )}
              >
                {columnEvents.length === 0 ? (
                  <li className="px-1.5 py-3 text-center text-xs text-ink-tertiary">
                    {isTarget ? 'שחרר כאן' : 'אין כאן אירועים'}
                  </li>
                ) : (
                  columnEvents.map((ev) => {
                    const progress = calculateEventProgress(ev);
                    const cat = CATEGORY_META[ev.category];
                    const lateCount = (ev.tasks || []).filter((t) => isOverdue(t.dueDate, t.status)).length;
                    const isHeld = held?.id === ev.id;

                    return (
                      <li
                        key={ev.id}
                        data-event-card={ev.id}
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
                          {ev.kickoffDate && <span>עלייה לאוויר {formatDate(ev.kickoffDate)}</span>}
                          <span>
                            {isFloating(ev)
                              ? `במהלך ${monthName(ev.actualDate)}`
                              : `האירוע ${formatDate(ev.actualDate)}`}
                          </span>
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
                      </li>
                    );
                  })
                )}
              </ul>
            </section>
          );
        })}
      </div>

      {canMove && (
        <p className="px-1 text-xs text-ink-tertiary">
          אפשר לגרור כרטיס בין העמודות — או, בלי עכבר: Tab לכרטיס, רווח כדי לבחור
          אותו, ואז כפתור העמודה שתופיע למעלה.
        </p>
      )}
    </div>
  );
};
