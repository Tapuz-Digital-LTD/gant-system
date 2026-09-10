import React, { useState } from 'react';
import { CalendarRange, FileJson, FileSpreadsheet, Layers, ListChecks, Loader2, Printer } from 'lucide-react';
import { FilterState, GanttBoard, EventItem } from '../types';
import { api } from '../services/api';
import { describeError } from '../hooks/useBoardData';
import { Modal, Button, cn, useToast } from './ui';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  board: GanttBoard;
  events: EventItem[];
  boards: GanttBoard[];
  /** What is on screen right now: the window and the filter chips. */
  range: { from: string; to: string };
  filterState: FilterState;
}

/**
 * Getting the data back out, as a file somebody can actually open.
 *
 * This used to write CSV in the browser from whatever the current view happened
 * to hold — so a calendar showing September exported September, silently, and
 * Hebrew arrived mangled in anything but Excel's own import wizard. The file is
 * built on the server now: real dates, real sheets, right-to-left, and the same
 * column headings the importer reads, so a downloaded file goes back in without
 * losing anything.
 */
export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  board,
  events,
  boards,
  range,
  filterState
}) => {
  const { notify } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  /** The chips that are actually set. "all" is not a filter, it is the absence of one. */
  const chosen = {
    categories: filterState.category !== 'all' ? [filterState.category] : undefined,
    statuses: filterState.status !== 'all' ? [filterState.status] : undefined,
    assigneeIds: filterState.assignee !== 'all' ? [filterState.assignee] : undefined
  };

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    try {
      await work();
      notify('success', 'הקובץ ירד');
      onClose();
    } catch (e) {
      notify('error', describeError(e));
    } finally {
      setBusy(null);
    }
  };

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify({ board, events }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${board.name}_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const OPTIONS = [
    {
      key: 'board',
      icon: FileSpreadsheet,
      title: 'הפרויקט הזה',
      body: `כל האירועים והמשימות ב«${board.name}», עם כל התאריכים`,
      action: () =>
        api.exports.xlsx({ scope: 'board', boardIds: [board.id], includeTasks: true, fileName: board.name })
    },
    {
      key: 'view',
      icon: CalendarRange,
      title: 'מה שמוצג עכשיו',
      body: 'רק התקופה והסינון שעל המסך ברגע זה',
      action: () =>
        api.exports.xlsx({
          scope: 'events',
          boardIds: [board.id],
          from: range.from,
          to: range.to,
          ...chosen,
          includeTasks: true,
          fileName: `${board.name} — מה שמוצג`
        })
    },
    {
      key: 'tasks',
      icon: ListChecks,
      title: 'רק המשימות',
      body: 'גיליון אחד של משימות: מי אחראי, עד מתי, ובאיזה אירוע',
      action: () =>
        api.exports.xlsx({
          scope: 'tasks',
          boardIds: [board.id],
          ...chosen,
          fileName: `${board.name} — משימות`
        })
    },
    ...(boards.length > 1
      ? [
          {
            key: 'all',
            icon: Layers,
            title: 'כל הפרויקטים',
            body: `${boards.length} הפרויקטים שיש לך גישה אליהם, בקובץ אחד`,
            action: () => api.exports.xlsx({ scope: 'all', includeTasks: true, fileName: 'כל הפרויקטים' })
          }
        ]
      : []),
    {
      key: 'json',
      icon: FileJson,
      title: 'גיבוי מלא',
      body: 'עותק גולמי של הלוח, למי שצריך את המבנה עצמו',
      action: async () => downloadJson()
    },
    {
      key: 'print',
      icon: Printer,
      title: 'הדפס',
      body: 'הדפס את מה שמוצג עכשיו או שמור כ-PDF',
      action: async () => window.print()
    }
  ];

  return (
    <Modal
      open={isOpen}
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title="הורדה והדפסה"
      description={board.name}
      footer={
        <Button variant="secondary" onClick={onClose}>
          סגור
        </Button>
      }
    >
      <div className="flex flex-col gap-2">
        {OPTIONS.map(({ key, icon: Icon, title, body, action }) => (
          <button
            key={key}
            disabled={busy !== null}
            onClick={() => run(key, action)}
            className={cn(
              'flex items-start gap-3 rounded-lg border border-line p-3 text-start transition-colors',
              'hover:border-primary hover:bg-primary-soft/40 disabled:opacity-60'
            )}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-canvas text-ink-secondary">
              {busy === key ? (
                <Loader2 className="h-4.5 w-4.5 animate-spin" aria-hidden="true" />
              ) : (
                <Icon className="h-4.5 w-4.5" aria-hidden="true" />
              )}
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-base font-semibold text-ink">{title}</span>
              <span className="text-sm text-ink-tertiary">{body}</span>
            </span>
          </button>
        ))}
      </div>

      <p className="mt-3 text-sm text-ink-tertiary">
        הקובץ נפתח באקסל וב-Google Sheets, ואפשר לייבא אותו חזרה למערכת בלי לאבד תאריכים.
      </p>
    </Modal>
  );
};
