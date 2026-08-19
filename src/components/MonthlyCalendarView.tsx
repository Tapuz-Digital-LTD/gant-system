import React, { useMemo, useState } from 'react';
import { Plus, CalendarOff, Rocket, Flag } from 'lucide-react';
import { MonthMeta, EventItem, FilterState, Holiday, monthKeyOf, isFloating } from '../types';
import { filterEvents } from '../utils/filterEvents';
import type { Can } from '../hooks/useCan';
import { buildMonthCalendarGrid, formatDate, calculateEventProgress } from '../utils/dateHelpers';
import { CATEGORY_META, todayISO } from '../utils/eventMeta';
import { Button, Badge, Dot, Tooltip, cn } from './ui';
import { useHolidays } from '../hooks/useBoardData';

interface MonthlyCalendarViewProps {
  months: MonthMeta[];
  events: EventItem[];
  filterState: FilterState;
  onOpenEventDetail: (event: EventItem) => void;
  onQuickAddOnDate: (dateStr: string, monthKey: string) => void;
  can: Can;
}

const WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

const HOLIDAY_STYLE: Record<Holiday['kind'], string> = {
  major: 'text-cat-holiday',
  minor: 'text-ink-tertiary',
  modern: 'text-cat-b2b',
  fast: 'text-ink-secondary',
  roshchodesh: 'text-ink-tertiary'
};
const MAX_CHIPS = 3;

export const MonthlyCalendarView: React.FC<MonthlyCalendarViewProps> = ({
  months,
  events,
  filterState,
  onOpenEventDetail,
  onQuickAddOnDate,
  can
}) => {
  const canAdd = can('event.create');
  const today = todayISO();

  const filteredEvents = useMemo(() => filterEvents(events, filterState), [events, filterState]);

  // The real Hebrew calendar for exactly the months on screen.
  const range = useMemo(() => {
    const first = months[0]?.key ?? '2026-01';
    const last = months[months.length - 1]?.key ?? first;
    return { from: `${first}-01`, to: `${last}-28` };
  }, [months]);

  const holidaysQuery = useHolidays(range.from, range.to, months.length > 0);

  const byDate = useMemo(() => {
    const map = new Map<string, Holiday[]>();
    for (const h of holidaysQuery.data ?? []) map.set(h.date, [...(map.get(h.date) ?? []), h]);
    return map;
  }, [holidaysQuery.data]);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {months.map((m) => (
        <MonthCard
          key={m.key}
          month={m}
          events={filteredEvents}
          filterState={filterState}
          today={today}
          holidays={byDate}
          canAdd={canAdd}
          onOpenEventDetail={onOpenEventDetail}
          onQuickAddOnDate={onQuickAddOnDate}
        />
      ))}
    </div>
  );
};

