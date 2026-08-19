import React from 'react';
import { ChevronRight, ChevronLeft, CalendarRange } from 'lucide-react';
import { MonthMeta } from '../types';

interface MonthSelectorProps {
  months: MonthMeta[];
  selectedMonthIndex: number;
  showAllMonths: boolean;
  onSelectMonth: (index: number) => void;
  onToggleShowAll: () => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  activeYearFilter: string;
  onSelectYear: (year: string) => void;
}

export const MonthSelector: React.FC<MonthSelectorProps> = ({
  months,
  selectedMonthIndex,
  showAllMonths,
  onSelectMonth,
  onToggleShowAll,
  onPrevMonth,
  onNextMonth,
  activeYearFilter,
  onSelectYear
}) => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 pb-2 flex flex-col gap-3">
      {/* Year Filter & Navigation Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Year Pills */}
        <div className="flex items-center gap-1.5 bg-white p-1 rounded-full border-2 border-[#3A3534] xtra-sticker-shadow-sm">
          <span className="text-[11px] font-bold text-[#6B6362] px-2.5">שנה:</span>
          {(['all', '2026', '2027', '2028'] as const).map((yr) => (
            <button
              key={yr}
              onClick={() => onSelectYear(yr)}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                activeYearFilter === yr
                  ? 'bg-[#F7414B] text-white'
                  : 'hover:bg-[#FAF8F7] text-[#3A3534]'
              }`}
            >
              {yr === 'all' ? 'הכל (2026–2028)' : yr}
            </button>
          ))}
        </div>

        {/* Previous / Next / All Months Toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={onPrevMonth}
            disabled={selectedMonthIndex === 0 && !showAllMonths}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full border-2 border-[#3A3534] bg-white hover:bg-[#FAF8F7] text-[#3A3534] font-bold text-xs transition-all xtra-sticker-shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="חודש קודם"
          >
            <ChevronRight className="w-4 h-4" />
            <span>חודש קודם</span>
          </button>

          <button
            onClick={onNextMonth}
            disabled={selectedMonthIndex === months.length - 1 && !showAllMonths}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full border-2 border-[#3A3534] bg-white hover:bg-[#FAF8F7] text-[#3A3534] font-bold text-xs transition-all xtra-sticker-shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="חודש הבא"
          >
            <span>חודש הבא</span>
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            onClick={onToggleShowAll}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full border-2 border-[#3A3534] font-bold text-xs transition-all xtra-sticker-shadow-sm ${
              showAllMonths
                ? 'bg-[#5059FF] text-white'
                : 'bg-white hover:bg-[#FAF8F7] text-[#3A3534]'
            }`}
          >
            <CalendarRange className="w-3.5 h-3.5" />
            <span>{showAllMonths ? 'הצגת חודש בודד' : 'הצגת כל החודשים רציף'}</span>
          </button>
        </div>
      </div>

      {/* Horizontal Month Chips Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
        {months.map((m, i) => {
          const isSelected = i === selectedMonthIndex && !showAllMonths;
          return (
            <button
              key={m.key}
              onClick={() => onSelectMonth(i)}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border-2 transition-all cursor-pointer ${
                isSelected
                  ? 'border-[#3A3534] bg-[#3A3534] text-white xtra-sticker-shadow-sm'
                  : 'border-[#E6E2E1] bg-white text-[#3A3534] hover:border-[#3A3534] hover:bg-[#FAF8F7]'
              }`}
            >
              <span>{m.title.replace(' 20', " '")}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
