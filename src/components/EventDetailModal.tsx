import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  User,
  Calendar,
  AlertTriangle,
  Send,
  MessageSquare,
  Sparkles,
  Edit2,
  Tag,
  Rocket
} from 'lucide-react';
import { EventItem, TaskItem, UserAccess, TaskStatus, TaskPriority, TaskChecklistItem } from '../types';
import { formatDate, calculateEventProgress } from '../utils/dateHelpers';
import { AIAssistantModal } from './AIAssistantModal';

interface EventDetailModalProps {
  event: EventItem | null;
  onClose: () => void;
  onUpdateEvent: (updatedEvent: EventItem) => void;
  onDeleteEvent: (eventId: string) => void;
  users: UserAccess[];
  currentUser: UserAccess;
}

export const EventDetailModal: React.FC<EventDetailModalProps> = ({
  event,
  onClose,
  onUpdateEvent,
  onDeleteEvent,
  users,
  currentUser
}) => {
  if (!event) return null;

  const canEdit = currentUser.role === 'admin' || currentUser.role === 'editor';

  // Task creation state
  const [showAddTaskForm, setShowAddTaskForm] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('medium');
  const [newTaskAssignee, setNewTaskAssignee] = useState(currentUser.email);
  const [newTaskDueDate, setNewTaskDueDate] = useState('');

  // Comment state
  const [newCommentText, setNewCommentText] = useState('');
  const [activeTab, setActiveTab] = useState<'tasks' | 'details' | 'comments'>('tasks');
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);

  // Edit Event state
  const [isEditingEvent, setIsEditingEvent] = useState(false);
  const [editTitle, setEditTitle] = useState(event.title);
  const [editCategory, setEditCategory] = useState(event.category);
  const [editKickoffDate, setEditKickoffDate] = useState(event.kickoffDate || '');
  const [editActualDate, setEditActualDate] = useState(event.actualDate || '');
  const [editPrepMonths, setEditPrepMonths] = useState(event.prepMonths);
  const [editNote, setEditNote] = useState(event.note || '');
  const [editDesc, setEditDesc] = useState(event.description || '');

  const progress = calculateEventProgress(event);

  const handleSaveEventEdits = () => {
    onUpdateEvent({
      ...event,
      title: editTitle,
      category: editCategory,
      kickoffDate: editKickoffDate || undefined,
      actualDate: editActualDate || undefined,
      prepMonths: Number(editPrepMonths) || 0,
      note: editNote,
      description: editDesc
    });
    setIsEditingEvent(false);
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const assignedUser = users.find((u) => u.email === newTaskAssignee) || currentUser;

    const newTask: TaskItem = {
      id: `task-${Date.now()}`,
      title: newTaskTitle.trim(),
      description: newTaskDesc.trim(),
      status: 'todo',
      priority: newTaskPriority,
      assigneeEmail: assignedUser.email,
      assigneeName: assignedUser.name,
      dueDate: newTaskDueDate || undefined,
      checklist: [],
      comments: []
    };

    onUpdateEvent({
      ...event,
      tasks: [...(event.tasks || []), newTask]
    });

    setNewTaskTitle('');
    setNewTaskDesc('');
    setShowAddTaskForm(false);
  };

  const handleToggleTaskStatus = (taskId: string) => {
    const updatedTasks = (event.tasks || []).map((t) => {
      if (t.id === taskId) {
        const nextStatus: TaskStatus = t.status === 'done' ? 'todo' : 'done';
        return {
          ...t,
          status: nextStatus,
          completedAt: nextStatus === 'done' ? new Date().toISOString() : undefined
        };
      }
      return t;
    });

    onUpdateEvent({
      ...event,
      tasks: updatedTasks
    });
  };

  const handleUpdateTaskStatus = (taskId: string, newStatus: TaskStatus) => {
    const updatedTasks = (event.tasks || []).map((t) => {
      if (t.id === taskId) {
        return {
          ...t,
          status: newStatus,
          completedAt: newStatus === 'done' ? new Date().toISOString() : undefined
        };
      }
      return t;
    });

    onUpdateEvent({
      ...event,
      tasks: updatedTasks
    });
  };

  const handleDeleteTask = (taskId: string) => {
    const updatedTasks = (event.tasks || []).filter((t) => t.id !== taskId);
    onUpdateEvent({
      ...event,
      tasks: updatedTasks
    });
  };

  const handleAddChecklistItem = (taskId: string, text: string) => {
    if (!text.trim()) return;
    const newItem: TaskChecklistItem = {
      id: `chk-${Date.now()}`,
      text: text.trim(),
      done: false
    };

    const updatedTasks = (event.tasks || []).map((t) => {
      if (t.id === taskId) {
        return {
          ...t,
          checklist: [...(t.checklist || []), newItem]
        };
      }
      return t;
    });

    onUpdateEvent({
      ...event,
      tasks: updatedTasks
    });
  };

  const handleToggleChecklistItem = (taskId: string, checkId: string) => {
    const updatedTasks = (event.tasks || []).map((t) => {
      if (t.id === taskId) {
        return {
          ...t,
          checklist: (t.checklist || []).map((c) =>
            c.id === checkId ? { ...c, done: !c.done } : c
          )
        };
      }
      return t;
    });

    onUpdateEvent({
      ...event,
      tasks: updatedTasks
    });
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;

    const newComment = {
      id: `com-${Date.now()}`,
      userEmail: currentUser.email,
      userName: currentUser.name,
      text: newCommentText.trim(),
      date: new Date().toLocaleDateString('he-IL')
    };

    // Attach comment to first task or as an event level comment
    const updatedTasks = [...(event.tasks || [])];
    if (updatedTasks.length > 0) {
      updatedTasks[0] = {
        ...updatedTasks[0],
        comments: [...(updatedTasks[0].comments || []), newComment]
      };
    }

    onUpdateEvent({
      ...event,
      tasks: updatedTasks
    });
    setNewCommentText('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white border-2 border-[#3A3534] rounded-[28px] max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col xtra-sticker-shadow-lg text-right">
        {/* Header */}
        <div className="p-6 border-b-2 border-[#3A3534] bg-[#FAF8F7] flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5 flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="w-3 h-3 rounded-full bg-[#F7414B]"></span>
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#3A3534]">
                {event.title}
              </h2>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#E6E7FF] text-[#5059FF] border border-[#C8CAFF]">
                {event.monthKey}
              </span>
            </div>

            {/* Quick date badges */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-[#6B6362] mt-1">
              {event.kickoffDate && (
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#F7414B]"></span>
                  <span>התנעה: <strong className="text-[#F7414B] font-mono">{formatDate(event.kickoffDate)}</strong></span>
                </div>
              )}
              {event.actualDate && (
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#3A3534]"></span>
                  <span>תאריך אמת: <strong className="text-[#3A3534] font-mono">{event.isFloating ? 'במהלך החודש' : formatDate(event.actualDate)}</strong></span>
                </div>
              )}
              {event.prepMonths > 0 && (
                <span className="bg-[#FFF6DC] text-[#3A3534] px-2.5 py-0.5 rounded-full border border-[#FFD446] font-semibold">
                  חודשי הכנה נדרשים: {event.prepMonths} ח׳
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                onClick={() => setIsEditingEvent(!isEditingEvent)}
                className="p-2 rounded-full border-2 border-[#3A3534] bg-white hover:bg-[#FAF8F7] text-[#3A3534] text-xs font-bold transition-all"
                title="עריכת פרטי אירוע"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-full border-2 border-[#3A3534] bg-white hover:bg-[#FFE7E8] text-[#3A3534] hover:text-[#F7414B] transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Progress Bar & Sub-Tabs */}
        <div className="bg-[#FAF8F7] px-6 py-3 border-b border-[#E6E2E1] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-bold">
            <button
              onClick={() => setActiveTab('tasks')}
              className={`px-3.5 py-1.5 rounded-full transition-all ${
                activeTab === 'tasks'
                  ? 'bg-[#3A3534] text-white'
                  : 'bg-white text-[#3A3534] border border-[#C7C1C0]'
              }`}
            >
              משימות וצ׳קליסט ({event.tasks?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('details')}
              className={`px-3.5 py-1.5 rounded-full transition-all ${
                activeTab === 'details'
                  ? 'bg-[#3A3534] text-white'
                  : 'bg-white text-[#3A3534] border border-[#C7C1C0]'
              }`}
            >
              פרטים ותיאור
            </button>
          </div>

          {/* Progress Indicator */}
          <div className="flex items-center gap-2 text-xs font-bold text-[#3A3534]">
            <span>התקדמות: {progress.percentage}%</span>
            <div className="w-24 h-2.5 bg-[#E6E2E1] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#2FA36B] rounded-full transition-all duration-300"
                style={{ width: `${progress.percentage}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-5">
          {/* Edit Event Form Mode */}
          {isEditingEvent && (
            <div className="bg-[#FFF6DC] border-2 border-[#3A3534] rounded-2xl p-4 flex flex-col gap-3">
              <span className="text-xs font-bold text-[#3A3534]">עריכת פרטי אירוע</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="font-bold text-[#3A3534] block mb-1">שם האירוע:</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full p-2 rounded-lg border border-[#C7C1C0] bg-white font-semibold"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#3A3534] block mb-1">קטגוריה:</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as any)}
                    className="w-full p-2 rounded-lg border border-[#C7C1C0] bg-white font-semibold"
                  >
                    <option value="holiday">חג ומועד</option>
                    <option value="campaign">קמפיין עונתי</option>
                    <option value="b2b">ועדים ו-B2B</option>
                    <option value="social">סושיאל ומדיה</option>
                    <option value="operational">תפעול ופיתוח</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-[#3A3534] block mb-1">תאריך התנעה:</label>
                  <input
                    type="date"
                    value={editKickoffDate}
                    onChange={(e) => setEditKickoffDate(e.target.value)}
                    className="w-full p-2 rounded-lg border border-[#C7C1C0] bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#3A3534] block mb-1">תאריך אמת:</label>
                  <input
                    type="date"
                    value={editActualDate}
                    onChange={(e) => setEditActualDate(e.target.value)}
                    className="w-full p-2 rounded-lg border border-[#C7C1C0] bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#3A3534] block mb-1">חודשי הכנה:</label>
                  <input
                    type="number"
                    min="0"
                    max="12"
                    value={editPrepMonths}
                    onChange={(e) => setEditPrepMonths(Number(e.target.value))}
                    className="w-full p-2 rounded-lg border border-[#C7C1C0] bg-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#3A3534] block mb-1">הערה קצרה:</label>
                  <input
                    type="text"
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    className="w-full p-2 rounded-lg border border-[#C7C1C0] bg-white"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setIsEditingEvent(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-[#6B6362] hover:bg-white/60"
                >
                  ביטול
                </button>
                <button
                  type="button"
                  onClick={handleSaveEventEdits}
                  className="px-4 py-1.5 rounded-lg bg-[#3A3534] text-white text-xs font-bold xtra-sticker-shadow-sm"
                >
                  שמירת שינויים
                </button>
              </div>
            </div>
          )}

          {/* TAB 1: Tasks & Checklist */}
          {activeTab === 'tasks' && (
            <div className="flex flex-col gap-4">
              {/* Add Task Trigger */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-sm font-extrabold text-[#3A3534]">
                  רשימת משימות לביצוע ({progress.completedTasks}/{progress.totalTasks} הושלמו)
                </span>
                {canEdit && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsAiModalOpen(true)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-full border-2 border-[#3A3534] bg-[#5059FF] hover:bg-[#3D46E6] text-white text-xs font-bold xtra-sticker-shadow-sm cursor-pointer"
                      title="הפקת משימות וצ'קליסט אוטומטיים באמצעות שרת Gemini AI"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>הצע משימות ב-AI</span>
                    </button>
                    <button
                      onClick={() => setShowAddTaskForm(!showAddTaskForm)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-full border-2 border-[#3A3534] bg-[#F7414B] hover:bg-[#DE2A34] text-white text-xs font-bold xtra-sticker-shadow-sm cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>הוסף משימה</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Add Task Form Drawer */}
              {showAddTaskForm && canEdit && (
                <form
                  onSubmit={handleAddTask}
                  className="bg-[#FAF8F7] border-2 border-[#3A3534] rounded-2xl p-4 flex flex-col gap-3 text-xs"
                >
                  <span className="font-extrabold text-sm text-[#F7414B]">
                    הוספת משימה חדשה
                  </span>

                  <div>
                    <label className="font-bold text-[#3A3534] block mb-1">כותרת המשימה:</label>
                    <input
                      type="text"
                      required
                      placeholder="לדוגמה: אישור תקציב וגרפיקה מול הנהלה..."
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-[#C7C1C0] bg-white font-semibold text-[#3A3534] focus:outline-none focus:border-[#5059FF]"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-[#3A3534] block mb-1">פירוט והנחיות (אופציונלי):</label>
                    <textarea
                      rows={2}
                      placeholder="הנחיות, דגשים לביצוע..."
                      value={newTaskDesc}
                      onChange={(e) => setNewTaskDesc(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-[#C7C1C0] bg-white text-[#3A3534] focus:outline-none focus:border-[#5059FF]"
                    ></textarea>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="font-bold text-[#3A3534] block mb-1">משתמש אחראי (מייל):</label>
                      <select
                        value={newTaskAssignee}
                        onChange={(e) => setNewTaskAssignee(e.target.value)}
                        className="w-full p-2 rounded-xl border border-[#C7C1C0] bg-white font-medium"
                      >
                        {users.map((u) => (
                          <option key={u.id} value={u.email}>
                            {u.name} ({u.email})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="font-bold text-[#3A3534] block mb-1">עדיפות:</label>
                      <select
                        value={newTaskPriority}
                        onChange={(e) => setNewTaskPriority(e.target.value as TaskPriority)}
                        className="w-full p-2 rounded-xl border border-[#C7C1C0] bg-white font-medium"
                      >
                        <option value="low">נמוכה</option>
                        <option value="medium">בינונית</option>
                        <option value="high">גבוהה</option>
                        <option value="urgent">דחופה ביותר</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-bold text-[#3A3534] block mb-1">תאריך יעד:</label>
                      <input
                        type="date"
                        value={newTaskDueDate}
                        onChange={(e) => setNewTaskDueDate(e.target.value)}
                        className="w-full p-2 rounded-xl border border-[#C7C1C0] bg-white font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E6E2E1]">
                    <button
                      type="button"
                      onClick={() => setShowAddTaskForm(false)}
                      className="px-3.5 py-1.5 rounded-full text-xs font-bold text-[#6B6362] hover:bg-[#E6E2E1]"
                    >
                      ביטול
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-full bg-[#F7414B] text-white font-bold text-xs xtra-sticker-shadow-sm"
                    >
                      שמור משימה
                    </button>
                  </div>
                </form>
              )}

              {/* Tasks List */}
              <div className="flex flex-col gap-3">
                {(!event.tasks || event.tasks.length === 0) ? (
                  <div className="p-8 text-center bg-[#FAF8F7] border border-dashed border-[#C7C1C0] rounded-2xl text-xs text-[#9A9291]">
                    טרם נוספו משימות לאירוע זה. לחץ על "הוסף משימה לאירוע" כדי להתחיל.
                  </div>
                ) : (
                  event.tasks.map((task) => {
                    const isDone = task.status === 'done';
                    return (
                      <div
                        key={task.id}
                        className={`p-4 rounded-2xl border-2 transition-all flex flex-col gap-3 ${
                          isDone
                            ? 'bg-[#FAF8F7] border-[#E6E2E1] opacity-75'
                            : 'bg-white border-[#3A3534] xtra-sticker-shadow-sm'
                        }`}
                      >
                        {/* Task Top Row */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            {canEdit ? (
                              <button
                                onClick={() => handleToggleTaskStatus(task.id)}
                                className={`w-5 h-5 rounded-lg border-2 mt-0.5 flex items-center justify-center transition-all cursor-pointer ${
                                  isDone
                                    ? 'bg-[#2FA36B] border-[#2FA36B] text-white'
                                    : 'border-[#3A3534] bg-white hover:bg-[#FAF8F7]'
                                }`}
                              >
                                {isDone && <CheckCircle2 className="w-4 h-4" />}
                              </button>
                            ) : (
                              <span
                                className={`w-4 h-4 rounded-full mt-0.5 ${
                                  isDone ? 'bg-[#2FA36B]' : 'bg-[#C7C1C0]'
                                }`}
                              ></span>
                            )}

                            <div className="flex flex-col">
                              <span
                                className={`text-sm font-bold ${
                                  isDone ? 'line-through text-[#9A9291]' : 'text-[#3A3534]'
                                }`}
                              >
                                {task.title}
                              </span>
                              {task.description && (
                                <p className="text-xs text-[#6B6362] mt-0.5">{task.description}</p>
                              )}
                            </div>
                          </div>

                          {/* Task Meta / Actions */}
                          <div className="flex items-center gap-2 shrink-0">
                            {canEdit && (
                              <select
                                value={task.status}
                                onChange={(e) => handleUpdateTaskStatus(task.id, e.target.value as TaskStatus)}
                                className="text-[11px] font-bold p-1 rounded-lg border border-[#C7C1C0] bg-[#FAF8F7] text-[#3A3534]"
                              >
                                <option value="todo">טרם התחיל</option>
                                <option value="in_progress">בתהליך</option>
                                <option value="ready_kickoff">מוכן להתנעה</option>
                                <option value="done">הושלם</option>
                              </select>
                            )}

                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                task.priority === 'urgent'
                                  ? 'bg-[#FFE7E8] text-[#F7414B]'
                                  : task.priority === 'high'
                                  ? 'bg-[#FFEBE0] text-[#FF732D]'
                                  : 'bg-[#FAF8F7] text-[#6B6362]'
                              }`}
                            >
                              {task.priority === 'urgent'
                                ? 'דחוף'
                                : task.priority === 'high'
                                ? 'גבוה'
                                : task.priority === 'medium'
                                ? 'בינוני'
                                : 'נמוך'}
                            </span>

                            {canEdit && (
                              <button
                                onClick={() => handleDeleteTask(task.id)}
                                className="p-1 rounded text-[#9A9291] hover:text-[#DE2A34] hover:bg-[#FFE7E8]"
                                title="מחיקת משימה"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Assignee & Due Date Sub-bar */}
                        <div className="flex flex-wrap items-center justify-between text-xs text-[#6B6362] border-t border-[#F3F1F0] pt-2">
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 font-semibold text-[#3A3534]">
                              <User className="w-3.5 h-3.5 text-[#5059FF]" />
                              <span>{task.assigneeName}</span>
                            </span>
                            <span className="text-[10px] text-[#9A9291]">({task.assigneeEmail})</span>
                          </div>

                          {task.dueDate && (
                            <div className="flex items-center gap-1 font-mono text-[11px]">
                              <Calendar className="w-3 h-3 text-[#9A9291]" />
                              <span>יעד: {formatDate(task.dueDate)}</span>
                            </div>
                          )}
                        </div>

                        {/* Subtask Checklist */}
                        <div className="bg-[#FAF8F7] rounded-xl p-2.5 border border-[#E6E2E1] flex flex-col gap-1.5">
                          <span className="text-[10px] font-bold text-[#6B6362]">סעיפי ביצוע (Checklist):</span>
                          {task.checklist && task.checklist.length > 0 ? (
                            <div className="flex flex-col gap-1">
                              {task.checklist.map((chk) => (
                                <label
                                  key={chk.id}
                                  className="flex items-center gap-2 text-xs cursor-pointer text-[#3A3534]"
                                >
                                  <input
                                    type="checkbox"
                                    checked={chk.done}
                                    onChange={() => handleToggleChecklistItem(task.id, chk.id)}
                                    disabled={!canEdit}
                                    className="accent-[#2FA36B]"
                                  />
                                  <span className={chk.done ? 'line-through text-[#9A9291]' : ''}>
                                    {chk.text}
                                  </span>
                                </label>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[10px] text-[#9A9291] italic">אין סעיפי צ׳קליסט</span>
                          )}

                          {/* Add Checklist Item Input */}
                          {canEdit && (
                            <div className="mt-1 flex items-center gap-1.5">
                              <input
                                type="text"
                                placeholder="+ הוסף סעיף צ׳קליסט..."
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleAddChecklistItem(task.id, e.currentTarget.value);
                                    e.currentTarget.value = '';
                                  }
                                }}
                                className="flex-1 px-2.5 py-1 text-[11px] rounded-lg border border-[#C7C1C0] bg-white"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Details & Description */}
          {activeTab === 'details' && (
            <div className="flex flex-col gap-4 text-xs">
              <div className="bg-[#FAF8F7] border border-[#E6E2E1] rounded-2xl p-4 flex flex-col gap-3">
                <span className="text-sm font-bold text-[#3A3534]">תיאור האירוע:</span>
                <p className="text-sm text-[#6B6362] leading-relaxed">
                  {event.description || 'לא הוזן תיאור מפורט לאירוע זה.'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-[#FAF8F7] border border-[#E6E2E1] rounded-2xl p-4 flex flex-col gap-2">
                  <span className="font-bold text-[#3A3534]">מועדים וזמנים:</span>
                  <div className="flex flex-col gap-1.5 text-[#6B6362]">
                    <div>תאריך התנעה: <b>{formatDate(event.kickoffDate) || 'לא הוגדר'}</b></div>
                    <div>תאריך אמת: <b>{event.isFloating ? 'במהלך החודש' : formatDate(event.actualDate) || 'לא הוגדר'}</b></div>
                    <div>חודשי הכנה מומלצים: <b>{event.prepMonths} חודשים</b></div>
                    <div>חודש יעד: <b>{event.monthKey}</b></div>
                  </div>
                </div>

                <div className="bg-[#FAF8F7] border border-[#E6E2E1] rounded-2xl p-4 flex flex-col gap-2">
                  <span className="font-bold text-[#3A3534]">מידע נוסף:</span>
                  <div className="flex flex-col gap-1.5 text-[#6B6362]">
                    <div>קטגוריה: <b>{event.category}</b></div>
                    <div>נוצר על ידי: <b>{event.createdBy}</b></div>
                    <div>תאריך יצירה: <b>{event.createdAt}</b></div>
                  </div>
                </div>
              </div>

              {/* Delete Event Button */}
              {canEdit && (
                <div className="pt-4 border-t border-[#E6E2E1] flex justify-end">
                  <button
                    onClick={() => {
                      if (confirm(`האם למחוק את האירוע "${event.title}" וכל המשימות המשויכות אליו?`)) {
                        onDeleteEvent(event.id);
                        onClose();
                      }
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#DE2A34] text-[#DE2A34] hover:bg-[#FFE7E8] font-bold transition-all text-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>מחיקת אירוע זה לצמיתות</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t-2 border-[#3A3534] bg-[#FAF8F7] flex items-center justify-between">
          <span className="text-xs text-[#6B6362]">
            מזהה אירוע: <code className="font-mono text-[11px]">{event.id}</code>
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-full bg-[#3A3534] hover:bg-[#241F1F] text-white font-bold text-xs xtra-sticker-shadow-sm cursor-pointer"
          >
            סגור
          </button>
        </div>
      </div>

      {/* AI Task Generator Modal */}
      {isAiModalOpen && (
        <AIAssistantModal
          isOpen={isAiModalOpen}
          onClose={() => setIsAiModalOpen(false)}
          event={event}
          users={users}
          currentUser={currentUser}
          onAddGeneratedTasks={(tasks) => {
            onUpdateEvent({
              ...event,
              tasks: [...(event.tasks || []), ...tasks]
            });
          }}
        />
      )}
    </div>
  );
};
