import React from 'react';
import { BarChart3, CheckCircle2, Clock, Calendar, Users, Target, Award, Sparkles } from 'lucide-react';
import { EventItem, MonthMeta, UserAccess } from '../types';
import { calculateEventProgress, formatDate } from '../utils/dateHelpers';

interface AnalyticsViewProps {
  events: EventItem[];
  months: MonthMeta[];
  users: UserAccess[];
  boardName: string;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  events,
  months,
  users,
  boardName
}) => {
  // Aggregate statistics
  const totalEvents = events.length;
  const kickoffsCount = events.filter((e) => !!e.kickoffDate).length;
  const actualsCount = events.filter((e) => !!e.actualDate).length;

  let totalTasks = 0;
  let completedTasks = 0;
  let inProgressTasks = 0;
  let todoTasks = 0;

  const tasksByAssignee: { [email: string]: { name: string; total: number; done: number } } = {};
  users.forEach((u) => {
    tasksByAssignee[u.email] = { name: u.name, total: 0, done: 0 };
  });

  const eventsByCategory: { [cat: string]: number } = {
    holiday: 0,
    campaign: 0,
    b2b: 0,
    social: 0,
    operational: 0,
    other: 0
  };

  events.forEach((ev) => {
    eventsByCategory[ev.category] = (eventsByCategory[ev.category] || 0) + 1;

    (ev.tasks || []).forEach((t) => {
      totalTasks++;
      if (t.status === 'done') completedTasks++;
      else if (t.status === 'in_progress' || t.status === 'ready_kickoff') inProgressTasks++;
      else todoTasks++;

      if (t.assigneeEmail) {
        if (!tasksByAssignee[t.assigneeEmail]) {
          tasksByAssignee[t.assigneeEmail] = { name: t.assigneeName || t.assigneeEmail, total: 0, done: 0 };
        }
        tasksByAssignee[t.assigneeEmail].total++;
        if (t.status === 'done') {
          tasksByAssignee[t.assigneeEmail].done++;
        }
      }
    });
  });

  const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const categoryLabels: { [k: string]: { label: string; color: string } } = {
    holiday: { label: 'חגים ומועדים', color: '#F7414B' },
    campaign: { label: 'קמפיינים עונתיים', color: '#5059FF' },
    b2b: { label: 'ועדים ו-B2B', color: '#FF732D' },
    social: { label: 'סושיאל ומדיה', color: '#2FA36B' },
    operational: { label: 'תפעול ופיתוח', color: '#FFD446' },
    other: { label: 'אחר', color: '#9A9291' }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
      {/* Header */}
      <div className="bg-white border-2 border-[#3A3534] rounded-2xl p-5 xtra-sticker-shadow flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-[#3A3534] flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#5059FF]" />
            <span>דשבורד ביצועים ומעקב משימות: {boardName}</span>
          </h2>
          <p className="text-xs text-[#6B6362] mt-0.5">
            ניתוח עומסי עבודה, קצב התקדמות וחלוקת משימות לפי חברי צוות
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold bg-[#FAF8F7] px-3.5 py-1.5 rounded-full border border-[#E6E2E1]">
          <span>עודכן לאחרונה: <b>היום</b></span>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Events */}
        <div className="bg-white border-2 border-[#3A3534] rounded-2xl p-5 xtra-sticker-shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-[#6B6362] block">סך אירועים וקמפיינים</span>
            <span className="text-3xl font-extrabold text-[#3A3534] mt-1 block">{totalEvents}</span>
            <span className="text-[11px] text-[#2FA36B] font-semibold">2026–2028</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#FFE7E8] border border-[#F7414B] flex items-center justify-center text-[#F7414B]">
            <Calendar className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: Total Tasks */}
        <div className="bg-white border-2 border-[#3A3534] rounded-2xl p-5 xtra-sticker-shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-[#6B6362] block">סך משימות במערכת</span>
            <span className="text-3xl font-extrabold text-[#3A3534] mt-1 block">{totalTasks}</span>
            <span className="text-[11px] text-[#5059FF] font-semibold">{completedTasks} משימות הושלמו</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#E6E7FF] border border-[#5059FF] flex items-center justify-center text-[#5059FF]">
            <Target className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Completion Rate */}
        <div className="bg-white border-2 border-[#3A3534] rounded-2xl p-5 xtra-sticker-shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-[#6B6362] block">אחוז ביצוע כולל</span>
            <span className="text-3xl font-extrabold text-[#2FA36B] mt-1 block">{overallProgress}%</span>
            <div className="w-24 h-2 bg-[#E6E2E1] rounded-full overflow-hidden mt-1.5">
              <div
                className="h-full bg-[#2FA36B] rounded-full"
                style={{ width: `${overallProgress}%` }}
              ></div>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#E3F7EC] border border-[#2FA36B] flex items-center justify-center text-[#2FA36B]">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: Team Members */}
        <div className="bg-white border-2 border-[#3A3534] rounded-2xl p-5 xtra-sticker-shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-[#6B6362] block">חברי צוות בעלי גישה</span>
            <span className="text-3xl font-extrabold text-[#3A3534] mt-1 block">{users.length}</span>
            <span className="text-[11px] text-[#6B6362]">מורשי עריכה וצפייה</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#FFF6DC] border border-[#FFD446] flex items-center justify-center text-[#3A3534]">
            <Users className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Breakdown Section: Categories & Workload */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown */}
        <div className="bg-white border-2 border-[#3A3534] rounded-2xl p-6 xtra-sticker-shadow flex flex-col gap-4">
          <h3 className="text-sm font-extrabold text-[#3A3534] border-b border-[#E6E2E1] pb-3">
            פילוח אירועים לפי קטגוריות
          </h3>

          <div className="flex flex-col gap-3">
            {Object.entries(categoryLabels).map(([catKey, meta]) => {
              const count = eventsByCategory[catKey] || 0;
              const pct = totalEvents > 0 ? Math.round((count / totalEvents) * 100) : 0;

              return (
                <div key={catKey} className="flex flex-col gap-1 text-xs">
                  <div className="flex items-center justify-between font-bold">
                    <span className="flex items-center gap-2 text-[#3A3534]">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: meta.color }}></span>
                      <span>{meta.label}</span>
                    </span>
                    <span className="text-[#6B6362]">
                      {count} אירועים ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[#FAF8F7] border border-[#E6E2E1] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${pct}%`, backgroundColor: meta.color }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Workload by Assignee */}
        <div className="bg-white border-2 border-[#3A3534] rounded-2xl p-6 xtra-sticker-shadow flex flex-col gap-4">
          <h3 className="text-sm font-extrabold text-[#3A3534] border-b border-[#E6E2E1] pb-3">
            עומס משימות לפי חברי צוות
          </h3>

          <div className="flex flex-col gap-3.5">
            {Object.entries(tasksByAssignee).map(([email, info]) => {
              const pct = info.total > 0 ? Math.round((info.done / info.total) * 100) : 0;

              return (
                <div key={email} className="flex flex-col gap-1 text-xs">
                  <div className="flex items-center justify-between font-bold">
                    <div className="flex flex-col">
                      <span className="text-[#3A3534]">{info.name}</span>
                      <span className="text-[10px] text-[#9A9291] font-mono">{email}</span>
                    </div>
                    <span className="text-[#6B6362]">
                      {info.done}/{info.total} משימות ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[#FAF8F7] border border-[#E6E2E1] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#5059FF] rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
