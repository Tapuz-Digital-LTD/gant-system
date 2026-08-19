import React, { useState } from 'react';
import {
  Plus,
  Copy,
  Settings2,
  Users,
  PanelRightClose,
  PanelRightOpen,
  MoreHorizontal,
  LayoutGrid,
  Archive,
  LogOut
} from 'lucide-react';
import { GanttBoard, UserAccess } from '../types';
import { Button, Menu, MenuItem, MenuSeparator, Tooltip, cn } from './ui';
import type { Can } from '../hooks/useCan';

interface SidebarProps {
  boards: GanttBoard[];
  activeBoardId: string;
  currentUser: UserAccess;
  onSelectBoard: (id: string) => void;
  onDuplicateBoard: (id: string) => void;
  onOpenCreateBoard: () => void;
  onOpenManageBoards: () => void;
  onOpenPermissions: () => void;
  onOpenArchive: () => void;
  can: Can;
  onSignOut: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  boards,
  activeBoardId,
  currentUser,
  onSelectBoard,
  onDuplicateBoard,
  onOpenCreateBoard,
  onOpenManageBoards,
  onOpenPermissions,
  onOpenArchive,
  can,
  onSignOut
}) => {
  const [collapsed, setCollapsed] = useState(false);


  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col border-e border-line bg-surface transition-[width] md:flex',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* brand */}
      <div className="flex h-14 items-center gap-2.5 px-3">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-sm font-extrabold text-white"
          aria-hidden="true"
        >
          X
        </span>
        {!collapsed && (
          <span className="truncate text-md font-bold tracking-tight text-ink">תכנון אירועים</span>
        )}
      </div>

      {/* boards */}
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 py-2" aria-label="בחר לוח">
        {!collapsed && (
          <div className="flex items-center justify-between px-2 pb-1 pt-2">
            <span className="text-xs font-semibold text-ink-tertiary">בחר לוח</span>
            {can('board.create') && (
              <Tooltip label="לוח חדש">
                <button
                  onClick={onOpenCreateBoard}
                  aria-label="לוח חדש"
                  className="grid h-6 w-6 place-items-center rounded-md text-ink-tertiary hover:bg-subtle hover:text-ink"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </Tooltip>
            )}
          </div>
        )}

        {boards.map((b) => {
          const active = b.id === activeBoardId;
          const item = (
            <button
              key={b.id}
              onClick={() => onSelectBoard(b.id)}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'group flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-start transition-colors',
                active ? 'bg-primary-soft text-primary' : 'text-ink-secondary hover:bg-subtle hover:text-ink',
                collapsed && 'justify-center px-0'
              )}
            >
              <LayoutGrid className={cn('h-5 w-5 shrink-0', active ? 'text-primary' : 'text-ink-tertiary')} />
              {!collapsed && (
                <>
                  <span className={cn('min-w-0 flex-1 truncate text-base', active && 'font-semibold')}>
                    {b.name}
                  </span>
                  <span className="shrink-0 text-xs text-ink-tertiary tnum">{b.eventCount}</span>
                </>
              )}
            </button>
          );

          return collapsed ? (
            <Tooltip key={b.id} label={b.name}>
              {item}
            </Tooltip>
          ) : (
            item
          );
        })}
      </nav>

      {/* footer actions */}
      <div className="flex flex-col gap-1 border-t border-line p-2">
        {!collapsed && (
          <Menu
            align="start"
            trigger={
              <button className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-start text-base text-ink-secondary transition-colors hover:bg-subtle hover:text-ink">
                <MoreHorizontal className="h-5 w-5 shrink-0 text-ink-tertiary" />
                <span className="truncate">אפשרויות לוח</span>
              </button>
            }
          >
            {can('board.duplicate') && (
              <MenuItem onSelect={() => onDuplicateBoard(activeBoardId)}>
                <Copy className="h-5 w-5" />
                שכפול הלוח
              </MenuItem>
            )}
            <MenuItem onSelect={onOpenManageBoards}>
              <Settings2 className="h-5 w-5" />
              ניהול בחר לוח
            </MenuItem>
            <MenuItem onSelect={onOpenArchive}>
              <Archive className="h-5 w-5" />
              ארכיון
            </MenuItem>
            {can('people.manage') && (
              <MenuItem onSelect={onOpenPermissions}>
                <Users className="h-5 w-5" />
                אנשים וגישה
              </MenuItem>
            )}
            <MenuSeparator />
            <MenuSeparator />
            <MenuItem onSelect={onSignOut}>
              <LogOut className="h-5 w-5" />
              יציאה
            </MenuItem>
          </Menu>
        )}

        <Button
          variant="ghost"
          size="sm"
          iconOnly={collapsed}
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'פתח את התפריט' : 'צמצם את התפריט'}
          className={cn(!collapsed && 'justify-start')}
        >
          {collapsed ? <PanelRightOpen className="h-5 w-5" /> : <PanelRightClose className="h-5 w-5" />}
          {!collapsed && <span className="text-ink-tertiary">צמצם</span>}
        </Button>
      </div>
    </aside>
  );
};
