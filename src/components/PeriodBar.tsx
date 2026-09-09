import React from 'react';
import { CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Period,
  PeriodMode,
  hebrewMonthRange,
  isSamePeriod,
  monthTitle,
  periodOfToday,
  periodTitle,
  shiftPeriod,
  timelineMonths,
  withMode
} from '../utils/period';
import { Button, cn } from './ui';

interface PeriodBarProps {
  period: Period;
  onChange: (next: Period) => void;
  /**
   * The calendar draws exactly the period. The timeline draws a year that opens
   * at it, so it says so instead of pretending a single month is on screen.
   */
  variant: 'calendar' | 'timeline';
  /** Month/week only makes sense where a week is a real thing to draw. */
  allowWeek?: boolean;
}

/**
 * What am I looking at, and how do I move.
 *
 * The bar it replaces was a strip of 23 month chips that looked like a filter
 * and behaved like a bookmark: it highlighted a month, scrolled to it, and left
 * the timeline showing all 23 regardless. Here the title is the answer, the
 * arrows move the thing on screen, and there is nothing that looks clickable
 * but is not.
 */
export const PeriodBar: React.FC<PeriodBarProps> = ({
  period,
  onChange,
  variant,
  allowWeek = false
}) => {
  const today = periodOfToday(period.mode);
  const onToday = isSamePeriod(period, today);

  const months = variant === 'timeline' ? timelineMonths(period) : [];
  const title =
    variant === 'timeline'
      ? `${monthTitle(months[0].key)} – ${monthTitle(months[months.length - 1].key)}`
      : periodTitle(period);

  const subtitle =
    variant === 'timeline'
      ? 'שנה קדימה מהחודש שנבחר'
      : period.mode === 'month'
        ? hebrewMonthRange(period.anchor.slice(0, 7))
        : null;

  /**
   * The timeline draws months whatever the calendar is set to, so its arrows
   * move a month. Stepping by a week here would move the chart by a seventh of
   * a column while the button said "month".
   */
  const step = (delta: number) =>
    onChange(
      variant === 'timeline'
        ? { ...period, anchor: shiftPeriod(withMode(period, 'month'), delta).anchor }
        : shiftPeriod(period, delta)
    );

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-line bg-surface px-3 py-2.5 sm:px-6">
      <div className="flex shrink-0 items-center gap-0.5">
        <Button variant="ghost" size="sm" iconOnly onClick={() => step(-1)} aria-label={backLabel(period, variant)}>
          <ChevronRight className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="sm" iconOnly onClick={() => step(1)} aria-label={forwardLabel(period, variant)}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
      </div>

      <div className="order-last min-w-0 basis-full sm:order-none sm:basis-auto sm:flex-1">
        <h2 className="text-md font-bold tracking-tight text-ink" aria-live="polite">
          {title}
        </h2>
        {subtitle && <p className="text-xs text-ink-tertiary">{subtitle}</p>}
      </div>

      <Button variant="secondary" size="sm" className="shrink-0" onClick={() => onChange(today)} disabled={onToday}>
        <CalendarCheck className="h-4.5 w-4.5" />
        היום
      </Button>

      {allowWeek && (
        <div
          className="flex items-center gap-0.5 rounded-lg bg-subtle p-0.5"
          role="group"
          aria-label="גודל התצוגה"
        >
          <ModeButton mode="month" current={period.mode} onSelect={(m) => onChange(withMode(period, m))}>
            חודש
          </ModeButton>
          <ModeButton mode="week" current={period.mode} onSelect={(m) => onChange(withMode(period, m))}>
            שבוע
          </ModeButton>
        </div>
      )}
    </div>
  );
};

function ModeButton({
  mode,
  current,
  onSelect,
  children
}: {
  mode: PeriodMode;
  current: PeriodMode;
  onSelect: (mode: PeriodMode) => void;
  children: React.ReactNode;
}) {
  const active = mode === current;
  return (
    <button
      onClick={() => onSelect(mode)}
      aria-pressed={active}
      className={cn(
        'rounded-md px-3 py-1 text-sm font-semibold transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
        active ? 'bg-surface text-ink shadow-card' : 'text-ink-secondary hover:text-ink'
      )}
    >
      {children}
    </button>
  );
}

function backLabel(period: Period, variant: PeriodBarProps['variant']): string {
  if (variant === 'timeline') return 'הזז חודש אחורה';
  return period.mode === 'week' ? 'לשבוע הקודם' : 'לחודש הקודם';
}

function forwardLabel(period: Period, variant: PeriodBarProps['variant']): string {
  if (variant === 'timeline') return 'הזז חודש קדימה';
  return period.mode === 'week' ? 'לשבוע הבא' : 'לחודש הבא';
}
