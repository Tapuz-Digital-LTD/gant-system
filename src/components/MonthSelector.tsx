import React, { useEffect, useRef } from 'react';
import { ChevronRight, ChevronLeft, Rows3, CalendarDays } from 'lucide-react';
import { MonthMeta } from '../types';
import { Button, Tooltip, cn } from './ui';

interface MonthSelectorProps {
  months: MonthMeta[];
  selectedMonthIndex: number;
  showAllMonths: boolean;
  onSelectMonth: (index: number) => void;
  onToggleShowAll: () => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

/** "אוגוסט 2026" → "אוגוסט 26" — the century is never in question here. */
function shortMonth(m: MonthMeta): string {
  return `${m.title.replace(/\s+\d{4}$/, '')} ${String(m.year).slice(2)}`;
}

/** The month the user is actually living in, as YYYY-MM. */
function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export const MonthSelector: React.FC<MonthSelectorProps> = ({
  months,
  selectedMonthIndex,
  showAllMonths,
  onSelectMonth,
  onToggleShowAll,
  onPrevMonth,
  onNextMonth
}) => {
  const todayKey = currentMonthKey();
  const todayIndex = months.findIndex((m) => m.key === todayKey);
  const stripRef = useRef<HTMLDivElement>(null);

  // Keep the selected chip in view when navigating with the arrows.
  useEffect(() => {
    stripRef.current
      ?.querySelector('[data-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [selectedMonthIndex, showAllMonths]);

  const selected = months[selectedMonthIndex];

  return (
    <div className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2 sm:px-4">
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          onClick={onPrevMonth}
          disabled={selectedMonthIndex === 0 || showAllMonths}
          aria-label="עבור לחודש הקודם"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          onClick={onNextMonth}
          disabled={selectedMonthIndex >= months.length - 1 || showAllMonths}
          aria-label="עבור לחודש הבא"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
      </div>

      {todayIndex >= 0 && (
        <Tooltip label={months[todayIndex].title}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSelectMonth(todayIndex)}
            disabled={!showAllMonths && selectedMonthIndex === todayIndex}
          >
            <CalendarDays className="h-4.5 w-4.5" />
            היום
          </Button>
        </Tooltip>
      )}

      <span className="h-4 w-px bg-line" aria-hidden="true" />

      {/* month strip */}
      <div
        ref={stripRef}
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scroll-smooth"
        role="tablist"
        aria-label="בחר חודש"
      >
        {months.map((m, i) => {
          const isSelected = i === selectedMonthIndex && !showAllMonths;
          const isToday = m.key === todayKey;
          const isPast = m.key < todayKey;

          return (
            <button
              key={m.key}
              role="tab"
              aria-selected={isSelected}
              data-selected={isSelected}
              onClick={() => onSelectMonth(i)}
              title={m.hebrew}
              className={cn(
                'group relative shrink-0 rounded-md px-2.5 py-1 text-sm font-medium transition-colors',
                isSelected
                  ? 'bg-ink text-white'
                  : isPast
                    ? 'text-ink-disabled hover:bg-subtle hover:text-ink-secondary'
                    : 'text-ink-secondary hover:bg-subtle hover:text-ink'
              )}
            >
              {shortMonth(m)}
              {isToday && !isSelected && (
                <span className="absolute inset-x-2.5 -bottom-px h-0.5 rounded-full bg-primary" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>

      <span className="h-4 w-px bg-line" aria-hidden="true" />

      <Tooltip label={showAllMonths ? 'הצג חודש אחד' : 'הצג את כל החודשים'}>
        <Button
          variant={showAllMonths ? 'secondary' : 'ghost'}
          size="sm"
          iconOnly
          onClick={onToggleShowAll}
          aria-pressed={showAllMonths}
          aria-label={showAllMonths ? 'הצג חודש אחד' : 'הצג את כל החודשים'}
        >
          <Rows3 className="h-5 w-5" />
        </Button>
      </Tooltip>

      {selected && !showAllMonths && (
        <span className="hidden shrink-0 text-xs text-ink-tertiary lg:block">{selected.hebrew}</span>
      )}
    </div>
  );
};
