import React, { useState } from 'react';
import {
  AlignLeft,
  Check,
  CheckSquare,
  Clock,
  ExternalLink,
  History,
  Link2,
  Loader2,
  MessageSquare,
  Plus,
  Trash2,
  X
} from 'lucide-react';
import { TaskStatus, UserAccess } from '../types';
import {
  useAttachments,
  useChecklist,
  useTaskCardMutations,
  useTaskComments,
  useTaskDetail
} from '../hooks/useBoardData';
import { STATUS_META, PRIORITY_META } from '../utils/eventMeta';
import { formatDate } from '../utils/dateHelpers';
import { AssigneePicker } from './EventDetailModal';
import {
  Badge,
  Button,
  Input,
  Menu,
  MenuItem,
  Modal,
  StatusPill,
  Textarea,
  Tooltip,
  cn
} from './ui';

/**
 * One task, opened.
 *
 * The list a task lives in can only ever show a line of it — a name, an owner,
 * a date. Everything that makes it a piece of work rather than a line to tick
 * is here: what it actually means, the steps it breaks into, the material
 * somebody needs to do it, the conversation about it, and what has happened to
 * it so far.
 *
 * The properties sit in a narrow column and the work fills the rest. That is
 * the ratio of how often each is read: an owner and a date are glanced at, a
 * description and a checklist are worked from.
 */
export function TaskPanel({
  taskId,
  users,
  canEdit,
  onClose,
  onOpenEvent
}: {
  taskId: string;
  users: UserAccess[];
  canEdit: boolean;
  onClose: () => void;
  onOpenEvent?: (eventId: string) => void;
}) {
  const detail = useTaskDetail(taskId);
  const m = useTaskCardMutations(taskId);
  const task = detail.data;

  const save = (changes: Parameters<typeof m.save.mutate>[0]['changes']) => {
    if (!task) return;
    m.save.mutate({ version: task.version, changes });
  };

  return (
    <Modal
      open
      onOpenChange={(next) => !next && onClose()}
      size="lg"
      title={task?.title ?? 'משימה'}
      description={
        task ? `${task.board.name} · ${task.event.title}` : undefined
      }
      footer={
        <Button variant="secondary" onClick={onClose}>
          סגור
        </Button>
      }
    >
      {!task ? (
        <div className="grid place-items-center py-16 text-ink-tertiary" role="status">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
          <span className="sr-only">טוען…</span>
        </div>
      ) : (
        <div className="flex flex-col gap-5 lg:flex-row-reverse">
          {/* ------------------------------------------------- the properties */}
          <aside className="flex shrink-0 flex-col gap-3 lg:w-52">
            <Property label="מצב">
              {canEdit ? (
                <Menu
                  align="end"
                  trigger={
                    <button
                      aria-label={`מצב: ${STATUS_META[task.status].label}. לחץ לשינוי`}
                      className="rounded-full transition hover:brightness-95"
                    >
                      <StatusPill fill={STATUS_META[task.status].fill}>
                        {STATUS_META[task.status].label}
                      </StatusPill>
                    </button>
                  }
                >
                  {(Object.keys(STATUS_META) as TaskStatus[]).map((next) => (
                    <MenuItem key={next} active={next === task.status} onSelect={() => save({ status: next })}>
                      <StatusPill fill={STATUS_META[next].fill}>{STATUS_META[next].label}</StatusPill>
                    </MenuItem>
                  ))}
                </Menu>
              ) : (
                <StatusPill fill={STATUS_META[task.status].fill}>
                  {STATUS_META[task.status].label}
                </StatusPill>
              )}
            </Property>

            <Property label="אחראי">
              <div className="flex items-center gap-2">
                <AssigneePicker
                  users={users}
                  assigneeId={task.assigneeId}
                  canEdit={canEdit}
                  taskTitle={task.title}
                  onChange={(assigneeId) => save({ assigneeId })}
                />
                <span className="truncate text-base text-ink-secondary">
                  {task.assigneeName ?? 'לא שויך'}
                </span>
              </div>
            </Property>

            <Property label="תאריך יעד">
              <Input
                type="date"
                value={task.dueDate ?? ''}
                disabled={!canEdit}
                onChange={(e) => save({ dueDate: e.target.value || null })}
                aria-label="תאריך יעד"
                className="h-9 text-sm"
              />
            </Property>

            <Property label="עדיפות">
              {canEdit ? (
                <Menu
                  align="end"
                  trigger={
                    <button aria-label={`עדיפות: ${PRIORITY_META[task.priority].label}`} className="rounded-md">
                      <Badge tone={PRIORITY_META[task.priority].tone}>
                        {PRIORITY_META[task.priority].label}
                      </Badge>
                    </button>
                  }
                >
                  {(Object.keys(PRIORITY_META) as (keyof typeof PRIORITY_META)[]).map((p) => (
                    <MenuItem key={p} active={p === task.priority} onSelect={() => save({ priority: p })}>
                      <Badge tone={PRIORITY_META[p].tone}>{PRIORITY_META[p].label}</Badge>
                    </MenuItem>
                  ))}
                </Menu>
              ) : (
                <Badge tone={PRIORITY_META[task.priority].tone}>{PRIORITY_META[task.priority].label}</Badge>
              )}
            </Property>

            {/* Where it belongs, and a way to get there. */}
            <Property label="שייך ל">
              <button
                onClick={() => onOpenEvent?.(task.event.id)}
                disabled={!onOpenEvent}
                className="text-start text-base text-primary hover:underline disabled:text-ink-secondary disabled:no-underline"
              >
                {task.event.title}
              </button>
              <p className="mt-0.5 text-sm text-ink-tertiary">{task.board.name}</p>
            </Property>

            {task.creatorName && (
              <p className="pt-1 text-sm text-ink-tertiary">נפתחה על ידי {task.creatorName}</p>
            )}
          </aside>

          {/* ------------------------------------------------------- the work */}
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            <Description value={task.description ?? ''} canEdit={canEdit} onSave={(d) => save({ description: d })} />
            <Checklist taskId={taskId} canEdit={canEdit} />
            <Attachments taskId={taskId} canEdit={canEdit} />
            <Conversation taskId={taskId} canEdit={canEdit} />
            <HistoryList entries={task.history} />
          </div>
        </div>
      )}
    </Modal>
  );
}

