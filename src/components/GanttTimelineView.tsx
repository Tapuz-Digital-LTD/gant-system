import React, { useMemo } from 'react';
import { MonthMeta, EventItem, FilterState, UserAccess , monthKeyOf, isFloating } from '../types';
import { filterEvents } from '../utils/filterEvents';
import type { Can } from '../hooks/useCan';
import { formatDate, calculateEventProgress } from '../utils/dateHelpers';
import { CATEGORY_META, currentMonthKey } from '../utils/eventMeta';
import { Dot, Tooltip, cn } from './ui';
import { EmptyState } from './ListView';

interface GanttTimelineViewProps {
  months: MonthMeta[];
  events: EventItem[];
  filterState: FilterState;
  onOpenEventDetail: (event: EventItem) => void;
  can: Can;
}

/** Absolute month index so arithmetic works across year boundaries. */
function monthOrdinal(isoOrMonthKey: string): number {
  const [y, m] = isoOrMonthKey.slice(0, 7).split('-').map(Number);
  return y * 12 + (m - 1);
}

interface Span {
  startCol: number;
  endCol: number;
  kickoffCol: number | null;
  actualCol: number;
}

/**
 * The bar is the work window: actual − prepMonths → actual.
 * Kickoff is a milestone inside that window, not its start.
 */
function computeSpan(ev: EventItem, months: MonthMeta[]): Span | null {
  if (months.length === 0) return null;
  const first = monthOrdinal(months[0].key);
  const last = monthOrdinal(months[months.length - 1].key);

  const actualOrd = monthOrdinal(ev.actualDate);
  const startOrd = actualOrd - Math.max(0, ev.prepMonths || 0);
  if (actualOrd < first || startOrd > last) return null;

  const clamp = (o: number) => Math.min(Math.max(o, first), last) - first;
  const kickoffOrd = ev.kickoffDate ? monthOrdinal(ev.kickoffDate) : null;

  return {
    startCol: clamp(startOrd),
    endCol: clamp(actualOrd),
    actualCol: clamp(actualOrd),
    kickoffCol:
      kickoffOrd !== null && kickoffOrd >= first && kickoffOrd <= last ? clamp(kickoffOrd) : null
  };
}

export const GanttTimelineView: React.FC<GanttTimelineViewProps> = ({
  months,
  events,
  filterState,
  onOpenEventDetail,
  can
}) => {
  const canAdd = can('event.create');
  const todayKey = currentMonthKey();
  const todayCol = months.findIndex((m) => m.key === todayKey);

  const rows = useMemo(() => {
    return filterEvents(events, filterState)
      .map((ev) => ({ ev, span: computeSpan(ev, months) }))
      .filter((r): r is { ev: EventItem; span: Span } => r.span !== null)
      .sort((a, b) => a.span.startCol - b.span.startCol);
  }, [events, filterState, months]);

  if (rows.length === 0) {
    return (
      <EmptyState
        hasFilters={Boolean(filterState.search) || filterState.category !== 'all' || filterState.year !== 'all'}
        canEdit={canAdd}
        onAdd={() => undefined}
      />
    );
  }

  const n = months.length;
  const trackWidth = `${n * 5.5}rem`;
  // Percent + logical properties: the browser mirrors the axis, so RTL needs no sign flips.
  const pct = (col: number) => (col / n) * 100;

  return (
    <div className="p-4 sm:p-6">
      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
        <div className="min-w-max">
          {/* month header */}
          <div className="flex border-b border-line bg-canvas">
            <div className="sticky inset-s-0 z-20 w-64 shrink-0 border-e border-line bg-canvas px-3 py-2 text-xs font-semibold text-ink-tertiary">
              אירוע
            </div>
            <div
              className="grid shrink-0"
              style={{ width: trackWidth, gridTemplateColumns: `repeat(${n}, 1fr)` }}
            >
              {months.map((m, i) => (
                <div
                  key={m.key}
                  className={cn(
                    'border-e border-line px-1 py-2 text-center text-xs',
                    i === todayCol ? 'font-bold text-progress' : 'text-ink-tertiary'
                  )}
                >
                  {m.title.replace(/\s+\d{4}$/, '')}
                  <span className="block text-ink-disabled tnum">{String(m.year).slice(2)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* rows */}
          <div className="divide-y divide-line">
            {rows.map(({ ev, span }) => {
              const progress = calculateEventProgress(ev);
              const cat = CATEGORY_META[ev.category];
              const isPast = todayCol >= 0 && span.actualCol < todayCol;
              const width = span.endCol - span.startCol + 1;

              return (
                <div key={ev.id} className="group flex transition-colors hover:bg-subtle">
                  <button
                    onClick={() => onOpenEventDetail(ev)}
                    className="sticky inset-s-0 z-20 flex w-64 shrink-0 flex-col gap-0.5 border-e border-line bg-surface px-3 py-2 text-start group-hover:bg-subtle"
                  >
                    <span className="flex items-center gap-1.5">
                      <Dot className={cat.dot} />
                      <span className="truncate text-base font-semibold text-ink">{ev.title}</span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-ink-tertiary">
                      <span>הכנה {ev.prepMonths} ח׳</span>
                      {progress.totalTasks > 0 && <span className="tnum">{progress.percentage}%</span>}
                    </span>
                  </button>

                  <div className="relative h-14 shrink-0" style={{ width: trackWidth }}>
                    <div
                      className="absolute inset-0 grid"
                      style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}
                      aria-hidden="true"
                    >
                      {months.map((m, i) => (
                        <div
                          key={m.key}
                          className={cn('border-e border-line/60', i === todayCol && 'bg-progress-soft')}
                        />
                      ))}
                    </div>

                    <Tooltip
                      label={`${ev.title} · הכנה ${ev.prepMonths} חודשים${
                        ev.kickoffDate ? ` · תאריך תאריך התנעה ${formatDate(ev.kickoffDate)}` : ''
                      }`}
                    >
                      <button
                        onClick={() => onOpenEventDetail(ev)}
                        style={{ insetInlineStart: `${pct(span.startCol)}%`, inlineSize: `${pct(width)}%` }}
                        className={cn(
                          'absolute inset-y-3.5 flex items-center rounded-lg border px-2.5',
                          'text-xs font-medium transition-colors',
                          isPast
                            ? 'border-line bg-muted text-ink-secondary hover:bg-line-strong'
                            : 'border-primary/20 bg-primary text-white hover:bg-primary-hover'
                        )}
                      >
                        {span.kickoffCol !== null && (
                          <span
                            aria-hidden="true"
                            className="absolute inset-y-1.5 w-1 rounded-full bg-late"
                            style={{ insetInlineStart: `${((span.kickoffCol - span.startCol) / width) * 100}%` }}
                          />
                        )}
                        <span className="truncate">{ev.title}</span>
                      </button>
                    </Tooltip>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-4 px-1 text-xs text-ink-tertiary">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded bg-primary" aria-hidden="true" />
          חלון עבודה (הכנה עד תאריך אמת)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-1 rounded-full bg-late" aria-hidden="true" />
          תאריך תאריך התנעה
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded bg-muted" aria-hidden="true" />
          הסתיים
        </span>
      </div>
    </div>
  );
};
