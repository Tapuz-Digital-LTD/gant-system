import React, { useState } from 'react';
import { Layers, Calendar, CheckCircle2, Clock, AlertTriangle, ArrowRight, ArrowLeft } from 'lucide-react';
import { MonthMeta, EventItem, FilterState, UserAccess } from '../types';
import { formatDate, calculateEventProgress } from '../utils/dateHelpers';

interface GanttTimelineViewProps {
  months: MonthMeta[];
  events: EventItem[];
  filterState: FilterState;
  onOpenEventDetail: (event: EventItem) => void;
  currentUser: UserAccess;
}

export const GanttTimelineView: React.FC<GanttTimelineViewProps> = ({
  months,
  events,
  filterState,
  onOpenEventDetail,
  currentUser
}) => {
  const [timelineZoom, setTimelineZoom] = useState<'months' | 'compact'>('months');

  // Filter events
  const filteredEvents = events.filter((ev) => {
    if (filterState.search) {
      const q = filterState.search.toLowerCase();
      const matchTitle = ev.title.toLowerCase().includes(q);
      const matchDesc = (ev.description || '').toLowerCase().includes(q);
      const matchTask = ev.tasks?.some(
        (t) => t.title.toLowerCase().includes(q) || t.assigneeName.toLowerCase().includes(q)
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

    if (filterState.year !== 'all') {
      const inYear = ev.monthKey.startsWith(filterState.year) ||
        (ev.kickoffDate && ev.kickoffDate.startsWith(filterState.year)) ||
        (ev.actualDate && ev.actualDate.startsWith(filterState.year));
      if (!inYear) return false;
    }

    return true;
  });

  // Calculate timeline positions for each event
  // We map each month to an index 0..months.length - 1
  const monthKeyToIndex = new Map<string, number>();
  months.forEach((m, idx) => {
    monthKeyToIndex.set(m.key, idx);
  });

  function getMonthIndex(isoOrMonthKey?: string): number {
    if (!isoOrMonthKey) return 0;
    const prefix = isoOrMonthKey.slice(0, 7);
    if (monthKeyToIndex.has(prefix)) {
      return monthKeyToIndex.get(prefix)!;
    }
    // Fallback if before or after range
    const [y, m] = prefix.split('-').map(Number);
    const startYear = months[0].year;
    const startMonth = months[0].monthNumber;
    return (y - startYear) * 12 + (m - startMonth);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
      {/* View Header & Legend */}
      <div className="bg-white border-2 border-[#3A3534] rounded-2xl p-5 xtra-sticker-shadow flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-[#3A3534] flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#F7414B]" />
            <span>גאנט ציר זמן ושלבי הכנה (2026–2028)</span>
          </h2>
          <p className="text-xs text-[#6B6362] mt-1">
            הצגת תהליכי התנעה, חודשי הכנה מקדימים ותאריכי אמת לכל האירועים
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-[#3A3534]">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-[#F7414B]"></span>
            <span>תאריך התנעה (קמפיין עולה לאוויר)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-[#5059FF]"></span>
            <span>תקופת הכנה ותפעול מקדים</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-[#3A3534]"></span>
            <span>תאריך אמת (מועד האירוע)</span>
          </div>
        </div>
      </div>

      {/* Gantt Timeline Container */}
      <div className="bg-white border-2 border-[#3A3534] rounded-2xl xtra-sticker-shadow overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <div className="min-w-[1100px]">
            {/* Timeline Header Row (Months) */}
            <div className="grid grid-cols-[300px_repeat(23,minmax(70px,1fr))] border-b-2 border-[#3A3534] bg-[#FAF8F7] text-xs font-bold text-[#3A3534]">
              <div className="p-3 border-l-2 border-[#3A3534] sticky right-0 bg-[#FAF8F7] z-10 flex items-center justify-between">
                <span>אירוע ומשימות</span>
                <span className="text-[10px] text-[#9A9291]">סטטוס / התקדמות</span>
              </div>
              {months.map((m) => (
                <div
                  key={m.key}
                  className="p-2.5 text-center border-l border-[#E6E2E1] flex flex-col items-center justify-center gap-0.5"
                >
                  <span className="text-[11px] truncate">{m.title.replace(' 20', " '")}</span>
                  <span className="text-[9px] text-[#9A9291] font-mono">{m.key}</span>
                </div>
              ))}
            </div>

            {/* Event Timeline Rows */}
            <div className="divide-y divide-[#E6E2E1]">
              {filteredEvents.length === 0 ? (
                <div className="p-12 text-center text-[#9A9291] text-sm italic">
                  לא נמצאו אירועים התואמים את המסננים שנבחרו
                </div>
              ) : (
                filteredEvents.map((ev) => {
                  const progress = calculateEventProgress(ev);

                  // Calculate start & end columns on the 23-month scale
                  let kickoffIdx = ev.kickoffDate ? getMonthIndex(ev.kickoffDate) : -1;
                  let actualIdx = ev.actualDate ? getMonthIndex(ev.actualDate) : getMonthIndex(ev.monthKey);

                  if (kickoffIdx === -1 && ev.prepMonths > 0) {
                    kickoffIdx = Math.max(0, actualIdx - ev.prepMonths);
                  }

                  const startIdx = kickoffIdx !== -1 ? Math.min(kickoffIdx, actualIdx) : actualIdx;
                  const endIdx = Math.max(startIdx, actualIdx);

                  const colSpan = Math.max(1, endIdx - startIdx + 1);

                  return (
                    <div
                      key={ev.id}
                      className="grid grid-cols-[300px_repeat(23,minmax(70px,1fr))] hover:bg-[#FAF8F7] transition-colors items-center group"
                    >
                      {/* Left Title Column (Sticky) */}
                      <div
                        onClick={() => onOpenEventDetail(ev)}
                        className="p-3 border-l-2 border-[#3A3534] sticky right-0 bg-white group-hover:bg-[#FAF8F7] z-10 cursor-pointer flex flex-col gap-1"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-[#3A3534] truncate hover:text-[#F7414B]">
                            {ev.title}
                          </span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#E6E2E1] text-[#3A3534] shrink-0">
                            {ev.tasks?.length || 0} משימות
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-[#6B6362]">
                          <span>{ev.note || (ev.prepMonths > 0 ? `הכנה ${ev.prepMonths} ח׳` : 'חד יומי')}</span>
                          {progress.totalTasks > 0 && (
                            <span className="font-bold text-[#2FA36B]">
                              {progress.percentage}% הושלם
                            </span>
                          )}
                        </div>

                        {/* Progress line */}
                        {progress.totalTasks > 0 && (
                          <div className="w-full h-1 bg-[#E6E2E1] rounded-full overflow-hidden mt-0.5">
                            <div
                              className="h-full bg-[#2FA36B] rounded-full"
                              style={{ width: `${progress.percentage}%` }}
                            ></div>
                          </div>
                        )}
                      </div>

                      {/* Timeline Bars Grid */}
                      <div className="col-span-23 grid grid-cols-23 h-14 items-center px-1 relative">
                        {/* Background grid lines */}
                        {Array.from({ length: 23 }).map((_, i) => (
                          <div
                            key={i}
                            className="h-full border-l border-[#F3F1F0] pointer-events-none"
                          ></div>
                        ))}

                        {/* Gantt Activity Bar */}
                        {startIdx >= 0 && startIdx < 23 && (
                          <div
                            onClick={() => onOpenEventDetail(ev)}
                            style={{
                              gridColumnStart: startIdx + 1,
                              gridColumnEnd: Math.min(24, startIdx + 1 + colSpan)
                            }}
                            className="h-8 rounded-xl border-2 border-[#3A3534] xtra-sticker-shadow-sm flex items-center justify-between px-2.5 text-xs font-bold text-white cursor-pointer transition-transform hover:scale-[1.01] active:scale-[0.99] z-1 relative overflow-hidden"
                            style-color={{
                              backgroundColor: ev.kickoffDate ? '#F7414B' : '#3A3534'
                            }}
                          >
                            {/* Inner gradient based on kickoff to actual date */}
                            <div
                              className="absolute inset-0 opacity-90"
                              style={{
                                background:
                                  colSpan > 1
                                    ? 'linear-gradient(to left, #F7414B 0%, #5059FF 50%, #3A3534 100%)'
                                    : ev.kickoffDate
                                    ? '#F7414B'
                                    : '#3A3534'
                              }}
                            ></div>

                            {/* Bar label */}
                            <div className="relative z-2 flex items-center justify-between w-full truncate gap-2">
                              <span className="truncate text-[11px] drop-shadow-sm">
                                {ev.title}
                              </span>
                              <div className="flex items-center gap-1 shrink-0 text-[10px]">
                                {ev.kickoffDate && (
                                  <span className="bg-black/30 px-1.5 py-0.5 rounded">
                                    {formatDate(ev.kickoffDate)}
                                  </span>
                                )}
                                {colSpan > 1 && <ArrowLeft className="w-3 h-3" />}
                                {ev.actualDate && (
                                  <span className="bg-black/40 px-1.5 py-0.5 rounded">
                                    {formatDate(ev.actualDate)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
