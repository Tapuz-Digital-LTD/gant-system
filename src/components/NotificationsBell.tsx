import React from 'react';
import { Bell, Check, CheckCheck, ClipboardCheck, Clock, Snowflake, UserPlus, X } from 'lucide-react';
import { AppNotification, NotificationKind } from '../types';
import { useNotifications, useNotificationMutations } from '../hooks/useBoardData';
import { Button, Popover, cn } from './ui';

/**
 * The inbox, behind one bell.
 *
 * It shows what happened and lets a person act on it or throw it away — it is
 * not a second place to manage anything. Every row is a link to the thing
 * itself, because a notification whose only outcome is "now go and find it" is
 * a chore rather than news.
 *
 * The count is unread items, and it is absent rather than zero: a badge showing
 * "0" is a thing to check, and there is nothing to check.
 */

const KIND_META: Record<NotificationKind, { icon: typeof Bell; tone: string }> = {
  task_assigned: { icon: UserPlus, tone: 'bg-primary-soft text-primary' },
  task_due_soon: { icon: Clock, tone: 'bg-progress-soft text-progress' },
  task_overdue: { icon: Clock, tone: 'bg-late-soft text-late' },
  task_stalled: { icon: ClipboardCheck, tone: 'bg-ms-review-soft text-ms-review' },
  milestone_soon: { icon: Snowflake, tone: 'bg-ms-freeze-soft text-ms-freeze' }
};

/**
 * "לפני 5 דקות" beats a timestamp for anything that happened today.
 * Hebrew counts one of a thing by naming it, not by writing "1" in front of it.
 */
function ago(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'הרגע';
  if (minutes === 1) return 'לפני דקה';
  if (minutes < 60) return `לפני ${minutes} דקות`;

  const hours = Math.round(minutes / 60);
  if (hours === 1) return 'לפני שעה';
  if (hours < 24) return `לפני ${hours} שעות`;

  const days = Math.round(hours / 24);
  if (days === 1) return 'אתמול';
  if (days === 2) return 'שלשום';
  if (days < 30) return `לפני ${days} ימים`;
  return new Date(iso).toLocaleDateString('he-IL');
}

export function NotificationsBell({ onOpenLink }: { onOpenLink: (link: string) => void }) {
  const query = useNotifications();
  const { markRead, remove } = useNotificationMutations();

  const items = query.data?.items ?? [];
  const unread = query.data?.unread ?? 0;

  return (
    <Popover
      className="w-[22rem] p-0"
      trigger={
        <Button
          variant="ghost"
          size="md"
          iconOnly
          aria-label={unread > 0 ? `התראות — ${unread} חדשות` : 'התראות'}
          className="relative"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span
              className="absolute -top-0.5 end-0 grid min-w-4.5 place-items-center rounded-full bg-late px-1 text-[0.625rem] font-bold text-white tnum"
              aria-hidden="true"
            >
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      }
    >
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="text-sm font-bold text-ink">התראות</span>
        {unread > 0 && (
          <Button variant="ghost" size="sm" className="h-7 px-1.5" onClick={() => markRead.mutate(undefined)}>
            <CheckCheck className="h-4 w-4" />
            סמן הכול כנקרא
          </Button>
        )}
      </div>

      <div className="max-h-96 overflow-y-auto">
        {query.isLoading ? (
          <p className="px-3 py-8 text-center text-base text-ink-tertiary">טוען…</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-4 py-10 text-center">
            <Check className="h-6 w-6 text-ink-disabled" aria-hidden="true" />
            <p className="text-base font-semibold text-ink">אין התראות חדשות</p>
            <p className="text-sm text-ink-tertiary">כשמשהו ידרוש את תשומת ליבך, הוא יופיע כאן.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <NotificationRow
                key={item.id}
                item={item}
                onOpen={() => {
                  if (!item.readAt) markRead.mutate(item.id);
                  if (item.link) onOpenLink(item.link);
                }}
                onDismiss={() => remove.mutate(item.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </Popover>
  );
}

function NotificationRow({
  item,
  onOpen,
  onDismiss
}: {
  item: AppNotification;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const meta = KIND_META[item.kind] ?? KIND_META.task_assigned;
  const Icon = meta.icon;
  const unread = !item.readAt;

  return (
    <li className={cn('group flex items-start gap-2.5 px-3 py-2.5', unread && 'bg-primary-soft/40')}>
      <span className={cn('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg', meta.tone)}>
        <Icon className="h-4.5 w-4.5" aria-hidden="true" />
      </span>

      <button onClick={onOpen} className="min-w-0 flex-1 text-start">
        <span className={cn('block text-base', unread ? 'font-bold text-ink' : 'font-semibold text-ink-secondary')}>
          {item.title}
        </span>
        {item.body && <span className="block truncate text-sm text-ink-secondary">{item.body}</span>}
        <span className="block text-xs text-ink-tertiary">{ago(item.createdAt)}</span>
      </button>

      <button
        onClick={onDismiss}
        aria-label={`הסר את ההתראה: ${item.title}`}
        className="grid h-6 w-6 shrink-0 place-items-center rounded text-ink-tertiary opacity-0 transition hover:bg-subtle hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </li>
  );
}
