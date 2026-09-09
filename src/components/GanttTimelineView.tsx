import React, { useMemo } from 'react';
import { CalendarOff, Plus } from 'lucide-react';
import { EventItem, FilterState, isFloating } from '../types';
import { filterEvents } from '../utils/filterEvents';
import type { Can } from '../hooks/useCan';
import { MILESTONES, milestonesOf, workWindowStart } from '../data/milestones';
import type { MilestoneOccurrence } from '../data/milestones';
import { CATEGORY_META } from '../utils/eventMeta';
import { formatDate } from '../utils/dateHelpers';
import {
  Period,
  addDays,
  endOfMonth,
  monthName,
  timelineMonths,
  todayISO
} from '../utils/period';
import { Button, Dot, Tooltip, cn } from './ui';

interface GanttTimelineViewProps {
  period: Period;
  events: EventItem[];
  filterState: FilterState;
  onOpenEventDetail: (event: EventItem) => void;
  onAdd: () => void;
  can: Can;
}

/**
 * "When do we start working, when do we go live, and when does it happen?"
 *
 * The bar is the preparation period and nothing else — it ends on the event
 * date, exactly as prepMonths has always meant. A campaign that keeps running
 * afterwards gets a second, visibly different stretch, so the two are never
 * read as one thing.
 *
 * A start that came from month arithmetic is drawn as a fade, because that is
 * what it is. A start somebody typed is drawn with a hard edge. Nothing here
 * moves a date to make the picture tidier.
 */

const DAY = 86_400_000;

