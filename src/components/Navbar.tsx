import React from 'react';
import {
  Calendar,
  GanttChartSquare,
  KanbanSquare,
  ListTodo,
  BarChart3,
  Plus,
  Users,
  Search,
  SlidersHorizontal,
  Download,
  Sparkles,
  X,
  Loader2
} from 'lucide-react';
import { ViewMode, GanttBoard, UserAccess, FilterState } from '../types';
import { avatarColor } from '../utils/eventMeta';
import type { Can } from '../hooks/useCan';
import { SearchBox } from './SearchBox';
import {
  Button,
  Badge,
  Input,
  Select,
  Field,
  Menu,
  MenuItem,
  MenuSeparator,
  Popover,
  Tooltip,
  cn
} from './ui';

interface NavbarProps {
  activeBoard: GanttBoard;
  viewMode: ViewMode;
  onSelectViewMode: (mode: ViewMode) => void;
  currentUser: UserAccess;
  onOpenPermissions: () => void;
  onOpenAddEvent: () => void;
  onOpenExport: () => void;
  onOpenAIAssistant?: () => void;
  filterState: FilterState;
  onUpdateFilter: (filter: Partial<FilterState>) => void;
  can: Can;
  isFetching?: boolean;
  boardId: string;
  onOpenEvent: (eventId: string) => void;
}

const VIEWS: { id: ViewMode; label: string; icon: React.ElementType }[] = [
  { id: 'calendar', label: 'לוח שנה', icon: Calendar },
  { id: 'gantt', label: 'גאנט', icon: GanttChartSquare },
  { id: 'kanban', label: 'לפי סטטוס', icon: KanbanSquare },
  { id: 'list', label: 'רשימה', icon: ListTodo },
  { id: 'analytics', label: 'תמונת מצב', icon: BarChart3 }
];

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'all', label: 'כל הקטגוריות' },
  { value: 'holiday', label: 'חג ומועד' },
  { value: 'campaign', label: 'קמפיין' },
  { value: 'b2b', label: 'ועדים וארגונים' },
  { value: 'social', label: 'סושיאל' },
  { value: 'operational', label: 'תפעול' },
  { value: 'other', label: 'אחר' }
];

const STATUSES: { value: string; label: string }[] = [
  { value: 'all', label: 'כל הסטטוסים' },
  { value: 'todo', label: 'עוד לא התחיל' },
  { value: 'in_progress', label: 'בתהליך' },
  { value: 'ready_kickoff', label: 'מוכן לתאריך התנעה' },
  { value: 'done', label: 'הושלם' }
];

const YEARS = ['all', '2026', '2027', '2028'];

