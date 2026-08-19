import React from 'react';
import { Plus, CheckCircle, Clock, Calendar as CalendarIcon, Tag, AlertCircle } from 'lucide-react';
import { MonthMeta, EventItem, FilterState, UserAccess } from '../types';
import { buildMonthCalendarGrid, formatDate, calculateEventProgress } from '../utils/dateHelpers';

interface MonthlyCalendarViewProps {
  months: MonthMeta[];
  events: EventItem[];
  filterState: FilterState;
  onOpenEventDetail: (event: EventItem) => void;
  onQuickAddOnDate: (dateStr: string, monthKey: string) => void;
  currentUser: UserAccess;
}

export const MonthlyCalendarView: React.FC<MonthlyCalendarViewProps> = ({
  months,
  events,
  filterState,
  onOpenEventDetail,
  onQuickAddOnDate,
  currentUser
}) => {
  const canEdit = currentUser.role === 'admin' || currentUser.role === 'editor';

  // Apply filters on events
  const filteredEvents = events.filter((ev) => {
    if (filterState.search) {
      const q = filterState.search.toLowerCase();
      const matchTitle = ev.title.toLowerCase().includes(q);
      const matchDesc = (ev.description || '').toLowerCase().includes(q);
      const matchTask = ev.tasks?.some(
        (t) => t.title.toLowerCase().includes(q) || t.assigneeName.toLowerCase().includes(q) || t.assigneeEmail.toLowerCase().includes(q)
      );
      if (!matchTitle && !matchDesc && !matchTask) return false;
    }

    if (filterState.category !== 'all' && ev.category !== filterState.category) {
      return false;
    }

    if (filterState.status !== 'all') {
      const hasMatchingTask = ev.tasks?.some((t) => t.status === filterState.status);
      if (!hasMatchingTask) return false;
    }

    if (filterState.assignee && filterState.assignee !== 'all') {
      const hasAssignee = ev.tasks?.some(
        (t) => t.assigneeEmail === filterState.assignee || t.assigneeName.includes(filterState.assignee)
      );
      if (!hasAssignee) return false;
    }

    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-10">
      {months.map((m) => {
        const { cells, floatingEvents, kickoffsThisMonth, actualsThisMonth } = buildMonthCalendarGrid(
          m.key,
          filteredEvents,
          filterState.showKickoffs,
          filterState.showActuals
        );

        return (
          <section
            key={m.key}
            data-screen-label={m.title}
            className="bg-white border-2 border-[#3A3534] rounded-[24px] p-5 sm:p-7 xtra-sticker-shadow flex flex-col gap-6"
          >
            {/* Header: Title and Hebrew calendar reference */}
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[#E6E2E1] pb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl sm:text-3xl font-extrabold text-[#3A3534] tracking-tight">
                  {m.title}
                </h2>
                <span className="text-xs font-semibold text-[#5059FF] bg-[#E6E7FF] px-2.5 py-1 rounded-full border border-[#C8CAFF]">
                  {m.year}
                </span>
              </div>
              <span className="text-sm font-medium text-[#6B6362]">
                {m.hebrew}
              </span>
            </div>

            {/* Days Grid */}
            <div>
              {/* Day column headers */}
              <div className="grid grid-cols-7 gap-2 mb-2">
                {['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map((dName) => (
                  <div
                    key={dName}
                    className="text-center font-bold text-xs tracking-widest text-[#9A9291] py-1 bg-[#FAF8F7] rounded-lg"
                  >
                    {dName}
                  </div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7 gap-2">
                {cells.map((cell, idx) => {
                  return (
                    <div
                      key={`${m.key}-${idx}`}
                      className={`min-h-[105px] sm:min-h-[120px] rounded-xl border p-2 flex flex-col justify-between gap-1.5 transition-all group relative ${
                        cell.inCurrentMonth
                          ? 'bg-white border-[#E6E2E1] hover:border-[#3A3534] hover:shadow-sm'
                          : 'bg-[#FAF8F7] border-[#F3F1F0] opacity-50'
                      }`}
                    >
                      {/* Top bar: Day number & Quick add trigger */}
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-bold ${
                            cell.inCurrentMonth ? 'text-[#3A3534]' : 'text-[#C7C1C0]'
                          }`}
                        >
                          {cell.dayNumber}
                        </span>

                        {cell.inCurrentMonth && canEdit && (
                          <button
                            onClick={() => onQuickAddOnDate(cell.dateString, m.key)}
                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded-full hover:bg-[#FFE7E8] text-[#F7414B] transition-opacity"
                            title={`הוספת אירוע ב-${cell.dayNumber} לחודש`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Event badges in cell */}
                      <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[85px]">
                        {cell.events.map((evItem, evIdx) => {
                          const progress = calculateEventProgress(evItem.item);
                          const isKickoff = evItem.type === 'kickoff';
                          return (
                            <button
                              key={`${evItem.item.id}-${evIdx}`}
                              onClick={() => onOpenEventDetail(evItem.item)}
                              className={`w-full text-right p-1.5 rounded-lg text-xs font-semibold leading-snug transition-transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-xs ${
                                isKickoff
                                  ? 'bg-[#F7414B] text-white hover:bg-[#DE2A34]'
                                  : 'bg-[#3A3534] text-white hover:bg-[#241F1F]'
                              }`}
                              title={`${evItem.item.title} (${evItem.item.note || ''}) - לחץ לצפייה והוספת משימות`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="truncate">{evItem.item.title}</span>
                                {progress.totalTasks > 0 && (
                                  <span className="text-[10px] bg-black/25 px-1 rounded flex-shrink-0">
                                    {progress.completedTasks}/{progress.totalTasks}
                                  </span>
                                )}
                              </div>
                              <div className="text-[9px] opacity-85 flex items-center justify-between mt-0.5">
                                <span>{isKickoff ? 'התנעה' : 'אמת'}</span>
                                {evItem.item.prepMonths > 0 && !isKickoff && (
                                  <span>הכנה {evItem.item.prepMonths}ח׳</span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Bottom placeholder if empty */}
                      {cell.events.length === 0 && <div className="h-2"></div>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Floating Events (Throughout the month without specific date) */}
            {floatingEvents.length > 0 && (
              <div className="border-t border-[#E6E2E1] pt-4 flex flex-col gap-2.5">
                <span className="text-[11px] font-bold tracking-wider text-[#9A9291]">
                  במהלך החודש — ללא תאריך מדויק (Floating Campaigns)
                </span>
                <div className="flex flex-wrap gap-2.5">
                  {floatingEvents.map((fEv) => {
                    const progress = calculateEventProgress(fEv);
                    return (
                      <button
                        key={fEv.id}
                        onClick={() => onOpenEventDetail(fEv)}
                        className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border-2 border-[#3A3534] bg-[#FAF8F7] hover:bg-white text-xs font-bold text-[#3A3534] transition-all xtra-sticker-shadow-sm cursor-pointer"
                      >
                        <span className="w-2.5 h-2.5 rounded-full bg-[#3A3534]"></span>
                        <span>{fEv.title}</span>
                        {fEv.note && (
                          <span className="text-[11px] text-[#6B6362] font-normal">
                            ({fEv.note})
                          </span>
                        )}
                        {progress.totalTasks > 0 && (
                          <span className="text-[10px] bg-[#E6E2E1] px-1.5 py-0.5 rounded-full text-[#3A3534]">
                            ✓ {progress.completedTasks}/{progress.totalTasks}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Monthly Summary Panels: Kickoffs vs Actuals */}
            <div className="border-t border-[#E6E2E1] pt-4 grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Kickoffs This Month */}
              <div className="bg-[#FAF8F7] rounded-2xl p-4 border border-[#E6E2E1] flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#F7414B]"></span>
                    <span className="text-xs font-bold uppercase tracking-wider text-[#F7414B]">
                      התנעה החודש ({kickoffsThisMonth.length})
                    </span>
                  </div>
                  <span className="text-[11px] text-[#6B6362]">עולים לאוויר</span>
                </div>

                {kickoffsThisMonth.length === 0 ? (
                  <div className="text-xs text-[#9A9291] py-2 italic text-center">
                    אין התנעות חדשות בחודש זה
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {kickoffsThisMonth.map((kEv) => {
                      const progress = calculateEventProgress(kEv);
                      return (
                        <div
                          key={kEv.id}
                          onClick={() => onOpenEventDetail(kEv)}
                          className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white border border-[#E6E2E1] hover:border-[#F7414B] transition-colors cursor-pointer"
                        >
                          <div className="flex items-baseline gap-2.5 truncate">
                            <span className="text-xs font-bold text-[#F7414B] font-mono shrink-0">
                              {formatDate(kEv.kickoffDate)}
                            </span>
                            <span className="text-xs font-bold text-[#3A3534] truncate">
                              {kEv.title}
                            </span>
                            {kEv.note && (
                              <span className="text-[11px] text-[#6B6362] truncate hidden sm:inline">
                                {kEv.note}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {progress.totalTasks > 0 ? (
                              <div className="flex items-center gap-1 text-[11px] font-semibold text-[#6B6362]">
                                <span>{progress.percentage}%</span>
                                <div className="w-10 h-1.5 bg-[#E6E2E1] rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-[#2FA36B] rounded-full"
                                    style={{ width: `${progress.percentage}%` }}
                                  ></div>
                                </div>
                              </div>
                            ) : (
                              <span className="text-[10px] text-[#9A9291]">ללא משימות</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Actuals This Month */}
              <div className="bg-[#FAF8F7] rounded-2xl p-4 border border-[#E6E2E1] flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#3A3534]"></span>
                    <span className="text-xs font-bold uppercase tracking-wider text-[#3A3534]">
                      תאריך אמת החודש ({actualsThisMonth.length})
                    </span>
                  </div>
                  <span className="text-[11px] text-[#6B6362]">אירוע בפועל</span>
                </div>

                {actualsThisMonth.length === 0 ? (
                  <div className="text-xs text-[#9A9291] py-2 italic text-center">
                    אין אירועי אמת בחודש זה
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {actualsThisMonth.map((aEv) => {
                      const progress = calculateEventProgress(aEv);
                      return (
                        <div
                          key={aEv.id}
                          onClick={() => onOpenEventDetail(aEv)}
                          className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white border border-[#E6E2E1] hover:border-[#3A3534] transition-colors cursor-pointer"
                        >
                          <div className="flex items-baseline gap-2.5 truncate">
                            <span className="text-xs font-bold text-[#3A3534] font-mono shrink-0">
                              {aEv.isFloating || (aEv.actualDate && aEv.actualDate.length <= 7)
                                ? 'במהלך החודש'
                                : formatDate(aEv.actualDate)}
                            </span>
                            <span className="text-xs font-bold text-[#3A3534] truncate">
                              {aEv.title}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {aEv.prepMonths > 0 && (
                              <span className="text-[11px] font-semibold bg-[#E6E7FF] text-[#5059FF] px-2 py-0.5 rounded-full border border-[#C8CAFF]">
                                הכנה {aEv.prepMonths} ח׳
                              </span>
                            )}
                            {progress.totalTasks > 0 && (
                              <span className="text-[11px] font-bold text-[#2FA36B]">
                                {progress.completedTasks}/{progress.totalTasks}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
};
