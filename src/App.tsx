import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, PlugZap } from 'lucide-react';
import { EventItem, UserAccess, ViewMode, FilterState } from './types';
import { MONTHS_LIST } from './data/months';
import { currentMonthKey } from './utils/eventMeta';
import {
  useBoards,
  useUsers,
  useEvents,
  useEventMutations,
  useBoardMutations,
  describeError
} from './hooks/useBoardData';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { MonthSelector } from './components/MonthSelector';
import { MonthlyCalendarView } from './components/MonthlyCalendarView';
import { GanttTimelineView } from './components/GanttTimelineView';
import { KanbanBoardView } from './components/KanbanBoardView';
import { ListView } from './components/ListView';
import { AnalyticsView } from './components/AnalyticsView';
import { EventDetailModal } from './components/EventDetailModal';
import { AddEventModal } from './components/AddEventModal';
import { UserPermissionsModal } from './components/UserPermissionsModal';
import { BoardManagementModal } from './components/BoardManagementModal';
import { ExportModal } from './components/ExportModal';
import { AIAssistantModal } from './components/AIAssistantModal';
import { ArchiveModal } from './components/ArchiveModal';
import { SignIn } from './components/SignIn';
import { fetchAuthConfig, fetchMe, authClient } from './services/auth';
import { Button, useToast } from './components/ui';
import { makeCan } from './hooks/useCan';
import { NoPermission } from './components/NoPermission';
import { api } from './services/api';