export const Navbar: React.FC<NavbarProps> = ({
  activeBoard,
  viewMode,
  onSelectViewMode,
  currentUser,
  onOpenPermissions,
  onOpenAddEvent,
  onOpenExport,
  onOpenAIAssistant,
  filterState,
  onUpdateFilter,
  can,
  isFetching,
  boardId,
  onOpenEvent
}) => {


  const activeFilterCount = [
    filterState.category !== 'all',
    filterState.status !== 'all',
    filterState.year !== 'all',
    !filterState.showKickoffs,
    !filterState.showActuals
  ].filter(Boolean).length;

  const clearFilters = () =>
    onUpdateFilter({
      category: 'all',
      status: 'all',
      year: 'all',
      showKickoffs: true,
      showActuals: true
    });

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      {/* --- primary bar --- */}
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-lg font-bold tracking-tight text-ink">{activeBoard.name}</h1>
          <p className="flex items-center gap-1.5 truncate text-xs text-ink-tertiary">
            <span>{activeBoard.eventCount} אירועים</span>
            {isFetching && (
              <span className="flex items-center gap-1 text-primary">
                <Loader2 className="h-4 w-4 animate-spin" />
                מסנכרן
              </span>
            )}
          </p>
        </div>

        <div className="flex-1" />

        <SearchBox boardId={boardId} onOpenEvent={onOpenEvent} />

        {/* filters */}
        <Popover
          className="w-72"
          trigger={
            <Button variant={activeFilterCount ? 'secondary' : 'ghost'} size="sm">
              <SlidersHorizontal className="h-4.5 w-4.5" />
              <span className="hidden md:inline">סינון</span>
              {activeFilterCount > 0 && (
                <Badge tone="primary" className="tnum">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          }
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink">מה להציג</span>
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-6 px-1.5">
                  <X className="h-4 w-4" />
                  ניקוי
                </Button>
              )}
            </div>

            <Field label="קטגוריה" htmlFor="f-cat">
              <Select
                id="f-cat"
                value={filterState.category}
                onChange={(e) => onUpdateFilter({ category: e.target.value })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="מצב משימות" htmlFor="f-status">
              <Select
                id="f-status"
                value={filterState.status}
                onChange={(e) => onUpdateFilter({ status: e.target.value })}
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="שנה" htmlFor="f-year">
              <Select
                id="f-year"
                value={filterState.year}
                onChange={(e) => onUpdateFilter({ year: e.target.value })}
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y === 'all' ? 'כל השנים' : y}
                  </option>
                ))}
              </Select>
            </Field>

            <fieldset className="flex flex-col gap-1.5 border-t border-line pt-2.5">
              <legend className="sr-only">הצג תאריכים בלוח השנה</legend>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-secondary">
                <input
                  type="checkbox"
                  checked={filterState.showKickoffs}
                  onChange={(e) => onUpdateFilter({ showKickoffs: e.target.checked })}
                  className="h-4.5 w-4.5 accent-primary"
                />
                תאריכי תאריך התנעה
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-secondary">
                <input
                  type="checkbox"
                  checked={filterState.showActuals}
                  onChange={(e) => onUpdateFilter({ showActuals: e.target.checked })}
                  className="h-4.5 w-4.5 accent-primary"
                />
                תאריכי אמת
              </label>
            </fieldset>
          </div>
        </Popover>

        <span className="hidden h-4 w-px bg-line sm:block" aria-hidden="true" />

        {onOpenAIAssistant && (
          <Tooltip label="הצעות למשימות">
            <Button variant="secondary" iconOnly onClick={onOpenAIAssistant} aria-label="הצעות למשימות">
              <Sparkles className="h-5 w-5" />
            </Button>
          </Tooltip>
        )}

        {can('export.run') && (
          <Tooltip label="הורדה והדפסה">
            <Button variant="secondary" iconOnly onClick={onOpenExport} aria-label="הורדה והדפסה">
              <Download className="h-5 w-5" />
            </Button>
          </Tooltip>
        )}

        {can('event.create') && (
          <Button variant="primary" onClick={onOpenAddEvent} aria-label="אירוע חדש">
            <Plus className="h-5 w-5" />
            <span className="hidden sm:inline">אירוע</span>
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
          {can('people.manage') && (
            <MenuItem onSelect={onOpenPermissions}>
              <Users className="h-5 w-5" />
              אנשים וגישה
            </MenuItem>
          )}
        </Menu>
      </div>

      {/* --- view tabs --- */}
      <nav className="flex items-center gap-1 px-3 sm:px-5" aria-label="בחר תצוגה">
        {VIEWS.map((v) => {
          const Icon = v.icon;
          const active = viewMode === v.id;
          return (
            <button
              key={v.id}
              onClick={() => onSelectViewMode(v.id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex items-center gap-2 rounded-t-md px-3 py-2.5 text-base font-semibold transition-colors',
                active ? 'text-primary' : 'text-ink-tertiary hover:bg-subtle hover:text-ink-secondary'
              )}
            >
              <Icon className="h-5 w-5" />
              {v.label}
              {active && <span className="absolute inset-x-1 -bottom-px h-[3px] rounded-t-full bg-primary" />}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
