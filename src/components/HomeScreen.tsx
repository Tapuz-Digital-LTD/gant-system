import React from 'react';
import { ArrowLeft, CalendarDays, LayoutGrid, Plus, RotateCcw, Users } from 'lucide-react';
import { GanttBoard, UserAccess } from '../types';
import type { Can } from '../hooks/useCan';
import { boardRoute, recallPlace } from '../utils/routes';
import { todayISO, monthName } from '../utils/period';
import { Button, cn } from './ui';

interface HomeScreenProps {
  boards: GanttBoard[];
  currentUser: UserAccess;
  can: Can;
  onOpen: (url: string) => void;
  onCreateBoard: () => void;
  onOpenPeople: () => void;
  onSignOut: () => void;
}

/**
 * Where the morning starts.
 *
 * Signing in used to drop a person straight into whichever board happened to
 * be first, with five tabs and a filter bar already open. This screen asks one
 * question instead, and puts the answer someone gives eight times a day — "the
 * board I was in" — above the answer they give once.
 *
 * Only boards the server returned are here. A board somebody may not see is
 * not a card that is greyed out; it is not on the page at all.
 */

/**
 * A stable accent per board, so the same card is the same colour every morning.
 * Written out in full: Tailwind scans source text, so a class name assembled at
 * runtime is a class name that never reaches the stylesheet.
 */
const ACCENTS = [
  { hover: 'hover:border-cat-campaign', chip: 'bg-cat-campaign/10 text-cat-campaign', bar: 'bg-cat-campaign' },
  { hover: 'hover:border-cat-social', chip: 'bg-cat-social/10 text-cat-social', bar: 'bg-cat-social' },
  { hover: 'hover:border-cat-operational', chip: 'bg-cat-operational/10 text-cat-operational', bar: 'bg-cat-operational' },
  { hover: 'hover:border-cat-b2b', chip: 'bg-cat-b2b/10 text-cat-b2b', bar: 'bg-cat-b2b' },
  { hover: 'hover:border-cat-holiday', chip: 'bg-cat-holiday/10 text-cat-holiday', bar: 'bg-cat-holiday' }
];

function accentOf(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return ACCENTS[hash % ACCENTS.length];
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'בוקר טוב';
  if (hour < 18) return 'צהריים טובים';
  return 'ערב טוב';
}