function Property({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-ink-tertiary">{label}</span>
      {children}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  action,
  children
}: {
  icon: typeof AlignLeft;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4.5 w-4.5 text-ink-tertiary" aria-hidden="true" />
        <h3 className="text-base font-bold text-ink">{title}</h3>
        <div className="flex-1" />
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * What the task actually means.
 *
 * Saved on blur rather than behind a button: an explanation somebody types and
 * then loses to a missed click is the reason people stop writing them.
 */
function Description({
  value,
  canEdit,
  onSave
}: {
  value: string;
  canEdit: boolean;
  onSave: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  React.useEffect(() => setDraft(value), [value]);

  return (
    <Section icon={AlignLeft} title="מה צריך לעשות">
      {canEdit ? (
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== value && onSave(draft.trim())}
          rows={3}
          placeholder="הסבר קצר: מה בדיוק צריך לקרות, ומה נחשב גמור."
          aria-label="תיאור המשימה"
        />
      ) : (
        <p className="whitespace-pre-wrap text-base text-ink-secondary">{value || 'אין תיאור.'}</p>
      )}
    </Section>
  );
}

function Checklist({ taskId, canEdit }: { taskId: string; canEdit: boolean }) {
  const { data: items = [] } = useChecklist(taskId);
  const m = useTaskCardMutations(taskId);
  const [text, setText] = useState('');

  const done = items.filter((i) => i.done).length;

  return (
    <Section
      icon={CheckSquare}
      title="שלבים"
      action={
        items.length > 0 && (
          <span className="text-sm text-ink-tertiary tnum">
            {done}/{items.length}
          </span>
        )
      }
    >
      {items.length > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div
            className={cn('h-full rounded-full transition-all', done === items.length ? 'bg-done' : 'bg-primary')}
            style={{ width: `${(done / items.length) * 100}%` }}
          />
        </div>
      )}

      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.id} className="group flex items-center gap-2.5 py-1.5">
            <button
              onClick={() => canEdit && m.setStep.mutate({ id: item.id, done: !item.done })}
              disabled={!canEdit}
              aria-label={item.done ? `בטל סימון: ${item.text}` : `סמן כבוצע: ${item.text}`}
              className={cn(
                'grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors',
                item.done ? 'border-done bg-done text-white' : 'border-line-strong bg-surface hover:border-primary'
              )}
            >
              {item.done && <Check className="h-4 w-4" strokeWidth={3} />}
            </button>
            <span className={cn('flex-1 text-base', item.done ? 'text-ink-tertiary line-through' : 'text-ink')}>
              {item.text}
            </span>
            {canEdit && (
              <button
                onClick={() => m.removeStep.mutate(item.id)}
                aria-label={`מחק שלב: ${item.text}`}
                className="grid h-6 w-6 shrink-0 place-items-center rounded text-ink-tertiary opacity-0 transition hover:bg-late-soft hover:text-late focus-visible:opacity-100 group-hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            m.addStep.mutate(text.trim());
            setText('');
          }}
          className="flex gap-2"
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="הוסף שלב"
            aria-label="שלב חדש"
            className="h-9 text-sm"
          />
          <Button type="submit" variant="secondary" size="sm" disabled={!text.trim()}>
            <Plus className="h-4.5 w-4.5" />
            הוסף
          </Button>
        </form>
      )}
    </Section>
  );
}

/**
 * The material somebody needs in order to do the work.
 *
 * Links today: a brief in Drive, a folder, a spec. That is where this material
 * already lives, so a link needs nothing new and works the moment it is pasted.
 */
