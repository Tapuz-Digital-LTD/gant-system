import React from 'react';
import { CheckCircle2, Clock, PlayCircle, Rocket, Plus, User, AlertCircle } from 'lucide-react';
import { EventItem, FilterState, UserAccess, TaskStatus } from '../types';
import { formatDate, calculateEventProgress } from '../utils/dateHelpers';

interface KanbanBoardViewProps {
  events: EventItem[];
  filterState: FilterState;
  onOpenEventDetail: (event: EventItem) => void;
  onOpenAddEvent: () => void;
  currentUser: UserAccess;
}

export const KanbanBoardView: React.FC<KanbanBoardViewProps> = ({
  events,
  filterState,
  onOpenEventDetail,
  onOpenAddEvent,
  currentUser
}) => {
  const canEdit = currentUser.role === 'admin' || currentUser.role === 'editor';

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

    if (filterState.year !== 'all') {
      const inYear = ev.monthKey.startsWith(filterState.year) ||
        (ev.kickoffDate && ev.kickoffDate.startsWith(filterState.year)) ||
        (ev.actualDate && ev.actualDate.startsWith(filterState.year));
      if (!inYear) return false;
    }

    return true;
  });

  // Helper to determine aggregate status of an event
  function getEventAggregateStatus(event: EventItem): TaskStatus {
    const tasks = event.tasks || [];
    if (tasks.length === 0) return 'todo';
    const allDone = tasks.every((t) => t.status === 'done');
    if (allDone) return 'done';
    const anyReady = tasks.some((t) => t.status === 'ready_kickoff');
    if (anyReady) return 'ready_kickoff';
    const anyInProgress = tasks.some((t) => t.status === 'in_progress' || t.status === 'done');
    if (anyInProgress) return 'in_progress';
    return 'todo';
  }

  const columns: { id: TaskStatus; title: string; icon: React.ReactNode; color: string; bg: string }[] = [
    {
      id: 'todo',
      title: 'טרם התחיל / בתכנון',
      icon: <Clock className="w-4 h-4 text-[#9A9291]" />,
      color: '#9A9291',
      bg: '#FAF8F7'
    },
    {
      id: 'in_progress',
      title: 'בתהליך עבודה והכנה',
      icon: <PlayCircle className="w-4 h-4 text-[#5059FF]" />,
      color: '#5059FF',
      bg: '#E6E7FF'
    },
    {
      id: 'ready_kickoff',
      title: 'מוכן להתנעה / באוויר',
      icon: <Rocket className="w-4 h-4 text-[#F7414B]" />,
      color: '#F7414B',
      bg: '#FFE7E8'
    },
    {
      id: 'done',
      title: 'הושלם בהצלחה',
      icon: <CheckCircle2 className="w-4 h-4 text-[#2FA36B]" />,
      color: '#2FA36B',
      bg: '#E3F7EC'
    }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-[#3A3534]">
            לוח קנבן משימות ואירועים
          </h2>
          <p className="text-xs text-[#6B6362]">
            מעקב סטטוס התקדמות קמפיינים ומשימות צוות
          </p>
        </div>
        {canEdit && (
          <button
            onClick={onOpenAddEvent}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border-2 border-[#3A3534] bg-[#F7414B] hover:bg-[#DE2A34] text-white font-bold text-xs xtra-sticker-shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>הוספת אירוע</span>
          </button>
        )}
      </div>

      {/* 4 Column Kanban Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {columns.map((col) => {
          const colEvents = filteredEvents.filter((ev) => getEventAggregateStatus(ev) === col.id);

          return (
            <div
              key={col.id}
              className="bg-[#FAF8F7] border-2 border-[#3A3534] rounded-2xl p-4 flex flex-col gap-3 min-h-[500px]"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between border-b border-[#E6E2E1] pb-3">
                <div className="flex items-center gap-2">
                  <span
                    className="w-7 h-7 rounded-lg flex items-center justify-center border border-[#3A3534]/20"
                    style={{ backgroundColor: col.bg }}
                  >
                    {col.icon}
                  </span>
                  <span className="font-bold text-xs text-[#3A3534]">{col.title}</span>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white border border-[#C7C1C0] text-[#3A3534]">
                  {colEvents.length}
                </span>
              </div>

              {/* Cards in Column */}
              <div className="flex flex-col gap-3 overflow-y-auto flex-1">
                {colEvents.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[#9A9291] italic">
                    אין אירועים בסטטוס זה
                  </div>
                ) : (
                  colEvents.map((ev) => {
                    const progress = calculateEventProgress(ev);

                    return (
                      <div
                        key={ev.id}
                        onClick={() => onOpenEventDetail(ev)}
                        className="bg-white border-2 border-[#3A3534] rounded-xl p-3.5 xtra-sticker-shadow-sm hover:translate-x-0.5 hover:translate-y-0.5 transition-all cursor-pointer flex flex-col gap-2.5"
                      >
                        {/* Title and Category */}
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-bold text-xs text-[#3A3534] leading-snug">
                            {ev.title}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E6E7FF] text-[#5059FF] shrink-0">
                            {ev.monthKey}
                          </span>
                        </div>

                        {/* Dates summary */}
                        <div className="flex flex-col gap-1 text-[11px] text-[#6B6362]">
                          {ev.kickoffDate && (
                            <div className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-[#F7414B]"></span>
                              <span>התנעה: <b>{formatDate(ev.kickoffDate)}</b></span>
                            </div>
                          )}
                          {ev.actualDate && (
                            <div className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-[#3A3534]"></span>
                              <span>אמת: <b>{ev.isFloating ? 'במהלך החודש' : formatDate(ev.actualDate)}</b></span>
                            </div>
                          )}
                        </div>

                        {/* Subtasks Progress */}
                        {progress.totalTasks > 0 && (
                          <div className="flex flex-col gap-1 pt-1 border-t border-[#F3F1F0]">
                            <div className="flex items-center justify-between text-[10px] font-semibold">
                              <span className="text-[#6B6362]">משימות:</span>
                              <span className="text-[#2FA36B]">
                                {progress.completedTasks}/{progress.totalTasks} ({progress.percentage}%)
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-[#E6E2E1] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#2FA36B] rounded-full"
                                style={{ width: `${progress.percentage}%` }}
                              ></div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