function todayLine(): string {
  const today = todayISO();
  const weekday = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'][
    new Date(`${today}T12:00:00`).getDay()
  ];
  return `יום ${weekday}, ${Number(today.slice(8, 10))} ב${monthName(today)} ${today.slice(0, 4)}`;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  boards,
  currentUser,
  can,
  onOpen,
  onCreateBoard,
  onOpenPeople,
  onSignOut
}) => {
  // Only offer to go back somewhere that still exists and is still allowed.
  const remembered = recallPlace();
  const lastBoard = remembered && boards.find((b) => b.id === remembered.boardId);

  const firstName = currentUser.name?.split(' ')[0] || '';

  return (
    <div className="min-h-dvh bg-canvas" dir="rtl">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-4">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-sm font-extrabold text-white"
            aria-hidden="true"
          >
            X
          </span>
          <span className="text-md font-bold tracking-tight text-ink">תכנון אירועים</span>

          <div className="flex-1" />

          {can('people.manage') && (
            <Button variant="ghost" size="sm" onClick={onOpenPeople}>
              <Users className="h-4.5 w-4.5" />
              <span className="hidden sm:inline">אנשים וגישה</span>
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onSignOut}>
            יציאה
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-16 pt-8 sm:pt-12">
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          {greeting()}
          {firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="mt-1 flex items-center gap-1.5 text-base text-ink-secondary">
          <CalendarDays className="h-4.5 w-4.5 text-ink-tertiary" aria-hidden="true" />
          {todayLine()}
        </p>

        {lastBoard && remembered && (
          <section className="mt-7">
            <h2 className="mb-2 text-sm font-semibold text-ink-tertiary">להמשיך מאיפה שהפסקת</h2>
            <button
              onClick={() => onOpen(remembered.url)}
              className={cn(
                'group flex w-full items-center gap-4 rounded-xl border-2 bg-surface p-4 text-start',
                'border-primary/30 shadow-card transition-all',
                'hover:border-primary hover:shadow-raised',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
              )}
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                <RotateCcw className="h-6 w-6" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-md font-bold text-ink">{lastBoard.name}</span>
                <span className="block truncate text-base text-ink-secondary">
                  {viewLabel(remembered.view)}
                </span>
              </span>
              <ArrowLeft
                className="h-5 w-5 shrink-0 text-primary transition-transform group-hover:-translate-x-0.5"
                aria-hidden="true"
              />
            </button>
          </section>
        )}

        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-ink-tertiary">
            {lastBoard ? 'או פתח לוח אחר' : 'הלוחות שלך'}
          </h2>

          {boards.length === 0 ? (
            <EmptyBoards canCreate={can('board.create')} onCreate={onCreateBoard} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {boards.map((board) => (
                <BoardCard key={board.id} board={board} onOpen={onOpen} />
              ))}
            </div>
          )}
        </section>

        {can('board.create') && boards.length > 0 && (
          <Button variant="secondary" className="mt-4" onClick={onCreateBoard}>
            <Plus className="h-5 w-5" />
            לוח חדש
          </Button>
        )}
      </main>
    </div>
  );
};

function viewLabel(view: string | null): string {
  if (view === 'calendar') return 'לוח שנה';
  if (view === 'timeline') return 'תכנון לאורך זמן';
  if (view === 'list') return 'רשימת אירועים';
  if (view === 'status') return 'לפי מצב';
  if (view === 'overview') return 'תמונת מצב';
  return 'הלוח';
}

function BoardCard({ board, onOpen }: { board: GanttBoard; onOpen: (url: string) => void }) {
  const accent = accentOf(board.id);

  return (
    <button
      onClick={() => onOpen(boardRoute(board.id))}
      className={cn(
        'group relative flex flex-col items-start gap-2 overflow-hidden rounded-xl border bg-surface p-4 text-start',
        'border-line shadow-card transition-all',
        'hover:-translate-y-0.5 hover:shadow-raised',
        accent.hover,
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
      )}
    >
      <span className={cn('absolute inset-y-0 end-0 w-1', accent.bar)} aria-hidden="true" />

      <span className={cn('grid h-10 w-10 place-items-center rounded-lg', accent.chip)}>
        <LayoutGrid className="h-5 w-5" aria-hidden="true" />
      </span>

      <span className="text-md font-bold text-ink">{board.name}</span>

      {board.description && (
        <span className="line-clamp-2 text-base text-ink-secondary">{board.description}</span>
      )}

      <span className="mt-auto flex items-center gap-1.5 pt-2 text-sm text-ink-tertiary">
        <CalendarDays className="h-4 w-4" aria-hidden="true" />
        <span className="tnum">{board.eventCount}</span> אירועים
        <ArrowLeft
          className="h-4 w-4 text-ink-disabled transition-transform group-hover:-translate-x-0.5 group-hover:text-ink-tertiary"
          aria-hidden="true"
        />
      </span>
    </button>
  );
}

function EmptyBoards({ canCreate, onCreate }: { canCreate: boolean; onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-subtle text-ink-tertiary">
        <LayoutGrid className="h-7 w-7" aria-hidden="true" />
      </span>
      <p className="text-md font-semibold text-ink">עדיין אין לך לוחות</p>
      <p className="max-w-xs text-base text-ink-secondary">
        {canCreate
          ? 'לוח הוא מקום אחד לכל האירועים של צוות. צור את הראשון כדי להתחיל.'
          : 'עוד לא שיתפו איתך לוח. פנה למנהל המערכת כדי שיוסיף אותך.'}
      </p>
      {canCreate && (
        <Button variant="primary" onClick={onCreate}>
          <Plus className="h-5 w-5" />
          צור לוח ראשון
        </Button>
      )}
    </div>
  );
}
