import React from 'react';
import { FileSpreadsheet, FileJson, Printer } from 'lucide-react';
import { GanttBoard, EventItem } from '../types';
import { exportBoardToCSV } from '../utils/dateHelpers';
import { Modal, Button } from './ui';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  board: GanttBoard;
  events: EventItem[];
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, board, events }) => {
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
      icon: FileSpreadsheet,
      title: 'קובץ לאקסל',
      body: 'כל האירועים, התאריכים והתקדמות המשימות בקובץ שנפתח באקסל וב-Google Sheets',
      action: () => exportBoardToCSV(board.name, events)
    },
    {
      icon: FileJson,
      title: 'גיבוי מלא',
      body: 'עותק מלא של הלוח, כולל משימות, צ׳קליסטים ותגובות',
      action: downloadJson
    },
    {
      icon: Printer,
      title: 'הדפס',
      body: 'הדפס את מה שמוצג עכשיו או שמור כ-PDF',
      action: () => window.print()
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
        {OPTIONS.map(({ icon: Icon, title, body, action }) => (
          <button
            key={title}
            onClick={action}
            className="flex items-start gap-3 rounded-lg border border-line p-3 text-start transition-colors hover:border-primary hover:bg-primary-soft/40"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-canvas text-ink-secondary">
              <Icon className="h-4.5 w-4.5" />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-base font-semibold text-ink">{title}</span>
              <span className="text-sm text-ink-tertiary">{body}</span>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
};
