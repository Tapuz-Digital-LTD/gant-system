import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, Archive, Loader2, AlertCircle, Trash2, TriangleAlert } from 'lucide-react';
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
  canEdit,
  canPurge
}: {
  isOpen: boolean;
  onClose: () => void;
  boardId: string;
  canEdit: boolean;
  /** Deleting for good is its own capability, off for editors by default. */
  canPurge: boolean;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
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

  const purge = useMutation({
    mutationFn: api.events.purge,
    onSuccess: (result) => {
      setConfirming(null);
      qc.invalidateQueries({ queryKey: ['archive', boardId] });
      qc.invalidateQueries({ queryKey: ['boards'] });
      notify('success', `«${result.title}» נמחק לצמיתות`);
    },
    onError: (e) => notify('error', describeError(e))
  });

  const items: EventItem[] = archived.data ?? [];

  return (
    <Modal
      open={isOpen}
      onOpenChange={(o) => !o && onClose()}
      title="ארכיון"
      description={
        canPurge
          ? 'כאן נמצאים אירועים שהעברת לארכיון. אפשר לשחזר אותם, או למחוק לצמיתות'
          : 'כאן נמצאים אירועים שהעברת לארכיון. אפשר לשחזר אותם בכל זמן'
      }
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
            const isConfirming = confirming === ev.id;

            return (
              <li
                key={ev.id}
                className={cn(
                  'flex flex-col gap-2 rounded-lg border px-3 py-2.5',
                  isConfirming ? 'border-late bg-late-soft' : 'border-line'
                )}
              >
                <div className="flex items-center gap-3">
                  <Dot className={cn('shrink-0', cat.dot)} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-base font-semibold text-ink">{ev.title}</span>
                    <span className="text-sm text-ink-tertiary tnum">
                      {isFloating(ev) ? `${ev.actualDate.slice(0, 7)} · במהלך החודש` : formatDate(ev.actualDate)}
                    </span>
                  </div>

                  {!isConfirming && canEdit && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => restore.mutate(ev.id)}
                      disabled={restore.isPending || purge.isPending}
                    >
                      <ArchiveRestore className="h-5 w-5" />
                      שחזור
                    </Button>
                  )}

                  {!isConfirming && canPurge && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setConfirming(ev.id)}
                      disabled={restore.isPending || purge.isPending}
                      aria-label={`מחק לצמיתות את ${ev.title}`}
                    >
                      <Trash2 className="h-5 w-5" />
                      <span className="hidden sm:inline">מחק לצמיתות</span>
                    </Button>
                  )}
                </div>

                {/*
                  The confirmation says what goes with it. "Are you sure?" is not
                  a question anybody can answer — this one names the event and
                  the things that disappear alongside it.
                */}
                {isConfirming && (
                  <div className="flex flex-col gap-2 border-t border-late/30 pt-2">
                    <div className="flex items-start gap-2">
                      <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-late" aria-hidden="true" />
                      <p className="text-base text-ink">
                        למחוק את <b>«{ev.title}»</b> לצמיתות? יימחקו איתו גם המשימות והתגובות שלו.{' '}
                        <b className="text-late">אי אפשר לשחזר.</b>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => purge.mutate(ev.id)}
                        disabled={purge.isPending}
                      >
                        <Trash2 className="h-5 w-5" />
                        {purge.isPending ? 'מוחק…' : 'כן, מחק לצמיתות'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirming(null)}
                        disabled={purge.isPending}
                      >
                        ביטול
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