function MonthCard({
  month,
  events,
  filterState,
  today,
  holidays,
  canAdd,
  onOpenEventDetail,
  onQuickAddOnDate
}: {
  month: MonthMeta;
  events: EventItem[];
  filterState: FilterState;
  today: string;
  holidays: Map<string, Holiday[]>;
  canAdd: boolean;
  onOpenEventDetail: (e: EventItem) => void;
  onQuickAddOnDate: (dateStr: string, monthKey: string) => void;
}) {
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const { cells, floatingEvents, kickoffsThisMonth, actualsThisMonth } = useMemo(
    () => buildMonthCalendarGrid(month.key, events, filterState.showKickoffs, filterState.showActuals),
    [month.key, events, filterState.showKickoffs, filterState.showActuals]
  );

  const isEmpty =
    kickoffsThisMonth.length === 0 && actualsThisMonth.length === 0 && floatingEvents.length === 0;

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line px-4 py-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-2xl font-bold tracking-tight text-ink">{month.title}</h2>
          <span className="text-xs text-ink-tertiary">{month.hebrew}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-ink-secondary">
          <span className="flex items-center gap-1.5">
            <Dot className="bg-primary" />
            {kickoffsThisMonth.length} התנעות
          </span>
          <span className="flex items-center gap-1.5">
            <Dot className="bg-ink" />
            {actualsThisMonth.length} תאריכי אמת
          </span>
        </div>
      </header>

      {/* weekday header */}
      <div className="grid grid-cols-7 border-b border-line bg-canvas">
        {WEEKDAYS.map((d, i) => (
          <div
            key={d}
            className={cn(
              'py-2.5 text-center text-sm font-semibold',
              i >= 5 ? 'text-ink-disabled' : 'text-ink-tertiary'
            )}
          >
            {d}
          </div>
        ))}
      </div>

      {/* day grid */}
      <div className="grid grid-cols-7">
        {cells.map((cell, idx) => {
          const weekday = idx % 7;
          const isWeekend = weekday >= 5;
          const isToday = cell.dateString === today;
          const isPast = cell.inCurrentMonth && cell.dateString < today;
          const expanded = expandedDay === cell.dateString;
          const visible = expanded ? cell.events : cell.events.slice(0, MAX_CHIPS);
          const hidden = cell.events.length - visible.length;

          return (
            <div
              key={`${month.key}-${idx}`}
              className={cn(
                'group relative flex min-h-32 flex-col gap-1.5 border-b border-s border-line p-2',
                'nth-[7n+1]:border-s-0',
                !cell.inCurrentMonth && 'bg-canvas',
                cell.inCurrentMonth && isWeekend && 'bg-subtle',
                cell.inCurrentMonth &&
                  !isWeekend &&
                  (holidays.get(cell.dateString)?.some((h) => h.isYomTov)
                    ? 'bg-cat-holiday/8'
                    : 'bg-surface')
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-sm tnum',
                    isToday && 'bg-primary font-bold text-white',
                    !isToday && !cell.inCurrentMonth && 'text-ink-disabled',
                    !isToday && cell.inCurrentMonth && isPast && 'text-ink-tertiary',
                    !isToday && cell.inCurrentMonth && !isPast && 'font-semibold text-ink-secondary'
                  )}
                >
                  {cell.dayNumber}
                </span>

                {(() => {
                  const dayHolidays = cell.inCurrentMonth ? holidays.get(cell.dateString) ?? [] : [];
                  if (dayHolidays.length === 0) return null;
                  const main = dayHolidays.find((h) => h.kind === 'major') ?? dayHolidays[0];
                  return (
                    <Tooltip label={`${dayHolidays.map((h) => h.title).join(' · ')} — ${main.hebrewDate}`}>
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate px-1 text-xs',
                          HOLIDAY_STYLE[main.kind],
                          main.isYomTov && 'font-semibold'
                        )}
                      >
                        {main.title}
                      </span>
                    </Tooltip>
                  );
                })()}

                {cell.inCurrentMonth && canAdd && (
                  <button
                    onClick={() => onQuickAddOnDate(cell.dateString, month.key)}
                    aria-label={`הוסף אירוע ב-${cell.dayNumber} ב${month.title}`}
                    className={cn(
                      'grid h-5 w-5 place-items-center rounded text-ink-tertiary opacity-0 transition',
                      'hover:bg-subtle hover:text-ink focus-visible:opacity-100 group-hover:opacity-100'
                    )}
                  >
                    <Plus className="h-4.5 w-4.5" />
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-0.5">
                {visible.map((entry, i) => {
                  const isKickoff = entry.type === 'kickoff';
                  const meta = CATEGORY_META[entry.item.category];
                  const progress = calculateEventProgress(entry.item);

                  return (
                    <Tooltip
                      key={`${entry.item.id}-${i}`}
                      label={`${isKickoff ? 'תאריך התנעה' : 'תאריך אמת'} · ${entry.item.title}`}
                    >
                      <button
                        onClick={() => onOpenEventDetail(entry.item)}
                        className={cn(
                          'flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-start text-xs transition-colors',
                          isKickoff
                            ? 'bg-primary-soft font-medium text-primary hover:bg-primary-line'
                            : 'bg-subtle text-ink-secondary hover:bg-muted',
                          isPast && 'opacity-60'
                        )}
                      >
                        <Dot className={cn('shrink-0', meta.dot)} />
                        <span className="min-w-0 flex-1 truncate font-medium">{entry.item.title}</span>
                        {progress.totalTasks > 0 && (
                          <span className="shrink-0 text-ink-tertiary tnum">
                            {progress.completedTasks}/{progress.totalTasks}
                          </span>
                        )}
                      </button>
                    </Tooltip>
                  );
                })}

                {hidden > 0 && (
                  <button
                    onClick={() => setExpandedDay(cell.dateString)}
                    className="rounded-sm px-1 py-0.5 text-start text-xs font-medium text-ink-tertiary hover:bg-subtle hover:text-ink"
                  >
                    עוד {hidden}
                  </button>
                )}
                {expanded && (
                  <button
                    onClick={() => setExpandedDay(null)}
                    className="rounded-sm px-1 py-0.5 text-start text-xs font-medium text-ink-tertiary hover:bg-subtle hover:text-ink"
                  >
                    צמצם
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* floating events */}
      {floatingEvents.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line bg-canvas px-4 py-2.5">
          <span className="text-xs font-semibold text-ink-tertiary">במהלך החודש</span>
          {floatingEvents.map((ev) => {
            const meta = CATEGORY_META[ev.category];
            return (
              <button
                key={ev.id}
                onClick={() => onOpenEventDetail(ev)}
                className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-0.5 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle"
              >
                <Dot className={meta.dot} />
                {ev.title}
              </button>
            );
          })}
        </div>
      )}

      {/* month summary */}
      {isEmpty ? (
        <div className="flex flex-col items-center gap-1.5 border-t border-line px-4 py-8 text-center">
          <CalendarOff className="h-5 w-5 text-ink-disabled" aria-hidden="true" />
          <p className="text-sm font-medium text-ink-secondary">אין כאן אירועים החודש</p>
          {canAdd && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onQuickAddOnDate(`${month.key}-01`, month.key)}
              className="mt-1"
            >
              <Plus className="h-4.5 w-4.5" />
              הוספת אירוע
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-px border-t border-line bg-line md:grid-cols-2">
          <SummaryList
            icon={<Rocket className="h-4.5 w-4.5 text-primary" />}
            title="עולים לאוויר החודש"
            events={kickoffsThisMonth}
            dateOf={(e) => formatDate(e.kickoffDate)}
            onOpen={onOpenEventDetail}
          />
          <SummaryList
            icon={<Flag className="h-4.5 w-4.5 text-ink-secondary" />}
            title="קורים החודש"
            events={actualsThisMonth}
            dateOf={(e) =>
              isFloating(e) || (e.actualDate && e.actualDate.length <= 7)
                ? 'במהלך החודש'
                : formatDate(e.actualDate)
            }
            onOpen={onOpenEventDetail}
          />
        </div>
      )}
    </section>
  );
}

function SummaryList({
  icon,
  title,
  events,
  dateOf,
  onOpen
}: {
  icon: React.ReactNode;
  title: string;
  events: EventItem[];
  dateOf: (e: EventItem) => string;
  onOpen: (e: EventItem) => void;
}) {
  return (
    <div className="bg-surface px-4 py-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-secondary">
        {icon}
        {title}
        <span className="text-ink-tertiary tnum">({events.length})</span>
      </div>

      {events.length === 0 ? (
        <p className="py-1 text-xs text-ink-tertiary">—</p>
      ) : (
        <ul className="flex flex-col">
          {events.map((ev) => {
            const progress = calculateEventProgress(ev);
            return (
              <li key={ev.id}>
                <button
                  onClick={() => onOpen(ev)}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-start transition-colors hover:bg-subtle"
                >
                  <span className="w-24 shrink-0 text-xs text-ink-tertiary tnum">{dateOf(ev)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{ev.title}</span>
                  {progress.totalTasks > 0 && (
                    <Badge tone={progress.percentage === 100 ? 'done' : 'neutral'} className="tnum">
                      {progress.percentage}%
                    </Badge>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
