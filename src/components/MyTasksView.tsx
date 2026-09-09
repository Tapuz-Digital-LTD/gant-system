import React, { useMemo, useState } from 'react';
import { ArrowRight, Check, CheckCircle2, Inbox, Loader2, MoreHorizontal, Play } from 'lucide-react';
import { MyTask, TaskStatus } from '../types';
import { STATUS_META, isOverdue, todayISO } from '../utils/eventMeta';
import { addDays } from '../utils/period';
import { Button, Menu, MenuItem, cn } from './ui';
import { TaskCard } from './TaskCard';

interface MyTasksViewProps {
  tasks: MyTask[];
  isLoading: boolean;
  onOpenTask: (task: MyTask) => void;
  onMove: (task: MyTask, status: TaskStatus) => void;
  onBackHome: () => void;
}

/**
 * A person's own work, as a board.
 *
 * Trello's bargain, kept: a card shows only what decides whether to pick it up
 * now, and everything else waits behind opening it. Columns are the four states
 * the product already has — no new vocabulary, and none of them hidden to make
 * the screen tidier.
 *
 * Dragging is offered and never required. Every card carries the one obvious
 * next step as a verb — "התחלתי", "סיימתי" — with the rarer moves behind a
 * menu. Someone who cannot drag, or does not think to, loses nothing.
 */

const COLUMNS: TaskStatus[] = ['todo', 'in_progress', 'ready_kickoff', 'done'];

/** The one move worth a button of its own, phrased as what the person did. */
const NEXT_STEP: Partial<Record<TaskStatus, { to: TaskStatus; label: string; icon: typeof Play }>> = {
  todo: { to: 'in_progress', label: 'התחלתי', icon: Play },
  in_progress: { to: 'done', label: 'סיימתי', icon: Check },
  ready_kickoff: { to: 'done', label: 'סיימתי', icon: Check }
};

export const MyTasksView: React.FC<MyTasksViewProps> = ({
  tasks,
  isLoading,
  onOpenTask,
  onMove,
  onBackHome
}) => {
  const [dragging, setDragging] = useState<MyTask | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);

  const byStatus = useMemo(() => {
    const map = new Map<TaskStatus, MyTask[]>(COLUMNS.map((s) => [s, []]));
    for (const t of tasks) map.get(t.status)?.push(t);
    return map;
  }, [tasks]);

  const summary = useMemo(() => {
    const today = todayISO();
    const open = tasks.filter((t) => t.status !== 'done');
    return {
      late: open.filter((t) => isOverdue(t.dueDate ?? undefined, t.status)).length,
      thisWeek: open.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= addDays(today, 7)).length,
      open: open.length,
      done: tasks.length - open.length
    };
  }, [tasks]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-ink-tertiary">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        <span className="text-base">טוען את המשימות שלך…</span>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-canvas" dir="rtl">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:px-6">
          <Button variant="ghost" size="sm" onClick={onBackHome}>
            <ArrowRight className="h-4.5 w-4.5" />
            למסך הראשי
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink">המשימות שלי</h1>

        {tasks.length === 0 ? (
          <EmptyBoard />
        ) : (
          <>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-ink-secondary">
              {summary.late > 0 && (
                <span className="font-semibold text-late">{summary.late} באיחור</span>
              )}
              {summary.thisWeek > 0 && (
                <span className="font-semibold text-progress">{summary.thisWeek} לשבוע הקרוב</span>
              )}
              <span>
                <span className="tnum">{summary.open}</span> פתוחות
              </span>
              {summary.done > 0 && (
                <span className="text-ink-tertiary">
                  <span className="tnum">{summary.done}</span> הושלמו
                </span>
              )}
            </p>

            <div className="mt-5 grid gap-3 lg:grid-cols-4">
              {COLUMNS.map((status) => {
                const meta = STATUS_META[status];
                const items = byStatus.get(status) ?? [];
                const isTarget = over === status;

                return (
                  <section
                    key={status}
                    onDragOver={(e) => {
                      if (!dragging) return;
                      e.preventDefault();
                      setOver(status);
                    }}
                    onDragLeave={() => setOver((s) => (s === status ? null : s))}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragging && dragging.status !== status) onMove(dragging, status);
                      setDragging(null);
                      setOver(null);
                    }}
                    className={cn(
                      'flex flex-col gap-2 rounded-xl p-2 transition-colors',
                      isTarget ? 'bg-primary-soft ring-2 ring-primary' : 'bg-subtle/60'
                    )}
                  >
                    <header className="flex items-center gap-2 px-1 pt-1">
                      <h2 className="text-base font-bold text-ink">{meta.label}</h2>
                      <span className="text-sm text-ink-tertiary tnum">{items.length}</span>
                    </header>

                    {items.length === 0 ? (
                      <p className="px-2 py-6 text-center text-sm text-ink-tertiary">
                        {isTarget ? 'שחרר כאן' : 'אין כאן משימות'}
                      </p>
                    ) : (
                      items.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          context={{ eventTitle: task.eventTitle, boardName: task.boardName }}
                          onOpen={() => onOpenTask(task)}
                          draggable
                          dragging={dragging?.id === task.id}
                          onDragStart={() => setDragging(task)}
                          onDragEnd={() => {
                            setDragging(null);
                            setOver(null);
                          }}
                          actions={<MoveActions task={task} onMove={onMove} />}
                        />
                      ))
                    )}
                  </section>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

/**
 * The alternative to dragging, and for most people the main way.
 *
 * One button, named after what the person did rather than after a status.
 * Everything else is a move somebody makes rarely, so it sits in a menu.
 */
function MoveActions({ task, onMove }: { task: MyTask; onMove: (t: MyTask, s: TaskStatus) => void }) {
  const next = NEXT_STEP[task.status];
  const others = COLUMNS.filter((s) => s !== task.status && s !== next?.to);

  return (
    <div className="flex items-center gap-1 border-t border-line pt-2">
      {next ? (
        <Button variant="secondary" size="sm" onClick={() => onMove(task, next.to)}>
          <next.icon className="h-4 w-4" />
          {next.label}
        </Button>
      ) : (
        <span className="flex items-center gap-1 px-1 text-sm text-done">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          הושלם
        </span>
      )}

      <span className="flex-1" />

      <Menu
        align="end"
        trigger={
          <Button variant="ghost" size="sm" iconOnly aria-label={`העבר את ${task.title} למצב אחר`}>
            <MoreHorizontal className="h-4.5 w-4.5" />
          </Button>
        }
      >
        {others.map((status) => (
          <MenuItem key={status} onSelect={() => onMove(task, status)}>
            העבר ל{STATUS_META[status].label}
          </MenuItem>
        ))}
      </Menu>
    </div>
  );
}

function EmptyBoard() {
  return (
    <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-subtle text-ink-tertiary">
        <Inbox className="h-7 w-7" aria-hidden="true" />
      </span>
      <p className="text-md font-semibold text-ink">אין משימות על שמך</p>
      <p className="max-w-sm text-base text-ink-secondary">
        כשמישהו ישייך אליך משימה היא תופיע כאן, ותקבל על כך התראה. אפשר גם לפתוח אירוע
        ולהוסיף משימה לעצמך.
      </p>
    </div>
  );
}
