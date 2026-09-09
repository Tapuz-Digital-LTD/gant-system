import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, PlugZap, SearchX } from 'lucide-react';
import { EventItem, FilterState, UserAccess } from './types';
import {
  useBoards,
  useUsers,
  useEvents,
  useEventMutations,
  useBoardMutations,
  useMyTasks,
  useMyTaskMutations,
  describeError
} from './hooks/useBoardData';
import { useRoute, navigate } from './hooks/useRoute';
import { Period, addDays, monthKey, periodRange, timelineRange, todayISO } from './utils/period';
import { ViewName, boardRoute, buildRoute, forgetPlace, rememberPlace } from './utils/routes';
import { HomeScreen } from './components/HomeScreen';
import { MyTasksView } from './components/MyTasksView';
import { BoardHub } from './components/BoardHub';
import { BoardHeader, SecondaryViewNote } from './components/BoardHeader';
import { PeriodBar } from './components/PeriodBar';
import { CalendarView } from './components/CalendarView';
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

/**
 * The address bar decides what is on screen.
 *
 * There is no view state here that a refresh could lose and no board selection
 * the back button could contradict: which board, which view, which period and
 * which event is open all come from the URL. What is left in component state
 * is the things that genuinely are not places — an open settings dialog, the
 * filters, a half-typed search.
 */

/** Views that are about the whole board rather than one period. */
const WHOLE_BOARD: ViewName[] = ['list', 'status', 'overview'];

