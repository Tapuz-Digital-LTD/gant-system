import React, { useMemo } from 'react';
import { CalendarClock, Rocket, ListChecks, AlertTriangle } from 'lucide-react';
import { EventItem, MonthMeta, UserAccess, EventCategory , monthKeyOf, isFloating } from '../types';
import { CATEGORY_META, isOverdue, avatarColor, currentMonthKey } from '../utils/eventMeta';
import { cn } from './ui';

interface AnalyticsViewProps {
  events: EventItem[];
  months: MonthMeta[];
  users: UserAccess[];
  boardName: string;
}

const CATEGORIES = Object.keys(CATEGORY_META) as EventCategory[];

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ events, months, users }) => {
  const stats = useMemo(() => {
    const thisMonth = currentMonthKey();
    const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<EventCategory, number>;
    const byAssignee = new Map<string, { name: string; total: number; done: number; late: number }>();
    const userNames = new Map(users.map((u) => [u.id, u.name]));

    let totalTasks = 0;
    let doneTasks = 0;
    let lateTasks = 0;

    for (const ev of events) {
      byCategory[ev.category] = (byCategory[ev.category] || 0) + 1;

      for (const t of ev.tasks || []) {
        totalTasks++;
        if (t.status === 'done') doneTasks++;
        if (isOverdue(t.dueDate, t.status)) lateTasks++;

        const key = t.assigneeId ?? 'unassigned';
        const row =
          byAssignee.get(key) ||
          { name: userNames.get(key) ?? 'בלי אחראי', total: 0, done: 0, late: 0 };
        row.total++;
        if (t.status === 'done') row.done++;
        if (isOverdue(t.dueDate, t.status)) row.late++;
        byAssignee.set(key, row);
      }
    }

    const upcoming = events
      .filter((e) => e.actualDate.slice(0, 7) >= thisMonth)
      .sort((a, b) => a.actualDate.localeCompare(b.actualDate))
      .slice(0, 6);

    const perMonth = months.map((m) => ({
      key: m.key,
      label: m.title.replace(/\s+\d{4}$/, ''),
      year: m.year,
      count: events.filter((e) => e.actualDate.startsWith(m.key)).length,
      isNow: m.key === thisMonth
    }));

    return {
      totalEvents: events.length,
      kickoffs: events.filter((e) => e.kickoffDate).length,
      totalTasks,
      doneTasks,
      lateTasks,
      byCategory,
      byAssignee: [...byAssignee.entries()].sort((a, b) => b[1].total - a[1].total),
      upcoming,
      perMonth
    };
  }, [events, months, users]);

  const peak = Math.max(1, ...stats.perMonth.map((m) => m.count));

  const CARDS = [
    { icon: CalendarClock, label: 'אירועים בלוח', value: stats.totalEvents, tint: 'text-primary bg-primary-soft' },
    { icon: Rocket, label: 'עם תאריך תאריך התנעה', value: stats.kickoffs, tint: 'text-ready bg-ready-soft' },
    { icon: ListChecks, label: 'משימות', value: stats.totalTasks, tint: 'text-done bg-done-soft' },
    { icon: AlertTriangle, label: 'משימות באיחור', value: stats.lateTasks, tint: 'text-late bg-late-soft' }
  ];

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      {/* summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {CARDS.map(({ icon: Icon, label, value, tint }) => (
          <div key={label} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-card">
            <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg', tint)}>
              <Icon className="h-5 w-5" />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="text-2xl font-bold text-ink tnum">{value}</span>
              <span className="truncate text-sm text-ink-tertiary">{label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        {/* events per month */}
        <section className="rounded-xl border border-line bg-surface p-4 shadow-card">
          <h2 className="mb-4 text-md font-bold text-ink">אירועים לאורך השנה</h2>
          {stats.totalEvents === 0 ? (
            <p className="py-8 text-center text-base text-ink-tertiary">עוד אין מה להציג</p>
          ) : (
            <div className="flex h-44 items-end gap-1 overflow-x-auto pb-1">
              {stats.perMonth.map((m) => (
                <div key={m.key} className="flex h-full min-w-9 flex-1 flex-col items-center justify-end gap-1.5">
                  <span className="text-xs text-ink-tertiary tnum">{m.count || ''}</span>
                  <div
                    className={cn(
                      'w-full rounded-t-md transition-colors',
                      m.isNow ? 'bg-primary' : m.count ? 'bg-primary-line' : 'bg-subtle'
                    )}
                    style={{ height: `${Math.max(4, (m.count / peak) * 100)}%` }}
                    title={`${m.label} ${m.year}: ${m.count} אירועים`}
                  />
                  <span
                    className={cn(
                      'w-full truncate text-center text-xs',
                      m.isNow ? 'font-bold text-primary' : 'text-ink-tertiary'
                    )}
                  >
                    {m.label.slice(0, 3)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* categories */}
        <section className="rounded-xl border border-line bg-surface p-4 shadow-card">
          <h2 className="mb-4 text-md font-bold text-ink">אירועים לפי קטגוריה</h2>
          <ul className="flex flex-col gap-2.5">
            {CATEGORIES.map((c) => {
              const meta = CATEGORY_META[c];
              const count = stats.byCategory[c] || 0;
              const pct = stats.totalEvents ? Math.round((count / stats.totalEvents) * 100) : 0;
              return (
                <li key={c} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-sm text-ink-secondary">{meta.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-subtle">
                    <div className={cn('h-full rounded-full', meta.dot)} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-10 shrink-0 text-end text-sm text-ink-tertiary tnum">{count}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* workload */}
        <section className="rounded-xl border border-line bg-surface p-4 shadow-card">
          <h2 className="mb-1 text-md font-bold text-ink">משימות לפי אחראי</h2>
          <p className="mb-4 text-sm text-ink-tertiary">
            {stats.totalTasks === 0
              ? 'עוד אין משימות עם אחראי. הנתון יופיע כשיתחילו לעבוד בלוח'
              : `${users.length} אנשים · ${stats.totalTasks} משימות`}
          </p>
          {stats.byAssignee.length === 0 ? (
            <p className="py-6 text-center text-base text-ink-tertiary">—</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {stats.byAssignee.map(([userId, row]) => {
                const pct = row.total ? Math.round((row.done / row.total) * 100) : 0;
                return (
                  <li key={userId} className="flex items-center gap-3">
                    <span
                      className={cn(
                        'grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white',
                        avatarColor(userId)
                      )}
                    >
                      {row.name.charAt(0)}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-base text-ink">{row.name}</span>
                        <span className="shrink-0 text-sm text-ink-tertiary tnum">
                          {row.done}/{row.total}
                          {row.late > 0 && <span className="ms-1.5 font-semibold text-late">{row.late} באיחור</span>}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-subtle">
                        <div className="h-full rounded-full bg-done" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* upcoming */}
        <section className="rounded-xl border border-line bg-surface p-4 shadow-card">
          <h2 className="mb-4 text-md font-bold text-ink">האירועים הקרובים</h2>
          {stats.upcoming.length === 0 ? (
            <p className="py-6 text-center text-base text-ink-tertiary">אין כאן אירועים קרובים</p>
          ) : (
            <ul className="flex flex-col">
              {stats.upcoming.map((ev) => {
                const meta = CATEGORY_META[ev.category];
                return (
                  <li key={ev.id} className="flex items-center gap-3 border-b border-line py-2 last:border-0">
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', meta.dot)} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-base text-ink">{ev.title}</span>
                    <span className="shrink-0 text-sm text-ink-tertiary tnum">
                      {ev.actualDate.slice(0, 7)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};