/** Last calendar day of a YYYY-MM bucket. */
function endOfMonth(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return `${monthKey}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

const VIEWS_NEEDING_FULL_RANGE: ViewMode[] = ['gantt', 'analytics'];

export default function App() {
  const { notify } = useToast();
  const qc = useQueryClient();

  // Identity first: everything below is meaningless without a session.
  const meQuery = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false, staleTime: 60_000 });
  const authConfigQuery = useQuery({
    queryKey: ['auth-config'],
    queryFn: fetchAuthConfig,
    retry: false,
    enabled: meQuery.isFetched && !meQuery.data
  });
  const me = meQuery.data ?? null;

  const boardsQuery = useBoards(Boolean(me));
  const usersQuery = useUsers();

  const [activeBoardId, setActiveBoardId] = useState<string>();
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [showAllMonths, setShowAllMonths] = useState(false);
  const [filterState, setFilterState] = useState<FilterState>({
    search: '',
    category: 'all',
    status: 'all',
    assignee: 'all',
    showKickoffs: true,
    showActuals: true,
    year: 'all'
  });

  const filteredMonths = useMemo(
    () => MONTHS_LIST.filter((m) => filterState.year === 'all' || String(m.year) === filterState.year),
    [filterState.year]
  );

  // Land on the month the user is actually in, not on the first month of the range.
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(() => {
    const i = MONTHS_LIST.findIndex((m) => m.key === currentMonthKey());
    return i >= 0 ? i : 0;
  });

  const boards = boardsQuery.data ?? [];
  const activeBoard = boards.find((b) => b.id === activeBoardId) ?? boards[0];

  useEffect(() => {
    if (!activeBoardId && boards.length) setActiveBoardId(boards[0].id);
  }, [boards, activeBoardId]);

  const visibleMonths = useMemo(() => {
    if (showAllMonths) return filteredMonths;
    const m = filteredMonths[Math.min(selectedMonthIndex, filteredMonths.length - 1)];
    return m ? [m] : filteredMonths.slice(0, 1);
  }, [filteredMonths, selectedMonthIndex, showAllMonths]);

  /**
   * The window actually requested from the server. Views that draw the whole
   * plan ask for the full range; the calendar asks only for what it shows.
   */
  const range = useMemo(() => {
    const months = VIEWS_NEEDING_FULL_RANGE.includes(viewMode) ? filteredMonths : visibleMonths;
    const first = months[0] ?? MONTHS_LIST[0];
    const last = months[months.length - 1] ?? MONTHS_LIST[MONTHS_LIST.length - 1];
    return { from: `${first.key}-01`, to: endOfMonth(last.key) };
  }, [viewMode, filteredMonths, visibleMonths]);

  const eventsQuery = useEvents(activeBoard?.id, range.from, range.to);
  const events = eventsQuery.data ?? [];
  const users: UserAccess[] = usersQuery.data ?? [];

  const m = useEventMutations(activeBoard?.id, range.from, range.to);
  const boardMutations = useBoardMutations();

  const [detailId, setDetailId] = useState<string | null>(null);
  const [isAddEventOpen, setIsAddEventOpen] = useState(false);
  const [quickAddDate, setQuickAddDate] = useState<string>();
  const [quickAddMonthKey, setQuickAddMonthKey] = useState<string>();
  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
  const [isManageBoardsOpen, setIsManageBoardsOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isGlobalAiOpen, setIsGlobalAiOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);

  // The modal reads from the cache, so a save is reflected without a refetch.
  const detailEvent = events.find((e) => e.id === detailId) ?? null;

  const run = async <T,>(work: Promise<T>, okMessage?: string): Promise<T | undefined> => {
    try {
      const result = await work;
      if (okMessage) notify('success', okMessage);
      return result;
    } catch (error) {
      notify('error', describeError(error));
      return undefined;
    }
  };

  const currentUser: UserAccess = me
    ? { id: me.id, email: me.email, name: me.name, role: me.role, isOwner: me.isOwner, permissions: me.permissions }
    : { id: '', email: '', name: '', role: 'viewer' };

  const can = makeCan(me ? { id: me.id, email: me.email, name: me.name, role: me.role, isOwner: me.isOwner, permissions: me.permissions } : null);

  if (meQuery.isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas" dir="rtl">
        <Loader2 className="h-6 w-6 animate-spin text-ink-tertiary" />
      </div>
    );
  }

  if (!me) {
    if (!authConfigQuery.data) {
      return (
        <div className="grid min-h-dvh place-items-center bg-canvas" dir="rtl">
          <Loader2 className="h-6 w-6 animate-spin text-ink-tertiary" />
        </div>
      );
    }
    return (
      <SignIn
        config={authConfigQuery.data}
        onSignedIn={() => { void qc.invalidateQueries({ queryKey: [] }); }}
      />
    );
  }

  if (boardsQuery.isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas" dir="rtl">
        <div className="flex flex-col items-center gap-3 text-ink-tertiary">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-base">טוען בחר לוח…</span>
        </div>
      </div>
    );
  }

  if (boardsQuery.isError) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas p-6" dir="rtl">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <PlugZap className="h-7 w-7 text-late" />
          <h1 className="text-lg font-bold text-ink">לא הצלחנו להתחבר</h1>
          <p className="text-base text-ink-secondary">{describeError(boardsQuery.error)}</p>
          <Button variant="primary" onClick={() => boardsQuery.refetch()}>
            ניסיון חוזר
          </Button>
        </div>
      </div>
    );
  }

  if (!activeBoard) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas p-6" dir="rtl">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <h1 className="text-lg font-bold text-ink">עוד אין בחר לוח</h1>
          <p className="text-base text-ink-secondary">צור לוח ראשון כדי להתחיל</p>
          <Button
            variant="primary"
            onClick={() => run(boardMutations.create.mutateAsync({ name: 'לוח חדש' }), 'הלוח נוצר')}
          >
            יצירת לוח
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh bg-canvas text-ink" dir="rtl">
      <Sidebar
        boards={boards}
        activeBoardId={activeBoard.id}
        currentUser={currentUser}
        onSelectBoard={setActiveBoardId}
        onDuplicateBoard={async () => {
          const copy = await run(
            boardMutations.duplicate.mutateAsync({ id: activeBoard.id }),
            'הלוח שוכפל'
          );
          if (copy) setActiveBoardId(copy.id);
        }}
        onOpenCreateBoard={() => setIsManageBoardsOpen(true)}
        onOpenManageBoards={() => setIsManageBoardsOpen(true)}
        can={can}
        onOpenPermissions={() => setIsPermissionsOpen(true)}
        onOpenArchive={() => setIsArchiveOpen(true)}
        onSignOut={async () => {
          await authClient.signOut({});
          qc.clear();
          await meQuery.refetch();
        }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar
          activeBoard={activeBoard}
          viewMode={viewMode}
          onSelectViewMode={setViewMode}
          currentUser={currentUser}
          can={can}
          onOpenPermissions={() => setIsPermissionsOpen(true)}
          onOpenAddEvent={() => {
            setQuickAddDate(undefined);
            setQuickAddMonthKey(undefined);
            setIsAddEventOpen(true);
          }}
          onOpenExport={() => setIsExportOpen(true)}
          onOpenAIAssistant={() => setIsGlobalAiOpen(true)}
          filterState={filterState}
          onUpdateFilter={(upd) => setFilterState((prev) => ({ ...prev, ...upd }))}
          isFetching={eventsQuery.isFetching}
          boardId={activeBoard.id}
          onOpenEvent={async (eventId) => {
            // A hit may be outside the loaded window, so fetch it before opening.
            if (!events.some((e) => e.id === eventId)) {
              const found = await run(api.events.get(eventId));
              if (found) qc.setQueryData(['events', activeBoard.id, range.from, range.to],
                (prev: EventItem[] | undefined) => [...(prev ?? []), found]);
            }
            setDetailId(eventId);
          }}
        />

        <main className="flex flex-1 flex-col">
          {viewMode !== 'analytics' && (
            <MonthSelector
              months={filteredMonths}
              selectedMonthIndex={selectedMonthIndex}
              showAllMonths={showAllMonths}
              onSelectMonth={(i) => {
                setSelectedMonthIndex(i);
                setShowAllMonths(false);
              }}
              onToggleShowAll={() => setShowAllMonths((v) => !v)}
              onPrevMonth={() => setSelectedMonthIndex((i) => Math.max(0, i - 1))}
              onNextMonth={() =>
                setSelectedMonthIndex((i) => Math.min(filteredMonths.length - 1, i + 1))
              }
            />
          )}

          <div className="flex-1">
            {eventsQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-24 text-ink-tertiary">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-base">טוען אירועים…</span>
              </div>
            ) : (
              <>
                {viewMode === 'calendar' && (
                  <MonthlyCalendarView
                    months={visibleMonths}
                    events={events}
                    filterState={filterState}
                    onOpenEventDetail={(e: EventItem) => setDetailId(e.id)}
                    onQuickAddOnDate={(dateStr, monthKey) => {
                      setQuickAddDate(dateStr);
                      setQuickAddMonthKey(monthKey);
                      setIsAddEventOpen(true);
                    }}
                    can={can}
                  />
                )}

                {viewMode === 'gantt' && (
                  <GanttTimelineView
                    months={filteredMonths}
                    events={events}
                    filterState={filterState}
                    onOpenEventDetail={(e: EventItem) => setDetailId(e.id)}
                    can={can}
                  />
                )}

                {viewMode === 'kanban' && (
                  <KanbanBoardView
                    events={events}
                    filterState={filterState}
                    onOpenEventDetail={(e: EventItem) => setDetailId(e.id)}
                    onOpenAddEvent={() => setIsAddEventOpen(true)}
                    onMoveEvent={(ev, status) =>
                      run(
                        m.update.mutateAsync({ id: ev.id, version: ev.version, changes: { status } })
                      )
                    }
                    can={can}
                  />
                )}

                {viewMode === 'list' && (
                  <ListView
                    events={events}
                    users={users}
                    filterState={filterState}
                    onOpenEventDetail={(e: EventItem) => setDetailId(e.id)}
                    onToggleTaskStatus={(task) =>
                      run(
                        m.updateTask.mutateAsync({
                          id: task.id,
                          version: task.version,
                          changes: { status: task.status === 'done' ? 'todo' : 'done' }
                        })
                      )
                    }
                    onOpenAddEvent={() => setIsAddEventOpen(true)}
                    can={can}
                  />
                )}

                {viewMode === 'analytics' && (
                  can('activity.view') ? (
                    <AnalyticsView events={events} months={filteredMonths} users={users} boardName={activeBoard.name} />
                  ) : (
                    <NoPermission
                      title="אין לך גישה לתמונת המצב"
                      detail="בקש ממנהל המערכת להוסיף לך את ההרשאה לצפייה בנתונים."
                    />
                  )
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {detailEvent && (
        <EventDetailModal
          event={detailEvent}
          users={users}
          currentUser={currentUser}
          onClose={() => setDetailId(null)}
          onUpdateEvent={(changes) =>
            run(
              m.update.mutateAsync({ id: detailEvent.id, version: detailEvent.version, changes }),
              'נשמר'
            )
          }
          onDeleteEvent={() =>
            run(m.archive.mutateAsync(detailEvent.id), 'האירוע עבר לארכיון. אפשר לשחזר אותו משם').then(() =>
              setDetailId(null)
            )
          }
          onCreateTask={(input) =>
            run(m.createTask.mutateAsync({ eventId: detailEvent.id, input }))
          }
          onUpdateTask={(id, version, changes) => run(m.updateTask.mutateAsync({ id, version, changes }))}
          onDeleteTask={(id) => run(m.deleteTask.mutateAsync({ id, eventId: detailEvent.id }))}
          onCreateComment={(body) =>
            run(m.createComment.mutateAsync({ eventId: detailEvent.id, body }), 'התגובה נוספה')
          }
        />
      )}

      {isAddEventOpen && (
        <AddEventModal
          isOpen={isAddEventOpen}
          onClose={() => {
            setIsAddEventOpen(false);
            setQuickAddDate(undefined);
            setQuickAddMonthKey(undefined);
          }}
          onAddEvent={async (input) => {
            const created = await run(m.create.mutateAsync(input), 'האירוע נוצר');
            if (created) setIsAddEventOpen(false);
          }}
          months={MONTHS_LIST}
          defaultDate={quickAddDate}
          defaultMonthKey={quickAddMonthKey}
          isSaving={m.create.isPending}
        />
      )}

      {isPermissionsOpen && (
        <UserPermissionsModal
          isOpen={isPermissionsOpen}
          onClose={() => setIsPermissionsOpen(false)}
          boards={boards}
          currentUser={currentUser}
        />
      )}

      {isManageBoardsOpen && (
        <BoardManagementModal
          isOpen={isManageBoardsOpen}
          onClose={() => setIsManageBoardsOpen(false)}
          boards={boards}
          activeBoardId={activeBoard.id}
          currentUser={currentUser}
          onSelectBoard={setActiveBoardId}
          onCreateBoard={(input) => run(boardMutations.create.mutateAsync(input), 'הלוח נוצר')}
          onRenameBoard={(id, name) => run(boardMutations.update.mutateAsync({ id, name }), 'השם עודכן')}
          onDeleteBoard={(id) => run(boardMutations.archive.mutateAsync(id), 'הלוח עבר לארכיון')}
        />
      )}

      {isExportOpen && (
        <ExportModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          board={activeBoard}
          events={events}
        />
      )}

      {isArchiveOpen && (
        <ArchiveModal
          isOpen={isArchiveOpen}
          onClose={() => setIsArchiveOpen(false)}
          boardId={activeBoard.id}
          canEdit={can('event.restore')}
        />
      )}

      {isGlobalAiOpen && (
        <AIAssistantModal
          isOpen={isGlobalAiOpen}
          onClose={() => setIsGlobalAiOpen(false)}
          onAddGeneratedTasks={async (tasks) => {
            const target = events[0];
            if (!target) {
              notify('error', 'כדי להוסיף משימות, צור קודם אירוע');
              return;
            }
            for (const input of tasks) {
              await run(m.createTask.mutateAsync({ eventId: target.id, input }));
            }
          }}
        />
      )}
    </div>
  );
}
