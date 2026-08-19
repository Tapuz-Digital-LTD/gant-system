import React, { useState } from 'react';
import { X, Copy, Plus, Trash2, Layers, CheckCircle2, Edit3, Sparkles } from 'lucide-react';
import { GanttBoard, UserAccess } from '../types';
import { formatDate } from '../utils/dateHelpers';

interface BoardManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  boards: GanttBoard[];
  activeBoardId: string;
  onSelectBoard: (boardId: string) => void;
  onDuplicateBoard: (boardId: string, customName?: string) => void;
  onCreateBoard: (newBoard: Omit<GanttBoard, 'id' | 'createdAt'>) => void;
  onRenameBoard: (boardId: string, newName: string, newDesc?: string) => void;
  onDeleteBoard: (boardId: string) => void;
  currentUser: UserAccess;
}

export const BoardManagementModal: React.FC<BoardManagementModalProps> = ({
  isOpen,
  onClose,
  boards,
  activeBoardId,
  onSelectBoard,
  onDuplicateBoard,
  onCreateBoard,
  onRenameBoard,
  onDeleteBoard,
  currentUser
}) => {
  if (!isOpen) return null;

  const canEdit = currentUser.role === 'admin' || currentUser.role === 'editor';

  // Duplicate prompt state
  const [duplicateTargetId, setDuplicateTargetId] = useState<string | null>(null);
  const [duplicateCustomName, setDuplicateCustomName] = useState('');

  // Create new board state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [newBoardDesc, setNewBoardDesc] = useState('');
  const [newBoardCategory, setNewBoardCategory] = useState<GanttBoard['category']>('social');
  const [newBoardColor, setNewBoardColor] = useState('#5059FF');

  // Edit board state
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editBoardName, setEditBoardName] = useState('');
  const [editBoardDesc, setEditBoardDesc] = useState('');

  const handleStartDuplicate = (board: GanttBoard) => {
    setDuplicateTargetId(board.id);
    setDuplicateCustomName(`${board.name} (עותק משוכפל)`);
  };

  const handleConfirmDuplicate = () => {
    if (!duplicateTargetId || !duplicateCustomName.trim()) return;
    onDuplicateBoard(duplicateTargetId, duplicateCustomName.trim());
    setDuplicateTargetId(null);
    setDuplicateCustomName('');
  };

  const handleCreateBoardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoardName.trim()) return;

    onCreateBoard({
      name: newBoardName.trim(),
      description: newBoardDesc.trim(),
      category: newBoardCategory,
      color: newBoardColor,
      icon: newBoardCategory === 'social' ? 'Share2' : newBoardCategory === 'operations' ? 'Cpu' : 'Calendar',
      events: [],
      users: [currentUser]
    });

    setNewBoardName('');
    setNewBoardDesc('');
    setShowCreateForm(false);
  };

  const handleStartRename = (board: GanttBoard) => {
    setEditingBoardId(board.id);
    setEditBoardName(board.name);
    setEditBoardDesc(board.description || '');
  };

  const handleSaveRename = (boardId: string) => {
    if (!editBoardName.trim()) return;
    onRenameBoard(boardId, editBoardName.trim(), editBoardDesc.trim());
    setEditingBoardId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white border-2 border-[#3A3534] rounded-[28px] max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col xtra-sticker-shadow-lg text-right">
        {/* Header */}
        <div className="p-6 border-b-2 border-[#3A3534] bg-[#FAF8F7] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#3A3534] border-2 border-[#3A3534] xtra-sticker-shadow-sm flex items-center justify-center text-white">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-[#3A3534]">
                ניהול ושכפול גאנטים (Boards)
              </h2>
              <p className="text-xs text-[#6B6362]">
                שכפול גאנט אירועים לסושיאל, משימות או תפעול, ויצירת לוחות חדשים
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full border-2 border-[#3A3534] bg-white hover:bg-[#FFE7E8] text-[#3A3534] hover:text-[#F7414B] transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6 text-xs">
          {/* Quick Duplicate Drawer */}
          {duplicateTargetId && canEdit && (
            <div className="bg-[#FFE7E8] border-2 border-[#F7414B] rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sm font-extrabold text-[#F7414B]">
                <Copy className="w-4 h-4" />
                <span>שכפול גאנט: העתקת כל האירועים והמשימות</span>
              </div>
              <p className="text-[#3A3534] text-xs">
                הגאנט ישוכפל במלואו יחד עם כל האירועים, תאריכי ההתנעה, תאריכי האמת והמשימות. תוכל להתאים אותו למטרות חדשות (לדוגמה: "גאנט סושיאל 2027").
              </p>
              <div>
                <label className="font-bold text-[#3A3534] block mb-1">שם הגאנט המשוכפל:</label>
                <input
                  type="text"
                  value={duplicateCustomName}
                  onChange={(e) => setDuplicateCustomName(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#C7C1C0] bg-white font-bold text-sm text-[#3A3534]"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDuplicateTargetId(null)}
                  className="px-3.5 py-1.5 rounded-full text-xs font-bold text-[#6B6362] hover:bg-white/50"
                >
                  ביטול
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDuplicate}
                  className="px-5 py-1.5 rounded-full bg-[#F7414B] text-white text-xs font-bold xtra-sticker-shadow-sm"
                >
                  בצע שכפול כעת
                </button>
              </div>
            </div>
          )}

          {/* Create New Board Form */}
          {showCreateForm && canEdit && (
            <form
              onSubmit={handleCreateBoardSubmit}
              className="bg-[#FAF8F7] border-2 border-[#3A3534] rounded-2xl p-4 flex flex-col gap-3"
            >
              <span className="font-extrabold text-sm text-[#3A3534]">
                יצירת גאנט / לוח עבודה חדש
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[#3A3534] block mb-1">שם הגאנט: *</label>
                  <input
                    type="text"
                    required
                    placeholder="לדוגמה: גאנט סושיאל ומדיה..."
                    value={newBoardName}
                    onChange={(e) => setNewBoardName(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-[#C7C1C0] bg-white font-semibold text-[#3A3534]"
                  />
                </div>

                <div>
                  <label className="font-bold text-[#3A3534] block mb-1">תחום / קטגוריה:</label>
                  <select
                    value={newBoardCategory}
                    onChange={(e) => setNewBoardCategory(e.target.value as any)}
                    className="w-full p-2.5 rounded-xl border border-[#C7C1C0] bg-white font-semibold text-[#3A3534]"
                  >
                    <option value="social">סושיאל, מדיה וקריאייטיב</option>
                    <option value="tasks">משימות כלליות ופרויקטים</option>
                    <option value="operations">תפעול, סליקה ומוצר</option>
                    <option value="events">אירועים וקמפיינים</option>
                    <option value="custom">מותאם אישית</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-[#3A3534] block mb-1">תיאור קצר:</label>
                <input
                  type="text"
                  placeholder="לדוגמה: תכנון פוסטים, סרטונים ומשפיענים..."
                  value={newBoardDesc}
                  onChange={(e) => setNewBoardDesc(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#C7C1C0] bg-white text-[#3A3534]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E6E2E1]">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-3.5 py-1.5 rounded-full text-xs font-bold text-[#6B6362] hover:bg-[#E6E2E1]"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  className="px-5 py-1.5 rounded-full bg-[#3A3534] text-white font-bold text-xs xtra-sticker-shadow-sm"
                >
                  צור גאנט
                </button>
              </div>
            </form>
          )}

          {/* Quick Create Trigger Button */}
          {!showCreateForm && canEdit && (
            <div className="flex items-center justify-between bg-[#FAF8F7] p-3.5 rounded-2xl border border-[#E6E2E1]">
              <div>
                <span className="font-bold text-xs text-[#3A3534] block">צריך גאנט נוסף למחלקה אחרת?</span>
                <span className="text-[11px] text-[#6B6362]">צור לוח חדש או שכפל לוח קיים בלחיצה</span>
              </div>
              <button
                onClick={() => setShowCreateForm(true)}
                className="flex items-center gap-1 px-3.5 py-1.5 rounded-full border-2 border-[#3A3534] bg-white hover:bg-[#FAF8F7] text-[#3A3534] font-bold text-xs xtra-sticker-shadow-sm cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>גאנט חדש</span>
              </button>
            </div>
          )}

          {/* Boards List */}
          <div className="flex flex-col gap-3">
            <span className="text-sm font-extrabold text-[#3A3534]">
              הגאנטים הקיימים במערכת ({boards.length})
            </span>

            <div className="divide-y divide-[#E6E2E1] border-2 border-[#3A3534] rounded-2xl bg-white overflow-hidden">
              {boards.map((b) => {
                const isActive = b.id === activeBoardId;
                const isEditing = editingBoardId === b.id;

                return (
                  <div
                    key={b.id}
                    className={`p-4 flex flex-col gap-2 transition-colors ${
                      isActive ? 'bg-[#FFE7E8]/30' : 'hover:bg-[#FAF8F7]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {isEditing ? (
                        <div className="flex-1 flex flex-col gap-2">
                          <input
                            type="text"
                            value={editBoardName}
                            onChange={(e) => setEditBoardName(e.target.value)}
                            className="p-2 rounded-lg border border-[#3A3534] font-bold text-xs"
                          />
                          <input
                            type="text"
                            value={editBoardDesc}
                            onChange={(e) => setEditBoardDesc(e.target.value)}
                            className="p-1.5 rounded-lg border border-[#C7C1C0] text-xs"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSaveRename(b.id)}
                              className="px-3 py-1 rounded bg-[#3A3534] text-white text-[11px] font-bold"
                            >
                              שמור
                            </button>
                            <button
                              onClick={() => setEditingBoardId(null)}
                              className="px-3 py-1 rounded text-[#6B6362] text-[11px]"
                            >
                              ביטול
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <span
                            className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: b.color }}
                          ></span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-sm text-[#3A3534]">{b.name}</span>
                              {isActive && (
                                <span className="bg-[#F7414B] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                                  פעיל כעת
                                </span>
                              )}
                              {b.isDefault && (
                                <span className="bg-[#E6E2E1] text-[#3A3534] text-[10px] font-bold px-2 py-0.5 rounded-full">
                                  ראשי
                                </span>
                              )}
                            </div>
                            {b.description && (
                              <p className="text-[11px] text-[#6B6362] mt-0.5">{b.description}</p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      {!isEditing && (
                        <div className="flex items-center gap-2">
                          {!isActive && (
                            <button
                              onClick={() => {
                                onSelectBoard(b.id);
                                onClose();
                              }}
                              className="px-3 py-1 rounded-full border border-[#3A3534] bg-white hover:bg-[#FAF8F7] text-xs font-bold text-[#3A3534]"
                            >
                              פתח גאנט
                            </button>
                          )}

                          {canEdit && (
                            <button
                              onClick={() => handleStartDuplicate(b)}
                              className="p-1.5 rounded-lg border border-[#C7C1C0] hover:bg-[#E6E7FF] text-[#5059FF]"
                              title="שכפול גאנט זה"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          )}

                          {canEdit && (
                            <button
                              onClick={() => handleStartRename(b)}
                              className="p-1.5 rounded-lg border border-[#C7C1C0] hover:bg-[#FAF8F7] text-[#6B6362]"
                              title="עריכת שם ותיאור"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}

                          {canEdit && boards.length > 1 && !b.isDefault && (
                            <button
                              onClick={() => {
                                if (confirm(`האם למחוק את הגאנט "${b.name}"? כל האירועים בו יימחקו.`)) {
                                  onDeleteBoard(b.id);
                                }
                              }}
                              className="p-1.5 rounded-lg border border-[#C7C1C0] hover:bg-[#FFE7E8] text-[#DE2A34]"
                              title="מחיקת גאנט"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-[11px] text-[#9A9291] pt-1">
                      <span>{b.events.length} אירועים מוגדרים</span>
                      <span>•</span>
                      <span>נוצר ב: {formatDate(b.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t-2 border-[#3A3534] bg-[#FAF8F7] flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-full bg-[#3A3534] hover:bg-[#241F1F] text-white font-bold text-xs xtra-sticker-shadow-sm cursor-pointer"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
};
