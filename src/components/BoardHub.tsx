import React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Download,
  GanttChartSquare,
  KanbanSquare,
  ListTodo,
  Plus,
  Settings2,
  Sparkles,
  Archive,
  Users,
  Copy
} from 'lucide-react';
import { GanttBoard } from '../types';
import type { Can } from '../hooks/useCan';
import { ViewName, buildRoute } from '../utils/routes';
import { periodOfToday, withMode } from '../utils/period';
import { Button, Menu, MenuItem, MenuSeparator, cn } from './ui';

interface BoardHubProps {
  board: GanttBoard;
  can: Can;
  onOpen: (url: string) => void;
  onBackHome: () => void;
  onAddEvent: () => void;
  onOpenAssistant: () => void;
  onOpenExport: () => void;
  onOpenArchive: () => void;
  onOpenPeople: () => void;
  onManageBoards: () => void;
  onDuplicateBoard: () => void;
}

/**
 * The second question: now that you are in a board, what do you want to see?
 *
 * Three answers, each a card big enough to read from across a desk, each
 * saying in plain words what it is for. The things a person needs once a month
 * — status, the numbers, export, settings — are reachable, but they are not
 * competing for attention with the thing they need every morning.
 */

interface Choice {
  view: ViewName;
  title: string;
  blurb: string;
  icon: typeof CalendarDays;
  chip: string;
}

const CHOICES: Choice[] = [
  {
    view: 'calendar',
    title: 'לוח שנה',
    blurb: 'מה קורה בכל יום — האירועים, העליות לאוויר, והחגים.',
    icon: CalendarDays,
    chip: 'bg-primary-soft text-primary'
  },
  {
    view: 'timeline',
    title: 'תכנון לאורך זמן',
    blurb: 'מתי צריך להתחיל לעבוד על כל אירוע, ומתי הוא מתקיים.',
    icon: GanttChartSquare,
    chip: 'bg-ms-workstart-soft text-ms-workstart'
  },
  {
    view: 'list',
    title: 'רשימת אירועים',
    blurb: 'כל האירועים בשורות, לחיפוש מהיר ולסריקה.',
    icon: ListTodo,
    chip: 'bg-ms-review-soft text-ms-review'
  }
];

export const BoardHub: React.FC<BoardHubProps> = ({
  board,
  can,
  onOpen,
  onBackHome,
  onAddEvent,
  onOpenAssistant,
  onOpenExport,
  onOpenArchive,
  onOpenPeople,
  onManageBoards,
  onDuplicateBoard
}) => {
  const open = (view: ViewName, mode: 'month' | 'week' = 'month') =>
    onOpen(buildRoute({ boardId: board.id, view, period: withMode(periodOfToday(), mode) }));

  return (
    <div className="min-h-dvh bg-canvas" dir="rtl">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onBackHome}>
            <ArrowRight className="h-4.5 w-4.5" />
            כל הלוחות
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 pb-16 pt-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{board.name}</h1>
        {board.description && (
          <p className="mt-1 max-w-2xl text-base text-ink-secondary">{board.description}</p>
        )}
        <p className="mt-1 text-sm text-ink-tertiary">
          <span className="tnum">{board.eventCount}</span> אירועים בלוח הזה
        </p>

        <h2 className="mt-8 mb-3 text-md font-bold text-ink">איך תרצה לראות את האירועים?</h2>

        <div className="grid gap-3 sm:grid-cols-3">
          {CHOICES.map((choice) => (
            <button
              key={choice.view}
              onClick={() => open(choice.view)}
              className={cn(
                'group flex flex-col items-start gap-2.5 rounded-xl border border-line bg-surface p-4 text-start',
                'shadow-card transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-raised',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
              )}
            >
              <span className={cn('grid h-11 w-11 place-items-center rounded-lg', choice.chip)}>
                <choice.icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <span className="text-md font-bold text-ink">{choice.title}</span>
              <span className="text-base leading-snug text-ink-secondary">{choice.blurb}</span>
              <span className="mt-auto flex items-center gap-1 pt-2 text-sm font-semibold text-primary">
                פתח
                <ArrowLeft
                  className="h-4 w-4 transition-transform group-hover:-translate-x-0.5"
                  aria-hidden="true"
                />
              </span>
            </button>
          ))}
        </div>

        {/* The week is one click from here, not a screen of its own. */}
        <button
          onClick={() => open('calendar', 'week')}
          className="mt-2 rounded-md px-1 text-base text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          או פתח את לוח השנה על השבוע הזה
        </button>

        <h2 className="mt-9 mb-3 text-md font-bold text-ink">או תוסיף משהו חדש</h2>

        {can('event.create') ? (
          <Button variant="primary" size="md" className="h-12 px-5 text-md" onClick={onAddEvent}>
            <Plus className="h-5 w-5" />
            הוסף אירוע
          </Button>
        ) : (
          <p className="text-base text-ink-secondary">
            יש לך גישת צפייה בלוח הזה. כדי להוסיף אירוע, בקש הרשאת עריכה.
          </p>
        )}

        <div className="mt-10 border-t border-line pt-4">
          <Menu
            align="start"
            trigger={
              <button className="flex items-center gap-2 rounded-md px-2 py-1.5 text-base text-ink-secondary transition-colors hover:bg-subtle hover:text-ink">
                <Settings2 className="h-5 w-5 text-ink-tertiary" aria-hidden="true" />
                עוד אפשרויות
              </button>
            }
          >
            <MenuItem onSelect={() => open('status')}>
              <KanbanSquare className="h-5 w-5" />
              לפי מצב העבודה
            </MenuItem>
            {can('activity.view') && (
              <MenuItem onSelect={() => open('overview')}>
                <BarChart3 className="h-5 w-5" />
                תמונת מצב במספרים
              </MenuItem>
            )}
            <MenuSeparator />
            <MenuItem onSelect={onOpenAssistant}>
              <Sparkles className="h-5 w-5" />
              הצעות למשימות
            </MenuItem>
            {can('export.run') && (
              <MenuItem onSelect={onOpenExport}>
                <Download className="h-5 w-5" />
                הורדה והדפסה
              </MenuItem>
            )}
            <MenuItem onSelect={onOpenArchive}>
              <Archive className="h-5 w-5" />
              ארכיון
            </MenuItem>
            {can('board.duplicate') && (
              <MenuItem onSelect={onDuplicateBoard}>
                <Copy className="h-5 w-5" />
                שכפול הלוח
              </MenuItem>
            )}
            <MenuItem onSelect={onManageBoards}>
              <Settings2 className="h-5 w-5" />
              ניהול הלוחות
            </MenuItem>
            {can('people.manage') && (
              <MenuItem onSelect={onOpenPeople}>
                <Users className="h-5 w-5" />
                אנשים וגישה
              </MenuItem>
            )}
          </Menu>
        </div>
      </main>
    </div>
  );
};
