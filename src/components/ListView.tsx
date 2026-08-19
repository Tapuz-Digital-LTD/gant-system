import React, { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, Clock, Plus, Tag, User, Calendar, ExternalLink } from 'lucide-react';
import { EventItem, FilterState, UserAccess, TaskItem } from '../types';
import { formatDate, calculateEventProgress } from '../utils/dateHelpers';

interface ListViewProps {
  events: EventItem[];
  filterState: FilterState;
  onOpenEventDetail: (event: EventItem) => void;
  onToggleTaskStatus: (eventId: string, taskId: string) => void;
  onOpenAddEvent: () => void;
  currentUser: UserAccess;
}

export const ListView: React.FC<ListViewProps> = ({
  events,
  filterState,
  onOpenEventDetail,
  onToggleTaskStatus,
  onOpenAddEvent,
  currentUser
}) => {
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(new Set());

  const canEdit = currentUser.role === 'admin' || currentUser.role === 'editor';

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-[#3A3534]">
            רשימת אירועים ומשימות מפורטת
          </h2>
          <p className="text-xs text-[#6B6362]">
            תצוגת טבלה מלאה, מעקב התקדמות ומשימות לכל אירוע
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

      {/* Table Container */}
      <div className="bg-white border-2 border-[#3A3534] rounded-2xl xtra-sticker-shadow overflow-hidden">
        <div className="divide-y divide-[#E6E2E1]">
          {filteredEvents.length === 0 ? (
            <div className="p-12 text-center text-sm text-[#9A9291] italic">
              לא נמצאו אירועים התואמים את החיפוש
            </div>
          ) : (
            filteredEvents.map((ev) => {
              const isExpanded = expandedEventIds.has(ev.id);
              const progress = calculateEventProgress(ev);

              return (
                <div key={ev.id} className="flex flex-col">
                  {/* Event Row */}
                  <div
                    onClick={() => onOpenEventDetail(ev)}
                    className="p-4 hover:bg-[#FAF8F7] transition-colors cursor-pointer flex flex-wrap items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3 min-w-[280px]">
                      <button
                        onClick={(e) => toggleExpand(ev.id, e)}
                        className="p-1 rounded-lg hover:bg-[#E6E2E1] text-[#6B6362]"
                        title={isExpanded ? 'כווץ משימות' : 'הרחב משימות'}
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>

                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-[#3A3534] hover:text-[#F7414B]">
                            {ev.title}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E6E7FF] text-[#5059FF]">
                            {ev.monthKey}
                          </span>
                        </div>
                        {ev.note && (
                          <span className="text-[11px] text-[#6B6362]">{ev.note}</span>
                        )}
                      </div>
                    </div>

                    {/* Dates */}
                    <div className="flex items-center gap-4 text-xs">
                      {ev.kickoffDate && (
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#F7414B]"></span>
                          <span className="text-[#6B6362]">התנעה:</span>
                          <span className="font-bold text-[#F7414B] font-mono">
                            {formatDate(ev.kickoffDate)}
                          </span>
                        </div>
                      )}
                      {ev.actualDate && (
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#3A3534]"></span>
                          <span className="text-[#6B6362]">אמת:</span>
                          <span className="font-bold text-[#3A3534] font-mono">
                            {ev.isFloating ? 'במהלך החודש' : formatDate(ev.actualDate)}
                          </span>
                        </div>
                      )}
                      {ev.prepMonths > 0 && (
                        <span className="text-[11px] bg-[#E6E7FF] text-[#5059FF] px-2 py-0.5 rounded-full font-semibold">
                          הכנה {ev.prepMonths} ח׳
                        </span>
                      )}
                    </div>

                    {/* Tasks Progress & View Action */}
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#3A3534]">
                          {progress.completedTasks}/{progress.totalTasks} משימות
                        </span>
                        <div className="w-16 h-2 bg-[#E6E2E1] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#2FA36B] rounded-full"
                            style={{ width: `${progress.percentage}%` }}
                          ></div>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenEventDetail(ev);
                        }}
                        className="text-xs font-bold text-[#5059FF] hover:underline flex items-center gap-1"
                      >
                        <span>פרטים</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Subtasks List */}
                  {isExpanded && (
                    <div className="bg-[#FAF8F7] border-t border-[#E6E2E1] px-6 py-3 flex flex-col gap-2">
                      <div className="text-[11px] font-bold text-[#6B6362]">
                        משימות פעילות לאירוע ({ev.tasks?.length || 0}):
                      </div>

                      {(!ev.tasks || ev.tasks.length === 0) ? (
                        <div className="text-xs text-[#9A9291] italic py-1">
                          אין עדיין משימות שהוגדרו לאירוע זה. לחץ על "פרטים" להוספת משימות.
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {ev.tasks.map((task) => (
                            <div
                              key={task.id}
                              className="flex items-center justify-between gap-3 p-2 rounded-xl bg-white border border-[#E6E2E1] text-xs"
                            >
                              <div className="flex items-center gap-2.5 truncate">
                                {canEdit ? (
                                  <button
                                    onClick={() => onToggleTaskStatus(ev.id, task.id)}
                                    className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors ${
                                      task.status === 'done'
                                        ? 'bg-[#2FA36B] border-[#2FA36B] text-white'
                                        : 'border-[#3A3534] bg-white hover:bg-[#FAF8F7]'
                                    }`}
                                  >
                                    {task.status === 'done' && <CheckCircle2 className="w-3.5 h-3.5" />}
                                  </button>
                                ) : (
                                  <span
                                    className={`w-3.5 h-3.5 rounded-full ${
                                      task.status === 'done' ? 'bg-[#2FA36B]' : 'bg-[#C7C1C0]'
                                    }`}
                                  ></span>
                                )}

                                <span
                                  className={`truncate font-medium ${
                                    task.status === 'done' ? 'line-through text-[#9A9291]' : 'text-[#3A3534]'
                                  }`}
                                >
                                  {task.title}
                                </span>
                              </div>

                              <div className="flex items-center gap-3 shrink-0 text-[11px] text-[#6B6362]">
                                <span className="flex items-center gap-1">
                                  <User className="w-3 h-3 text-[#9A9291]" />
                                  <span>{task.assigneeName}</span>
                                </span>
                                {task.dueDate && (
                                  <span className="font-mono">{formatDate(task.dueDate)}</span>
                                )}
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    task.priority === 'urgent'
                                      ? 'bg-[#FFE7E8] text-[#F7414B]'
                                      : task.priority === 'high'
                                      ? 'bg-[#FFEBE0] text-[#FF732D]'
                                      : 'bg-[#FAF8F7] text-[#6B6362]'
                                  }`}
                                >
                                  {task.priority === 'urgent'
                                    ? 'דחוף'
                                    : task.priority === 'high'
                                    ? 'גבוה'
                                    : task.priority === 'medium'
                                    ? 'בינוני'
                                    : 'נמוך'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