function ms(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export const GanttTimelineView: React.FC<GanttTimelineViewProps> = ({
  period,
  events,
  filterState,
  onOpenEventDetail,
  onAdd,
  can
}) => {
  const canAdd = can('event.create');
  const months = useMemo(() => timelineMonths(period), [period]);
  const today = todayISO();

  const windowFrom = `${months[0].key}-01`;
  const windowTo = endOfMonth(`${months[months.length - 1].key}-01`);
  const span = ms(windowTo) - ms(windowFrom) + DAY;

  /** Where a day sits across the whole window, as a percentage. */
  const at = (date: string) => ((ms(date) - ms(windowFrom)) / span) * 100;
  const clamp = (pct: number) => Math.min(100, Math.max(0, pct));

  const hiddenKinds = filterState.hiddenMilestones;

  const rows = useMemo(() => {
    return filterEvents(events, filterState)
      .map((ev) => {
        const start = workWindowStart(ev);
        // A month-precision event runs to the end of its month, because that is
        // all anyone said. It is not pinned to the 1st.
        const eventEnd = isFloating(ev) ? endOfMonth(ev.actualDate) : ev.actualDate;
        const tailEnd = ev.campaignEndDate;
        const last = tailEnd && tailEnd > eventEnd ? tailEnd : eventEnd;

        // Anything that does not touch the window is not drawn at all.
        if (last < windowFrom || start.date > windowTo) return null;

        return {
          ev,
          start,
          eventEnd,
          tailEnd,
          startsBefore: start.date < windowFrom,
          endsAfter: last > windowTo,
          marks: milestonesOf(ev).filter(
            (o) => !o.monthOnly && !hiddenKinds.includes(o.meta.key) && o.date >= windowFrom && o.date <= windowTo
          )
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => a.start.date.localeCompare(b.start.date));
  }, [events, filterState, hiddenKinds, windowFrom, windowTo]);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-20 text-center">
        <CalendarOff className="h-7 w-7 text-ink-disabled" aria-hidden="true" />
        <p className="text-md font-semibold text-ink">אין אירועים בתקופה הזאת</p>
        <p className="max-w-sm text-base text-ink-secondary">
          התצוגה מראה שנה קדימה מהחודש שנבחר. אפשר לעבור לתקופה אחרת עם החצים למעלה.
        </p>
        {canAdd && (
          <Button variant="primary" className="mt-1" onClick={onAdd}>
            <Plus className="h-5 w-5" />
            הוסף אירוע
          </Button>
        )}
      </div>
    );
  }

  const todayPct = today >= windowFrom && today <= windowTo ? at(today) : null;

  return (
    <div className="p-3 sm:p-5">
      <p className="mb-3 text-base text-ink-secondary">
        כאן רואים מתי צריך להתחיל לעבוד על כל אירוע ומתי הוא מתקיים.
      </p>

      {/* --- narrow screens get a readable list, not a squashed chart --- */}
      <div className="flex flex-col gap-2 lg:hidden">
        {rows.map(({ ev, start, marks }) => (
          <CompactRow
            key={ev.id}
            event={ev}
            start={start}
            marks={marks}
            onOpen={onOpenEventDetail}
          />
        ))}
      </div>

      {/* --- the chart --- */}
      <div className="hidden overflow-x-auto rounded-xl border border-line bg-surface shadow-card lg:block">
        <div className="min-w-5xl">
          {/* months */}
          <div className="flex border-b border-line bg-canvas">
            <div className="sticky inset-s-0 z-20 w-60 shrink-0 border-e border-line bg-canvas px-3 py-2 text-xs font-bold text-ink-tertiary">
              אירוע
            </div>
            <div
              className="relative grid flex-1"
              style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}
            >
              {months.map((m) => (
                <div
                  key={m.key}
                  className={cn(
                    'border-e border-line px-1 py-2 text-center text-xs',
                    m.key === today.slice(0, 7) ? 'font-bold text-primary' : 'text-ink-tertiary'
                  )}
                >
                  {monthName(m.key)}
                  <span className="block text-ink-disabled tnum">{String(m.year).slice(2)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* rows */}
          <div className="divide-y divide-line">
            {rows.map(({ ev, start, eventEnd, tailEnd, startsBefore, endsAfter, marks }) => {
              const cat = CATEGORY_META[ev.category];
              const barFrom = clamp(at(start.date));
              const barTo = clamp(at(addDays(eventEnd, 1)));
              const tailTo = tailEnd ? clamp(at(addDays(tailEnd, 1))) : null;
              const done = eventEnd < today;

              return (
                <div key={ev.id} className="group flex transition-colors hover:bg-subtle">
                  <button
                    onClick={() => onOpenEventDetail(ev)}
                    className="sticky inset-s-0 z-20 flex w-60 shrink-0 flex-col gap-0.5 border-e border-line bg-surface px-3 py-2.5 text-start group-hover:bg-subtle"
                  >
                    <span className="flex items-center gap-1.5">
                      <Dot className={cn('shrink-0', cat.dot)} />
                      <span className="truncate text-base font-semibold text-ink" title={ev.title}>
                        {ev.title}
                      </span>
                    </span>
                    <span className="truncate text-xs text-ink-tertiary">
                      {start.approximate
                        ? `הכנה מ${monthName(start.date)}`
                        : `מתחילים ${formatDate(start.date)}`}
                    </span>
                  </button>

                  <div className="relative h-16 flex-1">
                    {/* month gridlines */}
                    <div
                      className="absolute inset-0 grid"
                      style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}
                      aria-hidden="true"
                    >
                      {months.map((m) => (
                        <div key={m.key} className="border-e border-line/60" />
                      ))}
                    </div>

                    {todayPct !== null && (
                      <div
                        className="absolute inset-y-0 w-px bg-primary/40"
                        style={{ insetInlineStart: `${todayPct}%` }}
                        aria-hidden="true"
                      />
                    )}

                    {/* the campaign keeps running after the event */}
                    {tailTo !== null && tailTo > barTo && (
                      <Tooltip label={`הקמפיין ממשיך עד ${formatDate(tailEnd!)}`}>
                        <div
                          className="absolute inset-y-6 rounded-e-full border border-dashed border-ms-end bg-ms-end-soft"
                          style={{ insetInlineStart: `${barTo}%`, inlineSize: `${tailTo - barTo}%` }}
                        />
                      </Tooltip>
                    )}

                    {/* the preparation period */}
                    <Tooltip
                      label={
                        start.approximate
                          ? `${ev.title} — ההכנה מתחילה במהלך ${monthName(start.date)}, לפי ${ev.prepMonths} חודשי הכנה`
                          : `${ev.title} — מתחילים לעבוד ב-${formatDate(start.date)}`
                      }
                    >
                      <button
                        onClick={() => onOpenEventDetail(ev)}
                        style={{ insetInlineStart: `${barFrom}%`, inlineSize: `${Math.max(barTo - barFrom, 1.2)}%` }}
                        className={cn(
                          'absolute inset-y-4 flex items-center rounded-md',
                          done ? 'bg-muted' : 'bg-primary/85 hover:bg-primary',
                          start.approximate && 'rounded-s-none',
                          startsBefore && 'rounded-s-none'
                        )}
                      >
                        {/* an approximate start fades out instead of claiming a day */}
                        {(start.approximate || startsBefore) && (
                          <span
                            aria-hidden="true"
                            className={cn(
                              'absolute inset-y-0 inset-s-0 w-8 rounded-s-md',
                              done
                                ? 'bg-linear-to-l from-muted to-transparent'
                                : 'bg-linear-to-l from-primary/85 to-transparent'
                            )}
                          />
                        )}
                      </button>
                    </Tooltip>

                    {/* a month-precision event date covers its month */}
                    {isFloating(ev) && (
                      <Tooltip label={`${ev.title} — במהלך ${monthName(ev.actualDate)}, בלי יום מדויק`}>
                        <div
                          className="absolute inset-y-4 rounded-md border-2 border-dashed border-ms-actual/50"
                          style={{
                            insetInlineStart: `${clamp(at(ev.actualDate))}%`,
                            inlineSize: `${clamp(at(addDays(endOfMonth(ev.actualDate), 1))) - clamp(at(ev.actualDate))}%`
                          }}
                        />
                      </Tooltip>
                    )}

                    {/* the milestones, each on its own real day */}
                    {marks.map((mark) => (
                      <Marker key={mark.meta.key} mark={mark} left={at(mark.date)} title={ev.title} />
                    ))}

                    {endsAfter && (
                      <span className="absolute inset-y-0 inset-e-0 grid w-4 place-items-center text-xs text-ink-tertiary">
                        ‹
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Legend />
    </div>
  );
};

function Marker({
  mark,
  left,
  title
}: {
  mark: MilestoneOccurrence;
  left: number;
  title: string;
}) {
  const { meta } = mark;
  const Icon = meta.icon;
  return (
    <Tooltip label={`${meta.short} · ${title} — ${formatDate(mark.date)}`}>
      <span
        className="absolute top-1 z-10 -translate-x-1/2"
        style={{ insetInlineStart: `${left}%` }}
      >
        <span
          className={cn(
            'grid h-5 w-5 place-items-center rounded-full border-2 border-surface shadow-card',
            meta.bg
          )}
        >
          <Icon className={cn('h-3 w-3', meta.text)} aria-hidden="true" />
        </span>
      </span>
    </Tooltip>
  );
}

/** The list a phone gets: the same facts, in words, with nothing to squint at. */
function CompactRow({
  event,
  start,
  marks,
  onOpen
}: {
  event: EventItem;
  start: { date: string; approximate: boolean };
  marks: MilestoneOccurrence[];
  onOpen: (e: EventItem) => void;
}) {
  const cat = CATEGORY_META[event.category];
  return (
    <button
      onClick={() => onOpen(event)}
      className="flex w-full flex-col gap-2 rounded-lg border border-line bg-surface p-3 text-start shadow-card transition-colors hover:border-line-strong"
    >
      <span className="flex items-center gap-1.5">
        <Dot className={cn('shrink-0', cat.dot)} />
        <span className="text-base font-bold text-ink">{event.title}</span>
      </span>

      <span className="flex flex-col gap-1">
        <span className="flex items-center gap-1.5 text-sm text-ink-secondary">
          <MILESTONE_WORK_ICON className="h-4 w-4 shrink-0 text-ms-workstart" aria-hidden="true" />
          {start.approximate
            ? `מתחילים לעבוד במהלך ${monthName(start.date)}`
            : `מתחילים לעבוד ב-${formatDate(start.date)}`}
        </span>

        {marks.map((mark) => (
          <span key={mark.meta.key} className="flex items-center gap-1.5 text-sm text-ink-secondary">
            <mark.meta.icon className={cn('h-4 w-4 shrink-0', mark.meta.text)} aria-hidden="true" />
            {mark.meta.short}: {formatDate(mark.date)}
          </span>
        ))}

        {isFloating(event) && (
          <span className="flex items-center gap-1.5 text-sm text-ink-secondary">
            <MILESTONE_ACTUAL_ICON className="h-4 w-4 shrink-0 text-ms-actual" aria-hidden="true" />
            האירוע במהלך {monthName(event.actualDate)}, בלי יום מדויק
          </span>
        )}
      </span>
    </button>
  );
}

const MILESTONE_WORK_ICON = MILESTONES[0].icon;
const MILESTONE_ACTUAL_ICON = MILESTONES[5].icon;

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-xs">
      <span className="font-bold text-ink-secondary">איך לקרוא את זה</span>

      <span className="flex items-center gap-1.5 text-ink-secondary">
        <span className="h-3 w-6 rounded bg-primary/85" aria-hidden="true" />
        <span className="font-semibold text-ink">תקופת ההכנה</span>
        <span className="hidden text-ink-tertiary sm:inline">— עד תאריך האירוע</span>
      </span>

      <span className="flex items-center gap-1.5 text-ink-secondary">
        <span
          className="h-3 w-6 rounded-e-full border border-dashed border-ms-end bg-ms-end-soft"
          aria-hidden="true"
        />
        <span className="font-semibold text-ink">הקמפיין עוד רץ</span>
        <span className="hidden text-ink-tertiary sm:inline">— אחרי האירוע, עד הסיום</span>
      </span>

      <span className="flex items-center gap-1.5 text-ink-secondary">
        <span
          className="h-3 w-6 rounded bg-linear-to-l from-primary/85 to-transparent"
          aria-hidden="true"
        />
        <span className="font-semibold text-ink">התחלה משוערת</span>
        <span className="hidden text-ink-tertiary sm:inline">— חושבה מחודשי ההכנה, אין יום מדויק</span>
      </span>

      {MILESTONES.filter((m) => m.key !== 'workStart' && m.key !== 'actual').map((m) => (
        <span key={m.key} className="flex items-center gap-1.5 text-ink-secondary">
          <span className={cn('grid h-5 w-5 place-items-center rounded-full', m.bg)}>
            <m.icon className={cn('h-3 w-3', m.text)} aria-hidden="true" />
          </span>
          <span className="font-semibold text-ink">{m.short}</span>
        </span>
      ))}
    </div>
  );
}
