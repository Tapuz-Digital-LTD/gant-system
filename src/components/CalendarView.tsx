import React, { useMemo, useState } from 'react';
import { CalendarOff, Plus } from 'lucide-react';
import { EventItem, FilterState, Holiday, isFloating, monthKeyOf } from '../types';
import { filterEvents } from '../utils/filterEvents';
import type { Can } from '../hooks/useCan';
import { MILESTONES, MILESTONE_BY_KEY, milestoneText, milestonesOf } from '../data/milestones';
import type { MilestoneOccurrence } from '../data/milestones';
import {
  Period,
  calendarGrid,
  monthName,
  monthKey as monthKeyOfDate,
  periodRange,
  todayISO
} from '../utils/period';
import { useHolidays } from '../hooks/useBoardData';
import { Button, Tooltip, cn } from './ui';

interface CalendarViewProps {
  period: Period;
  events: EventItem[];
  filterState: FilterState;
  onOpenEventDetail: (event: EventItem) => void;
  onQuickAddOnDate: (dateStr: string, monthKey: string) => void;
  can: Can;
}

/**
 * One calendar for both a month and a week.
 *
 * Every date an event has appears on the day it actually falls on, labelled
 * with its own icon and its own word — the same icon and word the form used
 * when someone typed it, and the same one the timeline draws. One event with
 * two dates shows up twice, on the two right days, and it is still one event.
 *
 * An event date that is a whole month is not put on the 1st. Nobody chose the
 * 1st, so it goes in a strip of its own that says "during the month".
 */

const WEEKDAY_SHORT = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const WEEKDAY_LONG = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const HOLIDAY_STYLE: Record<Holiday['kind'], string> = {
  major: 'text-cat-holiday',
  minor: 'text-ink-tertiary',
  modern: 'text-cat-b2b',
  fast: 'text-ink-secondary',
  roshchodesh: 'text-ink-tertiary'
};

/** A month cell has room for three chips; a week cell has room for all of them. */
const MAX_CHIPS_MONTH = 3;

const ActualIcon = MILESTONE_BY_KEY.actual.icon;