function Attachments({ taskId, canEdit }: { taskId: string; canEdit: boolean }) {
  const { data: links = [] } = useAttachments(taskId);
  const m = useTaskCardMutations(taskId);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');

  return (
    <Section icon={Link2} title="חומרים וקישורים">
      {links.length === 0 && !canEdit && <p className="text-base text-ink-tertiary">אין חומרים מצורפים.</p>}

      <ul className="flex flex-col gap-1">
        {links.map((link) => (
          <li key={link.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-canvas">
            <ExternalLink className="h-4.5 w-4.5 shrink-0 text-ink-tertiary" aria-hidden="true" />
            <a
              href={link.url}
              target="_blank"
              // noreferrer as well as noopener: the target page should not be
              // told which of our screens sent somebody to it.
              rel="noopener noreferrer"
              className="min-w-0 flex-1 truncate text-base text-primary hover:underline"
            >
              {link.title}
            </a>
            {link.addedByName && (
              <span className="hidden shrink-0 text-sm text-ink-tertiary sm:inline">{link.addedByName}</span>
            )}
            {canEdit && (
              <button
                onClick={() => m.removeLink.mutate(link.id)}
                aria-label={`הסר קישור: ${link.title}`}
                className="grid h-6 w-6 shrink-0 place-items-center rounded text-ink-tertiary opacity-0 transition hover:bg-late-soft hover:text-late focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!url.trim()) return;
            m.addLink.mutate({ url: url.trim(), title: title.trim() || undefined });
            setUrl('');
            setTitle('');
          }}
          className="flex flex-wrap gap-2"
        >
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            dir="ltr"
            aria-label="כתובת הקישור"
            className="h-9 min-w-48 flex-1 text-start text-sm"
          />
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="שם (לא חובה)"
            aria-label="שם הקישור"
            className="h-9 max-w-40 text-sm"
          />
          <Button type="submit" variant="secondary" size="sm" disabled={!url.trim()}>
            <Plus className="h-4.5 w-4.5" />
            צרף
          </Button>
        </form>
      )}

      {m.addLink.isError && (
        <p role="alert" className="text-sm text-late">
          הקישור צריך להתחיל ב-http או https.
        </p>
      )}
    </Section>
  );
}

function Conversation({ taskId, canEdit }: { taskId: string; canEdit: boolean }) {
  const { data: comments = [] } = useTaskComments(taskId);
  const m = useTaskCardMutations(taskId);
  const [text, setText] = useState('');

  return (
    <Section icon={MessageSquare} title="שיחה">
      <ul className="flex flex-col gap-2.5">
        {comments.map((c) => (
          <li key={c.id} className="rounded-lg bg-canvas px-3 py-2">
            <p className="text-base text-ink">{c.body}</p>
            <p className="mt-1 text-sm text-ink-tertiary">
              {c.authorName ?? 'מישהו'} · {formatDate(c.createdAt.slice(0, 10))}
            </p>
          </li>
        ))}
      </ul>

      {canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            m.addComment.mutate(text.trim());
            setText('');
          }}
          className="flex gap-2"
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="שאלה, עדכון, או משהו שכדאי שיידעו"
            aria-label="תגובה חדשה"
            className="h-9 text-sm"
          />
          <Button type="submit" variant="secondary" size="sm" disabled={!text.trim()}>
            שלח
          </Button>
        </form>
      )}
    </Section>
  );
}

/**
 * What has happened to this task.
 *
 * Closed by default: it answers a question people ask occasionally and never
 * on the way in, so it should not push the work down the screen.
 */
function HistoryList({
  entries
}: {
  entries: { id: string; action: string; at: string; by: string | null; changed: string[] }[];
}) {
  const [open, setOpen] = useState(false);

  const describe = (entry: { action: string; changed: string[] }) => {
    if (entry.action === 'created') return 'פתח את המשימה';
    if (entry.action === 'attachment_added') return 'צירף קישור';
    if (entry.action === 'attachment_removed') return 'הסיר קישור';
    if (entry.changed.length > 0) return `שינה ${entry.changed.join(', ')}`;
    return 'עדכן את המשימה';
  };

  return (
    <Section
      icon={History}
      title="היסטוריה"
      action={
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="text-sm text-primary hover:underline">
          {open ? 'הסתר' : `הצג (${entries.length})`}
        </button>
      }
    >
      {open && (
        <ol className="flex flex-col gap-1.5">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2 text-sm text-ink-secondary">
              <Clock className="h-3.5 w-3.5 shrink-0 text-ink-disabled" aria-hidden="true" />
              <b className="font-semibold text-ink">{entry.by ?? 'מישהו'}</b>
              {describe(entry)}
              <Tooltip label={new Date(entry.at).toLocaleString('he-IL')}>
                <span className="text-ink-tertiary">· {formatDate(entry.at.slice(0, 10))}</span>
              </Tooltip>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
