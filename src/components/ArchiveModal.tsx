import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, Archive, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../services/api';
import { EventItem, isFloating } from '../types';
import { formatDate } from '../utils/dateHelpers';
import { CATEGORY_META } from '../utils/eventMeta';
import { Modal, Button, Dot, useToast, cn } from './ui';
import { NoPermission } from './NoPermission';
import { describeError } from '../hooks/useBoardData';

/** Deleting archives; this is where the archive can be seen and undone. */
export function ArchiveModal({
  isOpen,
  onClose,
  boardId,
  canEdit
}: {
  isOpen: boolean;
  onClose: () => void;
  boardId: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const { notify } = useToast();

  const archived = useQuery({
    queryKey: ['archive', boardId],
    queryFn: () => api.events.listArchived(boardId),
    enabled: isOpen
  });

  const restore = useMutation({
    mutationFn: api.events.restore,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['archive', boardId] });
      qc.invalidateQueries({ queryKey: ['events'] });
      qc.invalidateQueries({ queryKey: ['boards'] });
      notify('success', 'האירוע שוחזר');
    },
    onError: (e) => notify('error', describeError(e))
  });

  const items: EventItem[] = archived.data ?? [];

  return (
    <Modal
      open={isOpen}
      onOpenChange={(o) => !o && onClose()}
      title="ארכיון"
      description="כאן נמצאים אירועים שהעברת לארכיון. אפשר לשחזר אותם בכל זמן"
      footer={
        <Button variant="secondary" onClick={onClose}>
          סגור
        </Button>
      }
    >
      {archived.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-ink-tertiary">
          <Loader2 className="h-5 w-5 animate-spin" />
          טוען…
        </div>
      ) : archived.isError ? (
        // A failed request must never look like an empty archive — that is how
        // someone concludes their data is gone when it is merely unreachable.
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <AlertCircle className="h-6 w-6 text-late" />
          <p className="text-base font-semibold text-ink">לא הצלחנו לפתוח את הארכיון. נסה שוב</p>
          <p className="max-w-xs text-sm text-ink-tertiary">{describeError(archived.error)}</p>
          <Button variant="secondary" size="sm" onClick={() => archived.refetch()} className="mt-1">
            ניסיון חוזר
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Archive className="h-6 w-6 text-ink-disabled" />
          <p className="text-base font-semibold text-ink">הארכיון ריק</p>
          <p className="text-sm text-ink-tertiary">אירועים שתעביר לארכיון יופיעו כאן ותוכל לשחזר אותם</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((ev) => {
            const cat = CATEGORY_META[ev.category];
            return (
              <li
                key={ev.id}
                className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5"
              >
                <Dot className={cn('shrink-0', cat.dot)} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-base font-semibold text-ink">{ev.title}</span>
                  <span className="text-sm text-ink-tertiary tnum">
                    {isFloating(ev) ? `${ev.actualDate.slice(0, 7)} · במהלך החודש` : formatDate(ev.actualDate)}
                  </span>
                </div>
                {canEdit && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => restore.mutate(ev.id)}
                    disabled={restore.isPending}
                  >
                    <ArchiveRestore className="h-5 w-5" />
                    שחזור
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