export const CalendarView: React.FC<CalendarViewProps> = ({
  period,
  events,
  filterState,
  onOpenEventDetail,
  onQuickAddOnDate,
  can
}) => {
  const canAdd = can('event.create');
  const today = todayISO();
  const isWeek = period.mode === 'week';
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const visibleEvents = useMemo(() => filterEvents(events, filterState), [events, filterState]);
  const hiddenKinds = filterState.hiddenMilestones;

  const days = useMemo(() => calendarGrid(period), [period]);
  const range = periodRange(period);

  const holidaysQuery = useHolidays(days[0].date, days[days.length - 1].date, true);
  const holidaysByDate = useMemo(() => {
    const map = new Map<string, Holiday[]>();
    for (const h of holidaysQuery.data ?? []) map.set(h.date, [...(map.get(h.date) ?? []), h]);
    return map;
  }, [holidaysQuery.data]);

  /** Every milestone that lands on a day in this grid, grouped by day. */
  const byDay = useMemo(() => {
    const map = new Map<string, { event: EventItem; occurrence: MilestoneOccurrence }[]>();
    for (const event of visibleEvents) {
      for (const occurrence of milestonesOf(event)) {
        if (occurrence.monthOnly) continue;
        if (hiddenKinds.includes(occurrence.meta.key)) continue;
        const list = map.get(occurrence.date) ?? [];
        list.push({ event, occurrence });
        map.set(occurrence.date, list);
      }
    }
    for (const list of map.values()) list.sort((a, b) => a.occurrence.meta.order - b.occurrence.meta.order);
    return map;
  }, [visibleEvents, hiddenKinds]);

  /** Events with no exact day, filed under a month inside this period. */
  const floating = useMemo(() => {
    if (hiddenKinds.includes('actual')) return [];
    const months = new Set(days.filter((d) => d.inPeriod).map((d) => monthKeyOfDate(d.date)));
    return visibleEvents.filter((e) => isFloating(e) && months.has(monthKeyOf(e)));
  }, [visibleEvents, days, hiddenKinds]);

  /** The kinds actually on screen — the legend explains what is here, not everything. */
  const presentKinds = useMemo(() => {
    const keys = new Set<string>();
    for (const [date, list] of byDay) {
      if (date >= range.from && date <= range.to) for (const { occurrence } of list) keys.add(occurrence.meta.key);
    }
    if (floating.length) keys.add('actual');
    return MILESTONES.filter((m) => keys.has(m.key));
  }, [byDay, floating, range.from, range.to]);

  const nothingHere = presentKinds.length === 0;

  return (
    <div className="p-3 sm:p-5">
      {/*
        A phone gets an agenda, not a seven-column grid squeezed to 50px where
        every name is an ellipsis. Same events, same words, same icons — read
        top to bottom instead of left to right.
      */}
      <Agenda
        days={days}
        byDay={byDay}
        floating={floating}
        holidays={holidaysByDate}
        today={today}
        canAdd={canAdd}
        onOpenEventDetail={onOpenEventDetail}
        onQuickAddOnDate={onQuickAddOnDate}
        rangeFrom={range.from}
      />

      <section className="hidden overflow-hidden rounded-xl border border-line bg-surface shadow-card sm:block">
        {/* weekday header */}
        <div className="grid grid-cols-7 border-b border-line bg-canvas">
          {(isWeek ? days : WEEKDAY_SHORT.map((_, i) => ({ weekday: i, date: '' }))).map((d, i) => (
            <div
              key={i}
              className={cn(
                'px-1 py-2 text-center',
                d.weekday >= 5 ? 'text-ink-disabled' : 'text-ink-tertiary'
              )}
            >
              <div className="text-sm font-semibold">
                {isWeek ? WEEKDAY_LONG[d.weekday] : WEEKDAY_SHORT[d.weekday]}
              </div>
              {isWeek && 'date' in d && d.date && (
                <div
                  className={cn(
                    'text-xs tnum',
                    d.date === today ? 'font-bold text-primary' : 'text-ink-disabled'
                  )}
                >
                  {Number(d.date.slice(8, 10))} ב{monthName(d.date)}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* days */}
        <div className="grid grid-cols-7">
          {days.map((day, idx) => {
            const entries = byDay.get(day.date) ?? [];
            const holidays = holidaysByDate.get(day.date) ?? [];
            const isToday = day.date === today;
            const isPast = day.date < today;
            const isWeekend = day.weekday >= 5;
            const expanded = expandedDay === day.date;
            const limit = isWeek || expanded ? entries.length : MAX_CHIPS_MONTH;
            const shown = entries.slice(0, limit);
            const rest = entries.length - shown.length;

            return (
              <div
                key={day.date}
                className={cn(
                  'group relative flex flex-col gap-1 border-b border-s border-line p-1.5',
                  'nth-[7n+1]:border-s-0',
                  isWeek ? 'min-h-72' : 'min-h-30',
                  !day.inPeriod && 'bg-canvas',
                  day.inPeriod && isWeekend && 'bg-subtle',
                  day.inPeriod &&
                    !isWeekend &&
                    (holidays.some((h) => h.isYomTov) ? 'bg-cat-holiday/8' : 'bg-surface')
                )}
              >
                <div className="flex items-center gap-1">
                  <span
                    className={cn(
                      'grid h-6 min-w-6 shrink-0 place-items-center rounded-full px-1.5 text-sm tnum',
                      isToday && 'bg-primary font-bold text-white',
                      !isToday && !day.inPeriod && 'text-ink-disabled',
                      !isToday && day.inPeriod && isPast && 'text-ink-tertiary',
                      !isToday && day.inPeriod && !isPast && 'font-semibold text-ink-secondary'
                    )}
                  >
                    {Number(day.date.slice(8, 10))}
                  </span>

                  {holidays.length > 0 && (
                    <Tooltip
                      label={`${holidays.map((h) => h.title).join(' · ')} — ${holidays[0].hebrewDate}`}
                    >
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate text-xs',
                          HOLIDAY_STYLE[(holidays.find((h) => h.kind === 'major') ?? holidays[0]).kind],
                          holidays.some((h) => h.isYomTov) && 'font-semibold'
                        )}
                      >
                        {(holidays.find((h) => h.kind === 'major') ?? holidays[0]).title}
                      </span>
                    </Tooltip>
                  )}

                  <span className="flex-1" />

                  {day.inPeriod && canAdd && (
                    <button
                      onClick={() => onQuickAddOnDate(day.date, monthKeyOfDate(day.date))}
                      aria-label={`הוסף אירוע ב-${Number(day.date.slice(8, 10))} ב${monthName(day.date)}`}
                      className={cn(
                        'grid h-5 w-5 shrink-0 place-items-center rounded text-ink-tertiary transition',
                        'opacity-0 hover:bg-subtle hover:text-ink',
                        'focus-visible:opacity-100 group-hover:opacity-100'
                      )}
                    >
                      <Plus className="h-4.5 w-4.5" />
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  {shown.map(({ event, occurrence }, i) => (
                    <MilestoneChip
                      key={`${event.id}-${occurrence.meta.key}-${i}`}
                      event={event}
                      occurrence={occurrence}
                      dimmed={isPast}
                      detailed={isWeek}
                      onOpen={onOpenEventDetail}
                    />
                  ))}

                  {rest > 0 && (
                    <button
                      onClick={() => setExpandedDay(day.date)}
                      className="rounded-sm px-1 py-0.5 text-start text-xs font-semibold text-ink-tertiary hover:bg-subtle hover:text-ink"
                    >
                      עוד {rest}
                    </button>
                  )}
                  {expanded && !isWeek && (
                    <button
                      onClick={() => setExpandedDay(null)}
                      className="rounded-sm px-1 py-0.5 text-start text-xs font-semibold text-ink-tertiary hover:bg-subtle hover:text-ink"
                    >
                      צמצם
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* events with no exact day */}
        {floating.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-line bg-canvas px-4 py-2.5">
            <span className="text-xs font-semibold text-ink-tertiary">
              במהלך החודש, בלי יום מדויק
            </span>
            {floating.map((ev) => (
              <button
                key={ev.id}
                onClick={() => onOpenEventDetail(ev)}
                className="flex items-center gap-1.5 rounded-md border border-ms-actual/25 bg-ms-actual-soft px-2 py-1 text-xs font-semibold text-ink transition-colors hover:border-ms-actual/50"
              >
                <ActualIcon className="h-3.5 w-3.5 text-ms-actual" aria-hidden="true" />
                {ev.title}
              </button>
            ))}
          </div>
        )}

        {nothingHere && (
          <div className="flex flex-col items-center gap-2 border-t border-line px-4 py-10 text-center">
            <CalendarOff className="h-7 w-7 text-ink-disabled" aria-hidden="true" />
            <p className="text-md font-semibold text-ink">
              {isWeek ? 'שבוע פנוי' : 'אין אירועים בחודש הזה'}
            </p>
            <p className="max-w-xs text-base text-ink-secondary">
              {hiddenKinds.length > 0
                ? 'ייתכן שכיבית חלק מהתאריכים ב"מה מוצג". אפשר להדליק אותם שוב.'
                : 'אפשר לעבור לתקופה אחרת עם החצים למעלה, או להוסיף אירוע חדש.'}
            </p>
            {canAdd && (
              <Button
                variant="primary"
                className="mt-1"
                onClick={() => onQuickAddOnDate(range.from, monthKeyOfDate(range.from))}
              >
                <Plus className="h-5 w-5" />
                הוסף אירוע
              </Button>
            )}
          </div>
        )}
      </section>

      {presentKinds.length > 0 && <Legend kinds={presentKinds} />}
    </div>
  );
};

function Agenda({
  days,
  byDay,
  floating,
  holidays,
  today,
  canAdd,
  onOpenEventDetail,
  onQuickAddOnDate,
  rangeFrom
}: {
  days: { date: string; inPeriod: boolean; weekday: number }[];
  byDay: Map<string, { event: EventItem; occurrence: MilestoneOccurrence }[]>;
  floating: EventItem[];
  holidays: Map<string, Holiday[]>;
  today: string;
  canAdd: boolean;
  onOpenEventDetail: (e: EventItem) => void;
  onQuickAddOnDate: (date: string, monthKey: string) => void;
  rangeFrom: string;
}) {
  const withSomething = days.filter(
    (d) => d.inPeriod && ((byDay.get(d.date)?.length ?? 0) > 0 || (holidays.get(d.date)?.length ?? 0) > 0)
  );

  return (
    <section className="flex flex-col gap-2 sm:hidden">
      {withSomething.length === 0 && floating.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface px-4 py-10 text-center">
          <CalendarOff className="h-7 w-7 text-ink-disabled" aria-hidden="true" />
          <p className="text-md font-semibold text-ink">אין כאן כלום בתקופה הזאת</p>
          {canAdd && (
            <Button variant="primary" onClick={() => onQuickAddOnDate(rangeFrom, monthKeyOfDate(rangeFrom))}>
              <Plus className="h-5 w-5" />
              הוסף אירוע
            </Button>
          )}
        </div>
      ) : (
        withSomething.map((day) => {
          const entries = byDay.get(day.date) ?? [];
          const dayHolidays = holidays.get(day.date) ?? [];
          const isToday = day.date === today;

          return (
            <div
              key={day.date}
              className={cn(
                'overflow-hidden rounded-xl border bg-surface shadow-card',
                isToday ? 'border-primary' : 'border-line'
              )}
            >
              <div
                className={cn(
                  'flex items-baseline gap-2 px-3 py-2',
                  isToday ? 'bg-primary-soft' : 'bg-canvas'
                )}
              >
                <span className={cn('text-md font-bold tnum', isToday ? 'text-primary' : 'text-ink')}>
                  {Number(day.date.slice(8, 10))} ב{monthName(day.date)}
                </span>
                <span className="text-sm text-ink-tertiary">{WEEKDAY_LONG[day.weekday]}</span>
                {isToday && <span className="text-sm font-semibold text-primary">היום</span>}
                {dayHolidays.length > 0 && (
                  <span
                    className={cn(
                      'ms-auto truncate text-sm',
                      HOLIDAY_STYLE[(dayHolidays.find((h) => h.kind === 'major') ?? dayHolidays[0]).kind]
                    )}
                  >
                    {(dayHolidays.find((h) => h.kind === 'major') ?? dayHolidays[0]).title}
                  </span>
                )}
              </div>

              {entries.length > 0 && (
                <ul className="flex flex-col divide-y divide-line">
                  {entries.map(({ event, occurrence }, i) => (
                    <li key={`${event.id}-${occurrence.meta.key}-${i}`}>
                      <button
                        onClick={() => onOpenEventDetail(event)}
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-start transition-colors hover:bg-subtle"
                      >
                        <span
                          className={cn(
                            'grid h-8 w-8 shrink-0 place-items-center rounded-lg',
                            occurrence.meta.bg,
                            occurrence.meta.text
                          )}
                        >
                          <occurrence.meta.icon className="h-4.5 w-4.5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn('block text-sm font-bold', occurrence.meta.text)}>
                            {milestoneText(occurrence.meta, event.category).short}
                          </span>
                          <span className="block text-base text-ink">{event.title}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })
      )}

      {floating.length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-3 shadow-card">
          <p className="mb-2 text-sm font-bold text-ink-secondary">במהלך החודש, בלי יום מדויק</p>
          <ul className="flex flex-col gap-1.5">
            {floating.map((ev) => (
              <li key={ev.id}>
                <button
                  onClick={() => onOpenEventDetail(ev)}
                  className="flex w-full items-center gap-2 rounded-lg border border-ms-actual/25 bg-ms-actual-soft px-2.5 py-2 text-start"
                >
                  <ActualIcon className="h-4.5 w-4.5 shrink-0 text-ms-actual" aria-hidden="true" />
                  <span className="text-base text-ink">{ev.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function MilestoneChip({
  event,
  occurrence,
  dimmed,
  detailed,
  onOpen
}: {
  event: EventItem;
  occurrence: MilestoneOccurrence;
  dimmed: boolean;
  detailed: boolean;
  onOpen: (e: EventItem) => void;
}) {
  const { meta } = occurrence;
  const Icon = meta.icon;
  // The wording follows the kind of work, so a date is not called one thing in
  // the form and another on the calendar.
  const text = milestoneText(meta, event.category);

  return (
    <Tooltip label={`${text.short} · ${event.title} — ${text.hint}`}>
      <button
        onClick={() => onOpen(event)}
        className={cn(
          'flex w-full flex-col gap-0.5 rounded-md border-s-2 px-1.5 py-1 text-start transition-colors',
          meta.bg,
          meta.border,
          'hover:brightness-95',
          dimmed && 'opacity-60'
        )}
      >
        <span className={cn('flex items-center gap-1 text-xs font-bold', meta.text)}>
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{text.short}</span>
        </span>
        <span
          className={cn('block text-xs text-ink', detailed ? 'line-clamp-2' : 'truncate')}
        >
          {event.title}
        </span>
      </button>
    </Tooltip>
  );
}

function Legend({ kinds }: { kinds: typeof MILESTONES }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-surface px-3 py-2.5">
      <span className="text-xs font-bold text-ink-secondary">מה הסימונים אומרים</span>
      {kinds.map((m) => (
        <span key={m.key} className="flex items-center gap-1.5 text-xs text-ink-secondary">
          <span className={cn('grid h-5 w-5 place-items-center rounded', m.bg, m.text)}>
            <m.icon className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="font-semibold text-ink">{m.short}</span>
          <span className="hidden text-ink-tertiary lg:inline">— {m.hint}</span>
        </span>
      ))}
    </div>
  );
}
