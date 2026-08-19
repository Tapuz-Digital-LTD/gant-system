import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Check,
  Pencil,
  Sparkles,
  MessageSquare,
  ListChecks,
  Info,
  AlertTriangle,
  X
} from 'lucide-react';
import { EventItem, TaskItem, UserAccess, TaskStatus, EventCategory, isFloating } from '../types';
import type { EventInput, TaskInput } from '../services/api';
import { useComments } from '../hooks/useBoardData';
import { formatDate, calculateEventProgress } from '../utils/dateHelpers';
import { CATEGORY_META, STATUS_META, PRIORITY_META, isOverdue, avatarColor } from '../utils/eventMeta';
import {
  Modal,
  Button,
  Badge,
  StatusPill,
  Dot,
  Field,
  Input,
  Textarea,
  Select,
  Tooltip,
  cn
} from './ui';
import { AIAssistantModal } from './AIAssistantModal';

interface EventDetailModalProps {
  event: EventItem;
  users: UserAccess[];
  currentUser: UserAccess;
  onClose: () => void;
  onUpdateEvent: (changes: Partial<EventInput>) => void;
  onDeleteEvent: () => void;
  onCreateTask: (input: TaskInput) => void;
  onUpdateTask: (id: string, version: number, changes: Partial<TaskInput>) => void;
  onDeleteTask: (id: string) => void;
  onCreateComment: (body: string) => void;
}

type Tab = 'tasks' | 'details' | 'comments';

const CATEGORY_OPTIONS: EventCategory[] = ['holiday', 'campaign', 'b2b', 'social', 'operational', 'other'];

