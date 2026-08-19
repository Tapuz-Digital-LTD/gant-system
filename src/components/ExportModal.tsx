import React from 'react';
import { X, Download, FileText, Printer, Check, Copy } from 'lucide-react';
import { GanttBoard } from '../types';
import { exportBoardToCSV } from '../utils/dateHelpers';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  board: GanttBoard;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  board
}) => {
  if (!isOpen) return null;

  const handleExportCSV = () => {
    exportBoardToCSV(board.name, board.events);
  };

  const handleExportJSON = () => {
    const dataStr = JSON.stringify(board, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${board.name}_backup_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white border-2 border-[#3A3534] rounded-[28px] max-w-md w-full overflow-hidden flex flex-col xtra-sticker-shadow-lg text-right">
        {/* Header */}
        <div className="p-6 border-b-2 border-[#3A3534] bg-[#FAF8F7] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#2FA36B] border-2 border-[#3A3534] xtra-sticker-shadow-sm flex items-center justify-center text-white">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-[#3A3534]">
                ייצוא נתוני הגאנט
              </h2>
              <p className="text-xs text-[#6B6362]">
                גיבוי, הורדה והדפסה של לוח {board.name}
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

        {/* Options */}
        <div className="p-6 flex flex-col gap-3 text-xs">
          {/* CSV Export */}
          <button
            onClick={handleExportCSV}
            className="p-4 rounded-2xl border-2 border-[#3A3534] bg-[#FAF8F7] hover:bg-white transition-all flex items-center justify-between xtra-sticker-shadow-sm cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#E3F7EC] text-[#2FA36B] flex items-center justify-center font-bold">
                CSV
              </div>
              <div className="flex flex-col text-right">
                <span className="font-bold text-sm text-[#3A3534]">הורדת קובץ אקסל (CSV)</span>
                <span className="text-[#6B6362]">כולל כל האירועים, תאריכים, חודשי הכנה ומשימות</span>
              </div>
            </div>
            <Download className="w-4 h-4 text-[#2FA36B]" />
          </button>

          {/* JSON Backup */}
          <button
            onClick={handleExportJSON}
            className="p-4 rounded-2xl border-2 border-[#3A3534] bg-[#FAF8F7] hover:bg-white transition-all flex items-center justify-between xtra-sticker-shadow-sm cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#E6E7FF] text-[#5059FF] flex items-center justify-center font-bold">
                JSON
              </div>
              <div className="flex flex-col text-right">
                <span className="font-bold text-sm text-[#3A3534]">גיבוי מלא במבנה נתונים (JSON)</span>
                <span className="text-[#6B6362]">מבנה נתונים מלא לטעינה ושחזור עתידי</span>
              </div>
            </div>
            <FileText className="w-4 h-4 text-[#5059FF]" />
          </button>

          {/* Print */}
          <button
            onClick={handlePrint}
            className="p-4 rounded-2xl border-2 border-[#3A3534] bg-[#FAF8F7] hover:bg-white transition-all flex items-center justify-between xtra-sticker-shadow-sm cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#FFF6DC] text-[#FF732D] flex items-center justify-center font-bold">
                <Printer className="w-5 h-5" />
              </div>
              <div className="flex flex-col text-right">
                <span className="font-bold text-sm text-[#3A3534]">הדפסה / שמירה כ-PDF</span>
                <span className="text-[#6B6362]">תצוגה מותאמת לפגישות הנהלה ודוחות</span>
              </div>
            </div>
            <Printer className="w-4 h-4 text-[#FF732D]" />
          </button>
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
