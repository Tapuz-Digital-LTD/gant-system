import React, { useState } from 'react';
import {
  Calendar,
  Layers,
  ListTodo,
  BarChart3,
  Copy,
  Plus,
  Share2,
  Users,
  Search,
  Filter,
  Download,
  CheckCircle2,
  Sparkles,
  ChevronDown,
  Tag
} from 'lucide-react';
import { ViewMode, GanttBoard, UserAccess, FilterState } from '../types';

interface NavbarProps {
  boards: GanttBoard[];
  activeBoard: GanttBoard;
  onSelectBoard: (boardId: string) => void;
  onDuplicateBoard: (boardId: string) => void;
  onOpenCreateBoard: () => void;
  onOpenManageBoards: () => void;
  viewMode: ViewMode;
  onSelectViewMode: (mode: ViewMode) => void;
  currentUser: UserAccess;
  onOpenPermissions: () => void;
  onOpenAddEvent: () => void;
  onOpenExport: () => void;
  onOpenAIAssistant?: () => void;
  serverConnected?: boolean;
  filterState: FilterState;
  onUpdateFilter: (filter: Partial<FilterState>) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  boards,
  activeBoard,
  onSelectBoard,
  onDuplicateBoard,
  onOpenCreateBoard,
  onOpenManageBoards,
  viewMode,
  onSelectViewMode,
  currentUser,
  onOpenPermissions,
  onOpenAddEvent,
  onOpenExport,
  onOpenAIAssistant,
  serverConnected = true,
  filterState,
  onUpdateFilter
}) => {
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const [showFilterBar, setShowFilterBar] = useState(false);

  const canEdit = currentUser.role === 'admin' || currentUser.role === 'editor';

  return (
    <header className="bg-white border-b-2 border-[#3A3534] sticky top-0 z-30 shadow-sm">
      {/* Top Brand & Actions Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Left: Brand Identity & Active Board Selector */}
        <div className="flex items-center gap-3">
          {/* Brand Tag */}
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-[#F7414B] border-2 border-[#3A3534] xtra-sticker-shadow-sm flex items-center justify-center text-white font-bold text-lg tracking-wider">
              X
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-lg text-[#3A3534] tracking-tight leading-none">
                XTRA <span className="text-[#F7414B]">Giftcard</span>
              </span>
              <span className="text-[11px] text-[#6B6362] font-medium leading-tight">
                מערכת גאנט ומשימות 2026–2028
              </span>
            </div>
          </div>

          <div className="h-6 w-px bg-[#E6E2E1] mx-1 hidden sm:block"></div>

          {/* Board Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => setBoardMenuOpen(!boardMenuOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full border-2 border-[#3A3534] bg-[#FAF8F7] hover:bg-[#F3F1F0] text-[#3A3534] font-semibold text-sm transition-all xtra-sticker-shadow-sm"
              title="החלפת גאנט / לוח עבודה"
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: activeBoard.color }}></span>
              <span className="max-w-[170px] sm:max-w-[240px] truncate">{activeBoard.name}</span>
              <ChevronDown className={`w-4 h-4 text-[#6B6362] transition-transform ${boardMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {boardMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white border-2 border-[#3A3534] rounded-2xl shadow-xl z-50 p-2 text-right">
                <div className="px-3 py-1.5 text-[11px] font-bold text-[#9A9291] tracking-wider border-b border-[#E6E2E1]">
                  הגאנטים והלוחות שלך
                </div>
                <div className="py-1 max-h-56 overflow-y-auto space-y-1">
                  {boards.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => {
                        onSelectBoard(b.id);
                        setBoardMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-colors ${
                        b.id === activeBoard.id
                          ? 'bg-[#FFE7E8] text-[#F7414B] font-bold'
                          : 'hover:bg-[#FAF8F7] text-[#3A3534]'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: b.color }}></span>
                        <span className="truncate">{b.name}</span>
                      </div>
                      {b.id === activeBoard.id && <CheckCircle2 className="w-4 h-4 text-[#F7414B]" />}
                    </button>
                  ))}
                </div>

                <div className="border-t border-[#E6E2E1] pt-2 mt-1 space-y-1">
                  {canEdit && (
                    <button
                      onClick={() => {
                        onDuplicateBoard(activeBoard.id);
                        setBoardMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#5059FF] hover:bg-[#E6E7FF] transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>שכפול גאנט נוכחי ({activeBoard.name})</span>
                    </button>
                  )}
                  {canEdit && (
                    <button
                      onClick={() => {
                        onOpenCreateBoard();
                        setBoardMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#3A3534] hover:bg-[#FAF8F7] transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>יצירת גאנט חדש מותאם אישית</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      onOpenManageBoards();
                      setBoardMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#6B6362] hover:bg-[#FAF8F7] transition-colors"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>ניהול כל הגאנטים והלוחות</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Actions & User Info */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Server Sync Indicator */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${
              serverConnected
                ? 'bg-[#EBF9F1] text-[#2FA36B] border-[#A8E5C4]'
                : 'bg-[#FFF6DC] text-[#B87A00] border-[#FFE18A]'
            }`}
            title={serverConnected ? 'מחובר לשרת ה-API של XTRA (Node Express)' : 'מצב אופליין - מסונכרן מקומית'}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                serverConnected ? 'bg-[#2FA36B] animate-pulse' : 'bg-[#B87A00]'
              }`}
            ></span>
            <span className="hidden lg:inline">{serverConnected ? 'שרת Backend מחובר' : 'סנכרון מקומי'}</span>
          </div>

          {/* AI Assistant Button */}
          {onOpenAIAssistant && (
            <button
              onClick={onOpenAIAssistant}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 border-[#3A3534] bg-[#5059FF] hover:bg-[#3E47E6] text-white text-xs font-bold transition-all xtra-sticker-shadow-sm cursor-pointer"
              title="סייר AI לתכנון אירועים ומשימות בשרת"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">סייר AI</span>
            </button>
          )}

          {/* Quick Filter Toggle */}
          <button
            onClick={() => setShowFilterBar(!showFilterBar)}
            className={`p-2 rounded-xl border-2 border-[#3A3534] transition-all text-xs font-semibold flex items-center gap-1.5 ${
              showFilterBar || filterState.search || filterState.category !== 'all' || filterState.status !== 'all'
                ? 'bg-[#FFE7E8] text-[#F7414B]'
                : 'bg-white text-[#3A3534] hover:bg-[#FAF8F7]'
            }`}
            title="חיפוש ומסננים"
          >
            <Filter className="w-4 h-4" />
            <span className="hidden md:inline">סינון</span>
            {(filterState.search || filterState.category !== 'all' || filterState.status !== 'all') && (
              <span className="w-2 h-2 rounded-full bg-[#F7414B]"></span>
            )}
          </button>

          {/* Export Button */}
          <button
            onClick={onOpenExport}
            className="p-2 rounded-xl border-2 border-[#3A3534] bg-white hover:bg-[#FAF8F7] text-[#3A3534] text-xs font-semibold flex items-center gap-1.5 transition-all"
            title="ייצוא נתונים / הדפסה"
          >
            <Download className="w-4 h-4" />
            <span className="hidden md:inline">ייצוא</span>
          </button>

          {/* Permissions / Email Share Button */}
          <button
            onClick={onOpenPermissions}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 border-[#3A3534] bg-white hover:bg-[#FAF8F7] text-[#3A3534] transition-all xtra-sticker-shadow-sm text-xs font-semibold"
            title="ניהול משתמשים והרשאות לפי מייל"
          >
            <Users className="w-4 h-4 text-[#5059FF]" />
            <div className="flex flex-col text-right">
              <span className="truncate max-w-[130px] font-bold text-[#3A3534]">{currentUser.email}</span>
              <span className="text-[10px] text-[#6B6362]">
                {currentUser.role === 'admin' ? 'מנהל ראשי' : currentUser.role === 'editor' ? 'עורך מורשה' : 'צופה בלבד'}
              </span>
            </div>
          </button>

          {/* Add Event Button (Editor/Admin only) */}
          {canEdit ? (
            <button
              onClick={onOpenAddEvent}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full border-2 border-[#3A3534] bg-[#F7414B] hover:bg-[#DE2A34] text-white font-bold text-sm transition-all xtra-sticker-shadow cursor-pointer active:translate-x-0.5 active:translate-y-0.5"
            >
              <Plus className="w-4 h-4" />
              <span>הוספת אירוע</span>
            </button>
          ) : (
            <div className="text-xs text-[#9A9291] bg-[#F3F1F0] px-3 py-1.5 rounded-full border border-[#C7C1C0]">
              מצב צפייה (לקריאה בלבד)
            </div>
          )}
        </div>
      </div>

      {/* Sub-bar: View Mode Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#E6E2E1] bg-[#FAF8F7]">
        <div className="flex items-center gap-1.5 overflow-x-auto py-1">
          <button
            onClick={() => onSelectViewMode('calendar')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
              viewMode === 'calendar'
                ? 'bg-[#3A3534] text-white xtra-sticker-shadow-sm'
                : 'bg-white text-[#3A3534] border border-[#C7C1C0] hover:border-[#3A3534]'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>לוח חודשי (Calendar)</span>
          </button>

          <button
            onClick={() => onSelectViewMode('gantt')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
              viewMode === 'gantt'
                ? 'bg-[#3A3534] text-white xtra-sticker-shadow-sm'
                : 'bg-white text-[#3A3534] border border-[#C7C1C0] hover:border-[#3A3534]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>גאנט ציר זמן (Timeline)</span>
          </button>

          <button
            onClick={() => onSelectViewMode('kanban')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
              viewMode === 'kanban'
                ? 'bg-[#3A3534] text-white xtra-sticker-shadow-sm'
                : 'bg-white text-[#3A3534] border border-[#C7C1C0] hover:border-[#3A3534]'
            }`}
          >
            <ListTodo className="w-3.5 h-3.5" />
            <span>לוח קנבן (Kanban)</span>
          </button>

          <button
            onClick={() => onSelectViewMode('list')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
              viewMode === 'list'
                ? 'bg-[#3A3534] text-white xtra-sticker-shadow-sm'
                : 'bg-white text-[#3A3534] border border-[#C7C1C0] hover:border-[#3A3534]'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>רשימת משימות (Table)</span>
          </button>

          <button
            onClick={() => onSelectViewMode('analytics')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
              viewMode === 'analytics'
                ? 'bg-[#3A3534] text-white xtra-sticker-shadow-sm'
                : 'bg-white text-[#3A3534] border border-[#C7C1C0] hover:border-[#3A3534]'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>דשבורד וסטטיסטיקה</span>
          </button>
        </div>

        {/* Quick event count and duplicate trigger */}
        <div className="flex items-center gap-3 text-xs text-[#6B6362]">
          <span className="font-semibold text-[#3A3534]">
            {activeBoard.events.length} אירועים וקמפיינים
          </span>
          {canEdit && (
            <button
              onClick={() => onDuplicateBoard(activeBoard.id)}
              className="text-[#5059FF] hover:underline font-bold flex items-center gap-1"
            >
              <Copy className="w-3 h-3" />
              <span>שכפל גאנט</span>
            </button>
          )}
        </div>
      </div>

      {/* Expandable Filter & Search Drawer */}
      {showFilterBar && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 border-t border-[#E6E2E1] bg-[#FFF6DC] flex flex-wrap items-center gap-3 text-xs">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-[#9A9291]" />
            <input
              type="text"
              placeholder="חיפוש אירוע, משימה או אחראי..."
              value={filterState.search}
              onChange={(e) => onUpdateFilter({ search: e.target.value })}
              className="w-full pr-8 pl-3 py-1.5 rounded-full border border-[#C7C1C0] bg-white text-[#3A3534] focus:outline-none focus:border-[#5059FF]"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[#6B6362] font-medium">קטגוריה:</span>
            <select
              value={filterState.category}
              onChange={(e) => onUpdateFilter({ category: e.target.value })}
              className="px-2.5 py-1.5 rounded-full border border-[#C7C1C0] bg-white text-[#3A3534] font-medium focus:outline-none"
            >
              <option value="all">כל הקטגוריות</option>
              <option value="holiday">חגים ומועדים</option>
              <option value="campaign">קמפיינים עונתיים</option>
              <option value="b2b">ועדים ו-B2B</option>
              <option value="social">סושיאל ומדיה</option>
              <option value="operational">תפעול ופיתוח</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[#6B6362] font-medium">סטטוס משימות:</span>
            <select
              value={filterState.status}
              onChange={(e) => onUpdateFilter({ status: e.target.value })}
              className="px-2.5 py-1.5 rounded-full border border-[#C7C1C0] bg-white text-[#3A3534] font-medium focus:outline-none"
            >
              <option value="all">הכל</option>
              <option value="todo">טרם התחיל</option>
              <option value="in_progress">בתהליך</option>
              <option value="done">הושלם</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[#6B6362] font-medium">שנה:</span>
            <select
              value={filterState.year}
              onChange={(e) => onUpdateFilter({ year: e.target.value })}
              className="px-2.5 py-1.5 rounded-full border border-[#C7C1C0] bg-white text-[#3A3534] font-medium focus:outline-none"
            >
              <option value="all">כל השנים (2026–2028)</option>
              <option value="2026">2026</option>
              <option value="2027">2027</option>
              <option value="2028">2028</option>
            </select>
          </div>

          <div className="flex items-center gap-3 mr-auto">
            <label className="flex items-center gap-1.5 cursor-pointer font-medium text-[#3A3534]">
              <input
                type="checkbox"
                checked={filterState.showKickoffs}
                onChange={(e) => onUpdateFilter({ showKickoffs: e.target.checked })}
                className="accent-[#F7414B]"
              />
              <span className="w-2.5 h-2.5 rounded-full bg-[#F7414B] inline-block"></span>
              <span>התנעות</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer font-medium text-[#3A3534]">
              <input
                type="checkbox"
                checked={filterState.showActuals}
                onChange={(e) => onUpdateFilter({ showActuals: e.target.checked })}
                className="accent-[#3A3534]"
              />
              <span className="w-2.5 h-2.5 rounded-full bg-[#3A3534] inline-block"></span>
              <span>תאריכי אמת</span>
            </label>

            {(filterState.search || filterState.category !== 'all' || filterState.status !== 'all' || filterState.year !== 'all') && (
              <button
                onClick={() => onUpdateFilter({ search: '', category: 'all', status: 'all', year: 'all' })}
                className="text-[#DE2A34] hover:underline font-bold"
              >
                איפוס מסננים
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
