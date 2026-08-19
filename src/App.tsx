import React, { useState, useEffect, useCallback } from 'react';
import {
  GanttBoard,
  EventItem,
  UserAccess,
  UserRole,
  ViewMode,
  FilterState,
  TaskItem
} from './types';
import {
  MONTHS_LIST,
  INITIAL_BOARDS,
  INITIAL_USERS
} from './data/initialData';
import { api } from './services/api';
import { Navbar } from './components/Navbar';
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

const STORAGE_BOARDS_KEY = 'xtra_gantt_boards_v3';
const STORAGE_USERS_KEY = 'xtra_gantt_users_v3';
const STORAGE_CURRENT_USER_KEY = 'xtra_gantt_current_user_v3';

// Clear legacy mock cache keys
try {
  localStorage.removeItem('xtra_gantt_boards_v2');
  localStorage.removeItem('xtra_gantt_users_v2');
  localStorage.removeItem('xtra_gantt_current_user_v2');
  localStorage.removeItem('xtra_gantt_boards_v1');
  localStorage.removeItem('xtra_gantt_users_v1');
} catch {
  // ignore
}

export default function App() {
  // Server state
  const [serverConnected, setServerConnected] = useState<boolean>(true);
  const [isLoadingInitial, setIsLoadingInitial] = useState<boolean>(true);

  // Load initial boards from localStorage or default
  const [boards, setBoards] = useState<GanttBoard[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_BOARDS_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to load boards from localStorage', e);
    }
    return INITIAL_BOARDS;
  });

  const [activeBoardId, setActiveBoardId] = useState<string>(() => {
    return boards[0]?.id || 'board-events-main';
  });

  // Load users from localStorage or default
  const [users, setUsers] = useState<UserAccess[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_USERS_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to load users from localStorage', e);
    }
    return INITIAL_USERS;
  });

  // Current active user
  const [currentUser, setCurrentUser] = useState<UserAccess>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_CURRENT_USER_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to load currentUser from localStorage', e);
    }
    return INITIAL_USERS[0];
  });

  // Navigation & View Mode State
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(0);
  const [showAllMonths, setShowAllMonths] = useState<boolean>(false);
  const [activeYearFilter, setActiveYearFilter] = useState<string>('all');

  // Filters
  const [filterState, setFilterState] = useState<FilterState>({
    search: '',
    category: 'all',
    status: 'all',
    assignee: 'all',
    showKickoffs: true,
    showActuals: true,
    year: 'all'
  });

  // Modals state
  const [selectedEventForDetail, setSelectedEventForDetail] = useState<EventItem | null>(null);
  const [isAddEventOpen, setIsAddEventOpen] = useState(false);
  const [quickAddDate, setQuickAddDate] = useState<string | undefined>(undefined);
  const [quickAddMonthKey, setQuickAddMonthKey] = useState<string | undefined>(undefined);
  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
  const [isManageBoardsOpen, setIsManageBoardsOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isGlobalAiOpen, setIsGlobalAiOpen] = useState(false);

  // Fetch initial data from Backend Server on mount
  useEffect(() => {
    let isMounted = true;
    const fetchServerData = async () => {
      try {
        const [serverBoards, serverUsers] = await Promise.all([
          api.boards.getAll(),
          api.users.getAll()
        ]);

        if (!isMounted) return;

        if (Array.isArray(serverBoards) && serverBoards.length > 0) {
          setBoards(serverBoards);
          if (!serverBoards.some((b) => b.id === activeBoardId)) {
            setActiveBoardId(serverBoards[0].id);
          }
        }
        if (Array.isArray(serverUsers) && serverUsers.length > 0) {
          setUsers(serverUsers);
          const matched = serverUsers.find((u) => u.email === currentUser.email) || serverUsers[0];
          setCurrentUser(matched);
        }
        setServerConnected(true);
      } catch (err) {
        console.warn('Backend server not responding, running with local persistence:', err);
        setServerConnected(false);
      } finally {
        if (isMounted) setIsLoadingInitial(false);
      }
    };

    fetchServerData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Sync boards to localStorage for offline cache
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_BOARDS_KEY, JSON.stringify(boards));
    } catch (e) {
      console.error('Failed to save boards to localStorage', e);
    }
  }, [boards]);

  // Sync users to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(users));
    } catch (e) {
      console.error('Failed to save users to localStorage', e);
    }
  }, [users]);

  // Sync current user
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(currentUser));
    } catch (e) {
      console.error('Failed to save currentUser to localStorage', e);
    }
  }, [currentUser]);

  // Active Board instance
  const activeBoard = boards.find((b) => b.id === activeBoardId) || boards[0] || INITIAL_BOARDS[0];

  // Handlers for Boards
  const handleSelectBoard = (boardId: string) => {
    setActiveBoardId(boardId);
  };

  const handleDuplicateBoard = async (boardId: string, customName?: string) => {
    try {
      const duplicated = await api.boards.duplicate(boardId, customName);
      setBoards((prev) => [...prev, duplicated]);
      setActiveBoardId(duplicated.id);
      setServerConnected(true);
    } catch (err) {
      console.error('Server duplicate error, falling back locally:', err);
      const targetBoard = boards.find((b) => b.id === boardId);
      if (!targetBoard) return;

      const newId = `board-${Date.now()}`;
      const duplicatedBoard: GanttBoard = {
        ...targetBoard,
        id: newId,
        name: customName || `${targetBoard.name} (עותק משוכפל)`,
        isDefault: false,
        createdAt: new Date().toISOString().slice(0, 10),
        events: targetBoard.events.map((ev) => ({
          ...ev,
          id: `ev-${Math.random().toString(36).substring(2, 9)}`,
          tasks: (ev.tasks || []).map((t) => ({
            ...t,
            id: `task-${Math.random().toString(36).substring(2, 9)}`
          }))
        }))
      };

      setBoards((prev) => [...prev, duplicatedBoard]);
      setActiveBoardId(newId);
    }
  };

  const handleCreateBoard = async (newBoardData: Omit<GanttBoard, 'id' | 'createdAt'>) => {
    try {
      const created = await api.boards.create({
        ...newBoardData,
        users: [currentUser]
      });
      setBoards((prev) => [...prev, created]);
      setActiveBoardId(created.id);
      setServerConnected(true);
    } catch (err) {
      console.error('Server create board error, falling back locally:', err);
      const newBoard: GanttBoard = {
        ...newBoardData,
        id: `board-${Date.now()}`,
        createdAt: new Date().toISOString().slice(0, 10),
        events: [],
        users: [currentUser]
      };
      setBoards((prev) => [...prev, newBoard]);
      setActiveBoardId(newBoard.id);
    }
  };

  const handleRenameBoard = async (boardId: string, newName: string, newDesc?: string) => {
    // Optimistic
    setBoards((prev) =>
      prev.map((b) =>
        b.id === boardId ? { ...b, name: newName, description: newDesc || b.description } : b
      )
    );

    try {
      await api.boards.update(boardId, { name: newName, description: newDesc });
      setServerConnected(true);
    } catch (err) {
      console.error('Server rename board error:', err);
    }
  };

  const handleDeleteBoard = async (boardId: string) => {
    if (boards.length <= 1) {
      alert('לא ניתן למחוק את הלוח היחיד במערכת.');
      return;
    }

    setBoards((prev) => prev.filter((b) => b.id !== boardId));
    const remaining = boards.filter((b) => b.id !== boardId);
    if (remaining.length > 0) {
      setActiveBoardId(remaining[0].id);
    }

    try {
      await api.boards.delete(boardId);
      setServerConnected(true);
    } catch (err) {
      console.error('Server delete board error:', err);
    }
  };

  // Handlers for Events
  const handleAddEvent = async (newEvent: EventItem) => {
    // Optimistic
    setBoards((prev) =>
      prev.map((b) => {
        if (b.id === activeBoard.id) {
          return {
            ...b,
            events: [newEvent, ...b.events]
          };
        }
        return b;
      })
    );

    try {
      await api.events.add(activeBoard.id, newEvent);
      setServerConnected(true);
    } catch (err) {
      console.error('Server add event error:', err);
    }
  };

  const handleUpdateEvent = async (updatedEvent: EventItem) => {
    // Optimistic
    setBoards((prev) =>
      prev.map((b) => {
        if (b.id === activeBoard.id) {
          return {
            ...b,
            events: b.events.map((ev) => (ev.id === updatedEvent.id ? updatedEvent : ev))
          };
        }
        return b;
      })
    );

    if (selectedEventForDetail && selectedEventForDetail.id === updatedEvent.id) {
      setSelectedEventForDetail(updatedEvent);
    }

    try {
      await api.events.update(activeBoard.id, updatedEvent.id, updatedEvent);
      setServerConnected(true);
    } catch (err) {
      console.error('Server update event error:', err);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    // Optimistic
    setBoards((prev) =>
      prev.map((b) => {
        if (b.id === activeBoard.id) {
          return {
            ...b,
            events: b.events.filter((ev) => ev.id !== eventId)
          };
        }
        return b;
      })
    );

    if (selectedEventForDetail && selectedEventForDetail.id === eventId) {
      setSelectedEventForDetail(null);
    }

    try {
      await api.events.delete(activeBoard.id, eventId);
      setServerConnected(true);
    } catch (err) {
      console.error('Server delete event error:', err);
    }
  };

  const handleToggleTaskStatus = async (eventId: string, taskId: string) => {
    let nextStatus = 'done';
    setBoards((prev) =>
      prev.map((b) => {
        if (b.id === activeBoard.id) {
          return {
            ...b,
            events: b.events.map((ev) => {
              if (ev.id === eventId) {
                return {
                  ...ev,
                  tasks: (ev.tasks || []).map((t) => {
                    if (t.id === taskId) {
                      const next = t.status === 'done' ? 'todo' : 'done';
                      nextStatus = next;
                      return {
                        ...t,
                        status: next,
                        completedAt: next === 'done' ? new Date().toISOString() : undefined
                      };
                    }
                    return t;
                  })
                };
              }
              return ev;
            })
          };
        }
        return b;
      })
    );

    try {
      await api.tasks.update(activeBoard.id, eventId, taskId, {
        status: nextStatus as any
      });
      setServerConnected(true);
    } catch (err) {
      console.error('Server toggle task error:', err);
    }
  };

  const handleQuickAddOnDate = (dateStr: string, monthKey: string) => {
    setQuickAddDate(dateStr);
    setQuickAddMonthKey(monthKey);
    setIsAddEventOpen(true);
  };

  // Handlers for Users & Permissions
  const handleAddUser = async (newUser: UserAccess) => {
    setUsers((prev) => [...prev, newUser]);
    try {
      await api.users.add(newUser);
      setServerConnected(true);
    } catch (err) {
      console.error('Server add user error:', err);
    }
  };

  const handleUpdateUserRole = async (userId: string, newRole: UserRole) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
    );
    if (currentUser.id === userId) {
      setCurrentUser((prev) => ({ ...prev, role: newRole }));
    }

    try {
      await api.users.update(userId, { role: newRole });
      setServerConnected(true);
    } catch (err) {
      console.error('Server update user role error:', err);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    try {
      await api.users.delete(userId);
      setServerConnected(true);
    } catch (err) {
      console.error('Server remove user error:', err);
    }
  };

  const handleSwitchActiveUser = (user: UserAccess) => {
    setCurrentUser(user);
  };

  // Filter months by year if needed
  const filteredMonths = MONTHS_LIST.filter((m) => {
    if (activeYearFilter === 'all') return true;
    return String(m.year) === activeYearFilter;
  });

  const visibleMonths = showAllMonths
    ? filteredMonths
    : [filteredMonths[Math.min(selectedMonthIndex, filteredMonths.length - 1)] || MONTHS_LIST[0]];

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F7] text-[#3A3534]" dir="rtl">
      {/* Top Main Navbar */}
      <Navbar
        boards={boards}
        activeBoard={activeBoard}
        onSelectBoard={handleSelectBoard}
        onDuplicateBoard={handleDuplicateBoard}
        onOpenCreateBoard={() => setIsManageBoardsOpen(true)}
        onOpenManageBoards={() => setIsManageBoardsOpen(true)}
        viewMode={viewMode}
        onSelectViewMode={setViewMode}
        currentUser={currentUser}
        onOpenPermissions={() => setIsPermissionsOpen(true)}
        onOpenAddEvent={() => {
          setQuickAddDate(undefined);
          setQuickAddMonthKey(undefined);
          setIsAddEventOpen(true);
        }}
        onOpenExport={() => setIsExportOpen(true)}
        onOpenAIAssistant={() => setIsGlobalAiOpen(true)}
        serverConnected={serverConnected}
        filterState={filterState}
        onUpdateFilter={(upd) => setFilterState((prev) => ({ ...prev, ...upd }))}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col">
        {/* Month Selector Bar (Shown on Calendar, Gantt, List views) */}
        {viewMode !== 'analytics' && (
          <MonthSelector
            months={filteredMonths}
            selectedMonthIndex={selectedMonthIndex}
            showAllMonths={showAllMonths}
            onSelectMonth={(idx) => {
              setSelectedMonthIndex(idx);
              setShowAllMonths(false);
            }}
            onToggleShowAll={() => setShowAllMonths(!showAllMonths)}
            onPrevMonth={() => {
              setSelectedMonthIndex((prev) => Math.max(0, prev - 1));
              setShowAllMonths(false);
            }}
            onNextMonth={() => {
              setSelectedMonthIndex((prev) => Math.min(filteredMonths.length - 1, prev + 1));
              setShowAllMonths(false);
            }}
            activeYearFilter={activeYearFilter}
            onSelectYear={(yr) => {
              setActiveYearFilter(yr);
              setSelectedMonthIndex(0);
            }}
          />
        )}

        {/* View Switcher Output */}
        <div className="flex-1">
          {viewMode === 'calendar' && (
            <MonthlyCalendarView
              months={visibleMonths}
              events={activeBoard.events}
              filterState={filterState}
              onOpenEventDetail={setSelectedEventForDetail}
              onQuickAddOnDate={handleQuickAddOnDate}
              currentUser={currentUser}
            />
          )}

          {viewMode === 'gantt' && (
            <GanttTimelineView
              months={MONTHS_LIST}
              events={activeBoard.events}
              filterState={filterState}
              onOpenEventDetail={setSelectedEventForDetail}
              currentUser={currentUser}
            />
          )}

          {viewMode === 'kanban' && (
            <KanbanBoardView
              events={activeBoard.events}
              filterState={filterState}
              onOpenEventDetail={setSelectedEventForDetail}
              onOpenAddEvent={() => setIsAddEventOpen(true)}
              currentUser={currentUser}
            />
          )}

          {viewMode === 'list' && (
            <ListView
              events={activeBoard.events}
              filterState={filterState}
              onOpenEventDetail={setSelectedEventForDetail}
              onToggleTaskStatus={handleToggleTaskStatus}
              onOpenAddEvent={() => setIsAddEventOpen(true)}
              currentUser={currentUser}
            />
          )}

          {viewMode === 'analytics' && (
            <AnalyticsView
              events={activeBoard.events}
              months={MONTHS_LIST}
              users={users}
              boardName={activeBoard.name}
            />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t-2 border-[#3A3534] bg-white py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-4 text-xs text-[#6B6362]">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-sm text-[#3A3534]">
              XTRA <span className="text-[#F7414B]">Giftcard</span>
            </span>
            <span>• שרת API וגאנט משימות 2026–2028</span>
          </div>

          <span>תאריך התנעה = עלייה לאוויר | תאריך אמת = מועד האירוע</span>
        </div>
      </footer>

      {/* Modals & Dialogs */}
      {selectedEventForDetail && (
        <EventDetailModal
          event={selectedEventForDetail}
          onClose={() => setSelectedEventForDetail(null)}
          onUpdateEvent={handleUpdateEvent}
          onDeleteEvent={handleDeleteEvent}
          users={users}
          currentUser={currentUser}
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
          onAddEvent={handleAddEvent}
          months={MONTHS_LIST}
          defaultDate={quickAddDate}
          defaultMonthKey={quickAddMonthKey}
          currentUser={currentUser}
        />
      )}

      {isPermissionsOpen && (
        <UserPermissionsModal
          isOpen={isPermissionsOpen}
          onClose={() => setIsPermissionsOpen(false)}
          users={users}
          currentUser={currentUser}
          onAddUser={handleAddUser}
          onUpdateUserRole={handleUpdateUserRole}
          onRemoveUser={handleRemoveUser}
          onSwitchActiveUser={handleSwitchActiveUser}
        />
      )}

      {isManageBoardsOpen && (
        <BoardManagementModal
          isOpen={isManageBoardsOpen}
          onClose={() => setIsManageBoardsOpen(false)}
          boards={boards}
          activeBoardId={activeBoard.id}
          onSelectBoard={handleSelectBoard}
          onDuplicateBoard={handleDuplicateBoard}
          onCreateBoard={handleCreateBoard}
          onRenameBoard={handleRenameBoard}
          onDeleteBoard={handleDeleteBoard}
          currentUser={currentUser}
        />
      )}

      {isExportOpen && (
        <ExportModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          board={activeBoard}
        />
      )}

      {isGlobalAiOpen && (
        <AIAssistantModal
          isOpen={isGlobalAiOpen}
          onClose={() => setIsGlobalAiOpen(false)}
          users={users}
          currentUser={currentUser}
          onAddGeneratedTasks={(tasks) => {
            // Add to the first event of active board or create general task
            if (activeBoard.events.length > 0) {
              const firstEv = activeBoard.events[0];
              handleUpdateEvent({
                ...firstEv,
                tasks: [...(firstEv.tasks || []), ...tasks]
              });
            }
          }}
        />
      )}
    </div>
  );
}
