import React from 'react';
import {
  Archive,
  ArrowRight,
  BellRing,
  BarChart3,
  CalendarDays,
  Copy,
  Download,
  GanttChartSquare,
  KanbanSquare,
  ListChecks,
  ListTodo,
  Loader2,
  LogOut,
  MoreHorizontal,
  Plus,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Users,
  X
} from 'lucide-react';
import { FilterState, GanttBoard, UserAccess } from '../types';
import { CATEGORY_META, STATUS_META, avatarColor } from '../utils/eventMeta';
import { MILESTONES } from '../data/milestones';
import type { MilestoneKey } from '../data/milestones';
import type { Can } from '../hooks/useCan';
import { ViewName } from '../utils/routes';
import { SearchBox } from './SearchBox';
import { NotificationsBell } from './NotificationsBell';
import { Badge, Button, Field, Menu, MenuItem, MenuSeparator, Popover, Select, Tooltip, XtraMark, cn } from './ui';

interface BoardHeaderProps {
  board: GanttBoard;
  view: ViewName;
  currentUser: UserAccess;
  can: Can;
  filterState: FilterState;
  onUpdateFilter: (patch: Partial<FilterState>) => void;
  onSelectView: (view: ViewName) => void;
  onBackHome: () => void;
  onBackToBoard: () => void;
  onAddEvent: () => void;
  onOpenEvent: (eventId: string) => void;
  onOpenExport: () => void;
  onOpenArchive: () => void;
  onOpenPeople: () => void;
  onManageBoards: () => void;
  onDuplicateBoard: () => void;
  onOpenAssistant: () => void;
  onOpenMyTasks: () => void;
  onOpenSettings: () => void;
  onOpenNotificationLink: (link: string) => void;
  onSignOut: () => void;
  isFetching?: boolean;
}

/**
 * Two rows, each with one job: where am I, and what am I looking at.
 *
 * What this replaces was a sidebar of boards, a bar with the board name and six
 * icon buttons, and a row of five tabs — three things that all read as
 * navigation, none of which said where you were. The trail across the top is
 * now the only thing that answers that, and it is also the way back.
 */

const PRIMARY_VIEWS: { id: ViewName; label: string; icon: typeof CalendarDays }[] = [
  { id: 'calendar', label: 'לוח שנה', icon: CalendarDays },
  { id: 'timeline', label: 'תכנון לאורך זמן', icon: GanttChartSquare },
  { id: 'list', label: 'רשימת אירועים', icon: ListTodo }
];

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'כל סוגי האירועים' },
  ...(Object.entries(CATEGORY_META) as [string, { label: string }][]).map(([value, meta]) => ({
    value,
    label: meta.label
  }))
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'כל המצבים' },
  ...(Object.entries(STATUS_META) as [string, { label: string }][]).map(([value, meta]) => ({
    value,
    label: meta.label
  }))
];