export const EventDetailModal: React.FC<EventDetailModalProps> = ({
  event,
  users,
  currentUser,
  onClose,
  onUpdateEvent,
  onDeleteEvent,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onCreateComment
}) => {
  const [tab, setTab] = useState<Tab>('tasks');
  const [editing, setEditing] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [comment, setComment] = useState('');

  const canEdit = currentUser.role === 'admin' || currentUser.role === 'editor';
  const tasks = event.tasks ?? [];
  const progress = calculateEventProgress(event);
  const cat = CATEGORY_META[event.category];
  const userNames = new Map(users.map((u) => [u.id, u.name]));

  const commentsQuery = useComments(tab === 'comments' ? event.id : undefined);
  const comments = commentsQuery.data ?? [];

  /** One field, one Enter — replaces the old five-click form. */
  const addQuickTask = (e: React.FormEvent) => {
    e.preventDefault();
    const title = quickTitle.trim();
    if (!title) return;
    onCreateTask({ title, dueDate: event.kickoffDate });
    setQuickTitle('');
  };

  const addComment = (e: React.FormEvent) => {
    e.preventDefault();
    const text = comment.trim();
    if (!text) return;
    onCreateComment(text);
    setComment('');
  };

  const TABS: { id: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { id: 'tasks', label: 'משימות', icon: ListChecks, count: tasks.length },
    { id: 'details', label: 'פרטים', icon: Info },
    { id: 'comments', label: 'תגובות', icon: MessageSquare }
  ];

  return (
    <>
      <Modal
        open
        onOpenChange={(o) => !o && onClose()}
        size="lg"
        title={event.title}
        description={`${cat.label} · ${
          event.kickoffDate ? `תאריך תאריך התנעה: ${formatDate(event.kickoffDate)}` : 'אין תאריך תאריך התנעה'
        }${
          event.actualDate
            ? ` · תאריך אמת ${isFloating(event) ? 'במהלך החודש' : formatDate(event.actualDate)}`
            : ''
        }`}
        footer={
          <>
            {canEdit &&
              (confirmDelete ? (
                <div className="me-auto flex items-center gap-2">
                  <span className="text-sm text-ink-secondary">להעביר את האירוע לארכיון?</span>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                    בטל שינוי בשם הלוח
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={onDeleteEvent}
                  >
                    העבר לארכיון
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" className="me-auto" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-5 w-5" />
                  העבר לארכיון
                </Button>
              ))}
            <Button variant="secondary" onClick={onClose}>
              סגור
            </Button>
          </>
        }
      >
        {/* summary strip */}
        <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-lg bg-canvas px-3 py-2.5">
          <Badge tone="neutral">
            <Dot className={cat.dot} />
            {cat.label}
          </Badge>
          <Badge tone="neutral">הכנה {event.prepMonths} ח׳</Badge>
          {progress.totalTasks > 0 && (
            <>
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full', progress.percentage === 100 ? 'bg-done' : 'bg-primary')}
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>
              <span className="text-sm text-ink-secondary tnum">
                {progress.completedTasks}/{progress.totalTasks} הושלמו
              </span>
            </>
          )}
          {canEdit && (
            <Button variant="ghost" size="sm" className="ms-auto" onClick={() => setEditing((v) => !v)}>
              <Pencil className="h-5 w-5" />
              {editing ? 'סיים ערוך' : 'ערוך'}
            </Button>
          )}
        </div>

        {/* tabs */}
        <div className="mb-3 flex items-center gap-1 border-b border-line" role="tablist">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={cn(
                  'relative flex items-center gap-2 px-3 py-2 text-base font-semibold transition-colors',
                  active ? 'text-primary' : 'text-ink-tertiary hover:text-ink-secondary'
                )}
              >
                <Icon className="h-5 w-5" />
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className="text-xs text-ink-tertiary tnum">{t.count}</span>
                )}
                {active && <span className="absolute inset-x-2 -bottom-px h-[3px] rounded-t-full bg-primary" />}
              </button>
            );
          })}
        </div>

        {tab === 'tasks' && (
          <div className="flex flex-col gap-1">
            {canEdit && (
              <form onSubmit={addQuickTask} className="mb-2 flex gap-2">
                <Input
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  placeholder="אישור תקציב"
                  aria-label="הוסף משימה חדשה"
                />
                <Button type="submit" variant="primary" disabled={!quickTitle.trim()}>
                  <Plus className="h-5 w-5" />
                  הוספה
                </Button>
                <Tooltip label="קבל הצעות למשימות">
                  <Button variant="secondary" iconOnly onClick={() => setAiOpen(true)} aria-label="קבל הצעות למשימות">
                    <Sparkles className="h-5 w-5" />
                  </Button>
                </Tooltip>
              </form>
            )}

            {tasks.length === 0 ? (
              <p className="py-8 text-center text-base text-ink-tertiary">
                אין עדיין משימות. התחל בשורה שלמעלה.
              </p>
            ) : (
              tasks.map((task) => {
                const done = task.status === 'done';
                const late = isOverdue(task.dueDate, task.status);
                const prio = PRIORITY_META[task.priority];

                return (
                  <div
                    key={task.id}
                    className="group flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-canvas"
                  >
                    <button
                      onClick={() =>
                        canEdit && onUpdateTask(task.id, task.version, { status: done ? 'todo' : 'done' })
                      }
                      disabled={!canEdit}
                      aria-label={done ? 'סמן את המשימה כלא הושלמה' : 'סמן את המשימה כהושלמה'}
                      className={cn(
                        'grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors',
                        done ? 'border-done bg-done text-white' : 'border-line-strong bg-surface hover:border-primary',
                        !canEdit && 'cursor-not-allowed opacity-60'
                      )}
                    >
                      {done && <Check className="h-4.5 w-4.5" strokeWidth={3} />}
                    </button>

                    <span className={cn('min-w-0 flex-1 text-base', done ? 'text-ink-tertiary line-through' : 'text-ink')}>
                      {task.title}
                    </span>

                    {late && (
                      <Tooltip label="המשימה באיחור">
                        <AlertTriangle className="h-5 w-5 shrink-0 text-late" />
                      </Tooltip>
                    )}
                    {(task.priority === 'urgent' || task.priority === 'high') && !done && (
                      <Badge tone={prio.tone}>{prio.label}</Badge>
                    )}

                    {canEdit ? (
                      <Select
                        value={task.status}
                        onChange={(e) =>
                          onUpdateTask(task.id, task.version, { status: e.target.value as TaskStatus })
                        }
                        aria-label={`שנה את המצב של ${task.title}`}
                        className="h-8 w-36 shrink-0 text-sm"
                      >
                        {(Object.keys(STATUS_META) as TaskStatus[]).map((s) => (
                          <option key={s} value={s}>
                            {STATUS_META[s].label}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <StatusPill fill={STATUS_META[task.status].fill}>{STATUS_META[task.status].label}</StatusPill>
                    )}

                    {task.assigneeId && (
                      <Tooltip label={userNames.get(task.assigneeId) ?? 'המצב לא ידוע'}>
                        <span
                          className={cn(
                            'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white',
                            avatarColor(task.assigneeId)
                          )}
                        >
                          {(userNames.get(task.assigneeId) ?? '?').charAt(0)}
                        </span>
                      </Tooltip>
                    )}

                    {task.dueDate && (
                      <span className={cn('w-16 shrink-0 text-sm tnum', late ? 'font-semibold text-late' : 'text-ink-tertiary')}>
                        {formatDate(task.dueDate)}
                      </span>
                    )}

                    {canEdit && (
                      <button
                        onClick={() => onDeleteTask(task.id)}
                        aria-label={`מחק את המשימה ${task.title}`}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-tertiary opacity-0 transition hover:bg-late-soft hover:text-late focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === 'details' && (
          <div className="flex flex-col gap-4">
            {editing && canEdit ? (
              <>
                <Field label="שם האירוע" required htmlFor="ev-title">
                  <Input id="ev-title" onBlur={(e) => e.target.value !== event.title && onUpdateEvent({ title: e.target.value })}
                    defaultValue={event.title} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="קטגוריה" htmlFor="ev-cat">
                    <Select
                      id="ev-cat"
                      value={event.category}
                      onChange={(e) => onUpdateEvent({ category: e.target.value as EventCategory })}
                    >
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_META[c].label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="חודשי הכנה" hint="חודשי הכנה" htmlFor="ev-prep">
                    <Input
                      id="ev-prep"
                      type="number"
                      min={0}
                      max={12}
                      value={event.prepMonths}
                      onChange={(e) => onUpdateEvent({ prepMonths: Number(e.target.value) || 0 })}
                    />
                  </Field>
                  <Field label="תאריך תאריך התנעה" hint="עלייה לאוויר" htmlFor="ev-kick">
                    <Input
                      id="ev-kick"
                      type="date"
                      defaultValue={event.kickoffDate ?? ''}
                      onChange={(e) => onUpdateEvent({ kickoffDate: e.target.value || null })}
                    />
                  </Field>
                  <Field label="תאריך אמת" hint="מועד האירוע" htmlFor="ev-actual">
                    <Input
                      id="ev-actual"
                      type="date"
                      defaultValue={isFloating(event) ? '' : event.actualDate}
                      onChange={(e) => e.target.value && onUpdateEvent({ actualDate: e.target.value, actualPrecision: 'day' })}
                    />
                  </Field>
                </div>
                <Field label="הערה" htmlFor="ev-note">
                  <Input id="ev-note" defaultValue={event.note ?? ''} onBlur={(e) => e.target.value !== (event.note ?? '') && onUpdateEvent({ note: e.target.value })} />
                </Field>
                <Field label="תיאור" htmlFor="ev-desc">
                  <Textarea
                    id="ev-desc"
                    rows={4}
                    defaultValue={event.description ?? ''}
                    onBlur={(e) => e.target.value !== (event.description ?? '') && onUpdateEvent({ description: e.target.value })}
                  />
                </Field>
              </>
            ) : (
              <dl className="flex flex-col gap-3">
                {[
                  ['קטגוריה', cat.label],
                  ['תאריך תאריך התנעה', event.kickoffDate ? formatDate(event.kickoffDate) : '—'],
                  [
                    'תאריך אמת',
                    isFloating(event) ? 'במהלך החודש' : formatDate(event.actualDate)
                  ],
                  ['חודשי הכנה', `${event.prepMonths}`],
                  ['הערה', event.note || '—'],
                  ['תיאור', event.description || '—'],
                  ['נוצר', formatDate(event.createdAt.slice(0, 10))]
                ].map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[8rem_1fr] gap-3">
                    <dt className="text-sm text-ink-tertiary">{label}</dt>
                    <dd className="text-base text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}

        {tab === 'comments' && (
          <div className="flex flex-col gap-3">
            {commentsQuery.isLoading && <p className="py-6 text-center text-base text-ink-tertiary">טוען…</p>}
            {!commentsQuery.isLoading && comments.length === 0 && (
              <p className="py-6 text-center text-base text-ink-tertiary">עוד אין תגובות</p>
            )}
            {comments.map((c) => (
              <div key={c.id} className="flex gap-2.5">
                <span
                  className={cn(
                    'grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white',
                    avatarColor(c.authorId ?? 'anon')
                  )}
                >
                  {(c.authorName ?? '?').charAt(0)}
                </span>
                <div className="min-w-0 flex-1 rounded-lg bg-canvas px-3 py-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-ink">{c.authorName ?? 'המצב לא ידוע'}</span>
                    <span className="text-xs text-ink-tertiary tnum">{formatDate(c.createdAt.slice(0, 10))}</span>
                  </div>
                  <p className="text-base text-ink-secondary">{c.body}</p>
                </div>
              </div>
            ))}
            {canEdit && (
              <form onSubmit={addComment} className="flex gap-2">
                <Input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="מחכים לאישור מהספק"
                  aria-label="הוסף תגובה חדשה"
                />
                <Button type="submit" variant="primary" disabled={!comment.trim()}>
                  שליחה
                </Button>
              </form>
            )}
          </div>
        )}

      </Modal>

      {aiOpen && (
        <AIAssistantModal
          isOpen={aiOpen}
          onClose={() => setAiOpen(false)}
          event={event}
          onAddGeneratedTasks={(generated) => generated.forEach(onCreateTask)}
        />
      )}
    </>
  );
};