export default function App() {
  const { notify } = useToast();
  const qc = useQueryClient();
  const { route, url, go } = useRoute();

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
  // Loaded on the home screen too: its first card is the count of open work.
  const myTasksQuery = useMyTasks(Boolean(me) && (route.myTasks || !route.boardId));
  const myTaskMutations = useMyTaskMutations();

  const [filterState, setFilterState] = useState<FilterState>({
    search: '',
    category: 'all',
    status: 'all',
    assignee: 'all',
    hiddenMilestones: []
  });

  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
  const [isManageBoardsOpen, setIsManageBoardsOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState<{ date?: string; monthKey?: string }>({});

  const boards = boardsQuery.data ?? [];
  const board = boards.find((b) => b.id === route.boardId);

  /**
   * What to ask the server for. A period view asks for what it draws; the list,
   * the status board and the numbers are about the board as a whole.
   *
   * ponytail: the whole board is one query because a board holds tens of events.
   * If one ever holds thousands, this is where paging goes.
   */
  const range = useMemo(() => {
    if (route.view === 'calendar') return periodRange(route.period);
    if (route.view === 'timeline') return timelineRange(route.period);
    return { from: '1900-01-01', to: '2999-12-31' };
  }, [route.view, route.period]);

  const eventsQuery = useEvents(board?.id, range.from, range.to);
  const events = eventsQuery.data ?? [];
  const users: UserAccess[] = usersQuery.data ?? [];

  const m = useEventMutations(board?.id, range.from, range.to);
  const boardMutations = useBoardMutations();

  // Remember where this person was, so tomorrow morning is one click.
  useEffect(() => {
    if (board && route.view) {
      rememberPlace({ url, boardId: board.id, boardName: board.name, view: route.view });
    }
  }, [url, board, route.view]);

  /** What the home screen puts in front of somebody before anything else. */
  const myWork = useMemo(() => {
    if (!myTasksQuery.data) return null;
    const today = todayISO();
    const open = myTasksQuery.data.filter((t) => t.status !== 'done');
    return {
      open: open.length,
      late: open.filter((t) => t.dueDate && t.dueDate < today).length,
      soon: open.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= addDays(today, 7)).length
    };
  }, [myTasksQuery.data]);

  const detailEvent = events.find((e) => e.id === route.eventId) ?? null;

  // A link may point at an event outside the loaded window; fetch it rather
  // than showing an empty panel.
  useEffect(() => {
    if (!route.eventId || detailEvent || !board) return;
    let cancelled = false;
    api.events
      .get(route.eventId)
      .then((found) => {
        if (cancelled || !found) return;
        qc.setQueryData(['events', board.id, range.from, range.to], (prev: EventItem[] | undefined) =>
          prev?.some((e) => e.id === found.id) ? prev : [...(prev ?? []), found]
        );
      })
      .catch(() => {
        if (!cancelled) notify('error', 'לא מצאנו את האירוע הזה. ייתכן שהוא נמחק');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.eventId, detailEvent, board?.id, range.from, range.to]);

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

  const can = makeCan(me ? currentUser : null);

  const signOut = async () => {
    await authClient.signOut({});
    forgetPlace();
    qc.clear();
    navigate('/');
    await meQuery.refetch();
  };

  const setPeriod = (period: Period) => go({ period }, { replace: true });
  const openEvent = (eventId: string) => go({ eventId });
  const closeEvent = () => go({ eventId: null });
  const openAddEvent = (date?: string, month?: string) => {
    // Opened from the toolbar, the form should start in the month on screen —
    // not in today's, which is somewhere else entirely once you have navigated.
    setQuickAdd({ date, monthKey: month ?? monthKey(route.period.anchor) });
    go({ creating: true });
  };
  const closeAddEvent = () => {
    setQuickAdd({});
    go({ creating: false });
  };

  // ---------------------------------------------------------------- gates

  if (meQuery.isLoading) return <FullScreenSpinner />;

  if (!me) {
    if (!authConfigQuery.data) return <FullScreenSpinner />;
    return (
      <SignIn
        config={authConfigQuery.data}
        onSignedIn={() => {
          void qc.invalidateQueries({ queryKey: [] });
        }}
      />
    );
  }

  if (boardsQuery.isLoading) return <FullScreenSpinner label="טוען את הלוחות שלך…" />;

  if (boardsQuery.isError) {
    return (
      <CenteredMessage
        icon={<PlugZap className="h-7 w-7 text-late" />}
        title="לא הצלחנו להתחבר"
        detail={describeError(boardsQuery.error)}
        action={
          <Button variant="primary" onClick={() => boardsQuery.refetch()}>
            נסה שוב
          </Button>
        }
      />
    );
  }

  const shared = {
    onOpenExport: () => setIsExportOpen(true),
    onOpenArchive: () => setIsArchiveOpen(true),
    onOpenPeople: () => setIsPermissionsOpen(true),
    onManageBoards: () => setIsManageBoardsOpen(true),
    onDuplicateBoard: async () => {
      if (!board) return;
      const copy = await run(boardMutations.duplicate.mutateAsync({ id: board.id }), 'הלוח שוכפל');
      if (copy) navigate(boardRoute(copy.id));
    }
  };

  const dialogs = (
    <>
      {isPermissionsOpen && (
        <UserPermissionsModal
          isOpen
          onClose={() => setIsPermissionsOpen(false)}
          boards={boards}
          currentUser={currentUser}
        />
      )}

      {isManageBoardsOpen && (
        <BoardManagementModal
          isOpen
          onClose={() => setIsManageBoardsOpen(false)}
          boards={boards}
          activeBoardId={board?.id ?? boards[0]?.id ?? ''}
          currentUser={currentUser}
          onSelectBoard={(id) => navigate(boardRoute(id))}
          onCreateBoard={(input) => run(boardMutations.create.mutateAsync(input), 'הלוח נוצר')}
          onRenameBoard={(id, name) => run(boardMutations.update.mutateAsync({ id, name }), 'השם עודכן')}
          onDeleteBoard={(id) => run(boardMutations.archive.mutateAsync(id), 'הלוח עבר לארכיון')}
        />
      )}

      {isExportOpen && board && (
        <ExportModal isOpen onClose={() => setIsExportOpen(false)} board={board} events={events} />
      )}

      {isArchiveOpen && board && (
        <ArchiveModal
          isOpen
          onClose={() => setIsArchiveOpen(false)}
          boardId={board.id}
          canEdit={can('event.restore')}
          canPurge={can('event.purge')}
        />
      )}

      {isAssistantOpen && (
        <AIAssistantModal
          isOpen
          onClose={() => setIsAssistantOpen(false)}
          onAddGeneratedTasks={async (tasks) => {
            const target = detailEvent ?? events[0];
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

      {route.creating && board && (
        <AddEventModal
          isOpen
          onClose={closeAddEvent}
          onAddEvent={async (input) => {
            const created = await run(m.create.mutateAsync(input), 'האירוע נוצר');
            if (created) {
              closeAddEvent();
              go({ eventId: created.id, creating: false });
            }
          }}
          defaultDate={quickAdd.date}
          defaultMonthKey={quickAdd.monthKey}
          isSaving={m.create.isPending}
        />
      )}

      {detailEvent && (
        <EventDetailModal
          event={detailEvent}
          users={users}
          currentUser={currentUser}
          onClose={closeEvent}
          onUpdateEvent={(changes) =>
            run(m.update.mutateAsync({ id: detailEvent.id, version: detailEvent.version, changes }), 'נשמר')
          }
          onDeleteEvent={() =>
            run(m.archive.mutateAsync(detailEvent.id), 'האירוע עבר לארכיון. אפשר לשחזר אותו משם').then(
              closeEvent
            )
          }
          onCreateTask={(input) => run(m.createTask.mutateAsync({ eventId: detailEvent.id, input }))}
          onUpdateTask={(id, version, changes) => run(m.updateTask.mutateAsync({ id, version, changes }))}
          onDeleteTask={(id) => run(m.deleteTask.mutateAsync({ id, eventId: detailEvent.id }))}
          onCreateComment={(body) =>
            run(m.createComment.mutateAsync({ eventId: detailEvent.id, body }), 'התגובה נוספה')
          }
        />
      )}
    </>
  );

  // --------------------------------------------------------- my own work

  if (route.myTasks) {
    return (
      <>
        <MyTasksView
          tasks={myTasksQuery.data ?? []}
          isLoading={myTasksQuery.isLoading}
          onBackHome={() => navigate('/')}
          onOpenTask={(task) =>
            navigate(
              buildRoute({
                boardId: task.boardId,
                view: 'calendar',
                period: { mode: 'month', anchor: task.eventDate },
                eventId: task.eventId
              })
            )
          }
          onMove={(task, status) =>
            run(myTaskMutations.move.mutateAsync({ id: task.id, version: task.version, status }))
          }
        />
        {dialogs}
      </>
    );
  }

  // ------------------------------------------------------------ home screen

  if (!route.boardId) {
    return (
      <>
        <HomeScreen
          boards={boards}
          currentUser={currentUser}
          can={can}
          myWork={myWork}
          onOpenMyTasks={() => navigate('/my')}
          onOpen={(next) => navigate(next)}
          onCreateBoard={() => setIsManageBoardsOpen(true)}
          onOpenPeople={() => setIsPermissionsOpen(true)}
          onSignOut={signOut}
        />
        {dialogs}
      </>
    );
  }

  // A board that is gone, or was never this person's to see. Both look the same
  // on purpose: the existence of a board is not information a guest is owed.
  if (!board) {
    return (
      <CenteredMessage
        icon={<SearchX className="h-7 w-7 text-ink-tertiary" />}
        title="לא מצאנו את הלוח הזה"
        detail="ייתכן שהקישור ישן, או שהלוח לא משותף איתך."
        action={
          <Button
            variant="primary"
            onClick={() => {
              forgetPlace();
              navigate('/');
            }}
          >
            חזרה לכל הלוחות
          </Button>
        }
      />
    );
  }

  // --------------------------------------------------------------- the hub

  if (!route.view) {
    return (
      <>
        <BoardHub
          board={board}
          can={can}
          onOpen={(next) => navigate(next)}
          onBackHome={() => navigate('/')}
          onAddEvent={() => openAddEvent()}
          onOpenAssistant={() => setIsAssistantOpen(true)}
          {...shared}
        />
        {dialogs}
      </>
    );
  }

  // ------------------------------------------------------------- the views

  const isPeriodView = !WHOLE_BOARD.includes(route.view);
  const emptyFilters =
    !filterState.search && filterState.category === 'all' && filterState.status === 'all';

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink" dir="rtl">
      <BoardHeader
        board={board}
        view={route.view}
        currentUser={currentUser}
        can={can}
        filterState={filterState}
        onUpdateFilter={(patch) => setFilterState((prev) => ({ ...prev, ...patch }))}
        onSelectView={(view) => go({ view })}
        onBackHome={() => navigate('/')}
        onBackToBoard={() => navigate(boardRoute(board.id))}
        onAddEvent={() => openAddEvent()}
        onOpenEvent={openEvent}
        onOpenAssistant={() => setIsAssistantOpen(true)}
        onOpenMyTasks={() => navigate('/my')}
        onSignOut={signOut}
        isFetching={eventsQuery.isFetching}
        {...shared}
      />

      {isPeriodView && (
        <PeriodBar
          period={route.period}
          onChange={setPeriod}
          variant={route.view === 'timeline' ? 'timeline' : 'calendar'}
          allowWeek={route.view === 'calendar'}
        />
      )}

      {(route.view === 'status' || route.view === 'overview') && (
        <SecondaryViewNote
          view={route.view}
          onBack={() => go({ view: 'calendar' })}
        />
      )}

      <main className="flex flex-1 flex-col">
        {eventsQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-24 text-ink-tertiary">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            <span className="text-base">טוען אירועים…</span>
          </div>
        ) : (
          <>
            {route.view === 'calendar' && (
              <CalendarView
                period={route.period}
                events={events}
                filterState={filterState}
                onOpenEventDetail={(e) => openEvent(e.id)}
                onQuickAddOnDate={(date, monthKey) => openAddEvent(date, monthKey)}
                can={can}
              />
            )}

            {route.view === 'timeline' && (
              <GanttTimelineView
                period={route.period}
                events={events}
                filterState={filterState}
                onOpenEventDetail={(e) => openEvent(e.id)}
                onAdd={() => openAddEvent()}
                can={can}
              />
            )}

            {route.view === 'status' && (
              <KanbanBoardView
                events={events}
                filterState={filterState}
                hasFilters={!emptyFilters}
                onOpenEventDetail={(e) => openEvent(e.id)}
                onOpenAddEvent={() => openAddEvent()}
                onMoveEvent={(ev, status) =>
                  run(m.update.mutateAsync({ id: ev.id, version: ev.version, changes: { status } }))
                }
                can={can}
              />
            )}

            {route.view === 'list' && (
              <ListView
                events={events}
                users={users}
                filterState={filterState}
                hasFilters={!emptyFilters}
                onOpenEventDetail={(e) => openEvent(e.id)}
                onToggleTaskStatus={(task) =>
                  run(
                    m.updateTask.mutateAsync({
                      id: task.id,
                      version: task.version,
                      changes: { status: task.status === 'done' ? 'todo' : 'done' }
                    })
                  )
                }
                onOpenAddEvent={() => openAddEvent()}
                can={can}
              />
            )}

            {route.view === 'overview' &&
              (can('activity.view') ? (
                <AnalyticsView events={events} users={users} boardName={board.name} />
              ) : (
                <NoPermission
                  title="אין לך גישה לתמונת המצב"
                  detail="בקש ממנהל המערכת להוסיף לך את ההרשאה לצפייה בנתונים."
                />
              ))}
          </>
        )}
      </main>

      {dialogs}
    </div>
  );
}

function FullScreenSpinner({ label }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas" dir="rtl">
      <div className="flex flex-col items-center gap-3 text-ink-tertiary">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        {label && <span className="text-base">{label}</span>}
      </div>
    </div>
  );
}

function CenteredMessage({
  icon,
  title,
  detail,
  action
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  action: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-6" dir="rtl">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        {icon}
        <h1 className="text-lg font-bold text-ink">{title}</h1>
        <p className="text-base text-ink-secondary">{detail}</p>
        {action}
      </div>
    </div>
  );
}