export const BoardHeader: React.FC<BoardHeaderProps> = ({
  board,
  view,
  currentUser,
  can,
  filterState,
  onUpdateFilter,
  onSelectView,
  onBackHome,
  onBackToBoard,
  onAddEvent,
  onOpenEvent,
  onOpenExport,
  onOpenArchive,
  onOpenPeople,
  onManageBoards,
  onDuplicateBoard,
  onOpenAssistant,
  onOpenMyTasks,
  onOpenSettings,
  onOpenNotificationLink,
  onSignOut,
  isFetching
}) => {
  const hidden = filterState.hiddenMilestones;
  const activeFilters =
    (filterState.category !== 'all' ? 1 : 0) +
    (filterState.status !== 'all' ? 1 : 0) +
    hidden.length;

  const toggleMilestone = (key: MilestoneKey) =>
    onUpdateFilter({
      hiddenMilestones: hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key]
    });

  const secondaryActive = view === 'status' || view === 'overview';

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      {/* --- where am I --- */}
      <div className="flex h-14 min-w-0 items-center gap-2 px-3 sm:px-5">
        {/*
          The brand, always visible.
          
          It doubles as the way home, which is what people reach for anyway —
          a logo in the corner of a product is a link to the start of it.
        */}
        <button
          onClick={onBackHome}
          aria-label="XTRA — למסך הראשי"
          className="shrink-0 rounded-lg p-0.5 transition hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <XtraMark className="h-7 w-7" alt="" />
        </button>

        <span className="hidden h-5 w-px shrink-0 bg-line sm:block" aria-hidden="true" />

        <Button variant="ghost" size="sm" onClick={onBackHome} className="shrink-0">
          <ArrowRight className="h-4.5 w-4.5" />
          <span className="hidden sm:inline">כל הלוחות</span>
        </Button>

        <span className="hidden text-ink-disabled sm:inline" aria-hidden="true">
          ›
        </span>

        {/* The board name is the trail; on a phone the search box needs the room. */}
        <button
          onClick={onBackToBoard}
          className="hidden min-w-0 truncate rounded-md px-1.5 py-1 text-md font-bold tracking-tight text-ink transition-colors hover:bg-subtle sm:block"
        >
          {board.name}
        </button>

        {isFetching && (
          <span className="flex shrink-0 items-center gap-1 text-xs text-primary">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span className="hidden sm:inline">מסנכרן</span>
          </span>
        )}

        <div className="hidden flex-1 sm:block" />

        <SearchBox boardId={board.id} onOpenEvent={onOpenEvent} />

        <NotificationsBell onOpenLink={onOpenNotificationLink} />

        {can('event.create') && (
          <Button variant="primary" onClick={onAddEvent}>
            <Plus className="h-5 w-5" />
            <span className="hidden sm:inline">הוסף אירוע</span>
          </Button>
        )}

        <Menu
          align="end"
          trigger={
            <button
              className={cn(
                'grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white',
                avatarColor(currentUser.email)
              )}
              aria-label={`מחובר כ-${currentUser.name}`}
            >
              {currentUser.name.charAt(0)}
            </button>
          }
        >
          <div className="px-2 py-1.5">
            <div className="truncate text-base font-semibold text-ink">{currentUser.name}</div>
            <div className="truncate text-xs text-ink-tertiary">{currentUser.email}</div>
          </div>
          <MenuSeparator />
          <MenuItem onSelect={onOpenMyTasks}>
            <ListChecks className="h-5 w-5" />
            המשימות שלי
          </MenuItem>
          <MenuItem onSelect={onOpenSettings}>
            <BellRing className="h-5 w-5" />
            התראות והגדרות
          </MenuItem>
          {can('people.manage') && (
            <MenuItem onSelect={onOpenPeople}>
              <Users className="h-5 w-5" />
              אנשים וגישה
            </MenuItem>
          )}
          <MenuItem onSelect={onSignOut}>
            <LogOut className="h-5 w-5" />
            יציאה
          </MenuItem>
        </Menu>
      </div>

      {/* --- what am I looking at --- */}
      <div className="flex min-w-0 items-center gap-1 px-2 sm:px-4">
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" aria-label="תצוגות">
          {PRIMARY_VIEWS.map((v) => {
            const active = view === v.id;
            return (
              <button
                key={v.id}
                onClick={() => onSelectView(v.id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex shrink-0 items-center gap-2 rounded-t-md px-3 py-2.5 text-base font-semibold transition-colors',
                  active ? 'text-primary' : 'text-ink-tertiary hover:bg-subtle hover:text-ink-secondary'
                )}
              >
                <v.icon className="h-5 w-5" aria-hidden="true" />
                {v.label}
                {active && (
                  <span className="absolute inset-x-1 -bottom-px h-[3px] rounded-t-full bg-primary" />
                )}
              </button>
            );
          })}
        </nav>

        <Popover
          className="w-80"
          trigger={
            <Button variant={activeFilters ? 'secondary' : 'ghost'} size="sm">
              <SlidersHorizontal className="h-4.5 w-4.5" />
              <span className="hidden md:inline">מה מוצג</span>
              {activeFilters > 0 && (
                <Badge tone="primary" className="tnum">
                  {activeFilters}
                </Badge>
              )}
            </Button>
          }
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">מה מוצג על המסך</span>
              {activeFilters > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5"
                  onClick={() =>
                    onUpdateFilter({ category: 'all', status: 'all', hiddenMilestones: [] })
                  }
                >
                  <X className="h-4 w-4" />
                  הצג הכול
                </Button>
              )}
            </div>

            <Field label="סוג האירוע" htmlFor="f-cat">
              <Select
                id="f-cat"
                value={filterState.category}
                onChange={(e) => onUpdateFilter({ category: e.target.value })}
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="מצב העבודה" htmlFor="f-status">
              <Select
                id="f-status"
                value={filterState.status}
                onChange={(e) => onUpdateFilter({ status: e.target.value })}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>

            <fieldset className="flex flex-col gap-1 border-t border-line pt-2.5">
              <legend className="mb-1 text-sm font-semibold text-ink">אילו תאריכים לסמן</legend>
              {MILESTONES.map((m) => {
                const shown = !hidden.includes(m.key);
                return (
                  <label
                    key={m.key}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-base text-ink-secondary hover:bg-subtle"
                  >
                    <input
                      type="checkbox"
                      checked={shown}
                      onChange={() => toggleMilestone(m.key)}
                      className="h-4.5 w-4.5 accent-primary"
                    />
                    <m.icon className={cn('h-4.5 w-4.5', m.text)} aria-hidden="true" />
                    {m.short}
                  </label>
                );
              })}
            </fieldset>
          </div>
        </Popover>

        <Menu
          align="end"
          trigger={
            <Button variant={secondaryActive ? 'secondary' : 'ghost'} size="sm">
              <MoreHorizontal className="h-4.5 w-4.5" />
              <span className="hidden md:inline">עוד</span>
            </Button>
          }
        >
          <MenuItem onSelect={() => onSelectView('status')}>
            <KanbanSquare className="h-5 w-5" />
            לפי מצב העבודה
          </MenuItem>
          {can('activity.view') && (
            <MenuItem onSelect={() => onSelectView('overview')}>
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
          <MenuSeparator />
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
        </Menu>
      </div>
    </header>
  );
};

/** A quiet strip naming the secondary view someone landed on, with a way back. */
export function SecondaryViewNote({ view, onBack }: { view: ViewName; onBack: () => void }) {
  const label = view === 'status' ? 'לפי מצב העבודה' : 'תמונת מצב במספרים';
  return (
    <div className="flex items-center gap-2 border-b border-line bg-canvas px-4 py-2 sm:px-6">
      <Tooltip label="חזרה ללוח השנה">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowRight className="h-4.5 w-4.5" />
          חזרה
        </Button>
      </Tooltip>
      <span className="text-md font-bold text-ink">{label}</span>
    </div>
  );
}
