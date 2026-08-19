import React, { useState } from 'react';
import { X, Plus, Calendar, Sparkles } from 'lucide-react';
import { EventItem, EventCategory, MonthMeta, UserAccess } from '../types';

interface AddEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddEvent: (newEvent: EventItem) => void;
  months: MonthMeta[];
  defaultDate?: string;
  defaultMonthKey?: string;
  currentUser: UserAccess;
}

export const AddEventModal: React.FC<AddEventModalProps> = ({
  isOpen,
  onClose,
  onAddEvent,
  months,
  defaultDate,
  defaultMonthKey,
  currentUser
}) => {
  if (!isOpen) return null;

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<EventCategory>('campaign');
  const [monthKey, setMonthKey] = useState(defaultMonthKey || months[0]?.key || '2026-08');
  const [isFloating, setIsFloating] = useState(!defaultDate);
  const [kickoffDate, setKickoffDate] = useState(defaultDate || '');
  const [actualDate, setActualDate] = useState(defaultDate || '');
  const [prepMonths, setPrepMonths] = useState(2);
  const [note, setNote] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newEvent: EventItem = {
      id: `ev-${Date.now()}`,
      title: title.trim(),
      category,
      kickoffDate: kickoffDate || undefined,
      actualDate: isFloating ? monthKey : actualDate || undefined,
      prepMonths: Number(prepMonths) || 0,
      isFloating,
      monthKey,
      note: note.trim() || undefined,
      description: description.trim() || undefined,
      tasks: [
        {
          id: `task-${Date.now()}-1`,
          title: `תכנון ראשוני והגדרת יעדים ל${title.trim()}`,
          status: 'todo',
          priority: 'high',
          assigneeEmail: currentUser.email,
          assigneeName: currentUser.name,
          dueDate: kickoffDate || undefined,
          checklist: [],
          comments: []
        }
      ],
      createdAt: new Date().toISOString().slice(0, 10),
      createdBy: currentUser.email
    };

    onAddEvent(newEvent);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white border-2 border-[#3A3534] rounded-[28px] max-w-xl w-full max-h-[90vh] overflow-hidden flex flex-col xtra-sticker-shadow-lg text-right">
        {/* Header */}
        <div className="p-6 border-b-2 border-[#3A3534] bg-[#FAF8F7] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#F7414B] border-2 border-[#3A3534] xtra-sticker-shadow-sm flex items-center justify-center text-white">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-[#3A3534]">
                הוספת אירוע / קמפיין חדש
              </h2>
              <p className="text-xs text-[#6B6362]">
                הגדרת פרטי אירוע, מועד התנעה וזמני הכנה
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 flex flex-col gap-4 text-xs">
          <div>
            <label className="font-bold text-[#3A3534] block mb-1">
              שם האירוע / הקמפיין: <span className="text-[#F7414B]">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="לדוגמה: יום המשפחה 2027, מבצע שבועות, השקת תווי שי..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-2.5 rounded-xl border-2 border-[#3A3534] bg-white font-bold text-sm text-[#3A3534] focus:outline-none focus:border-[#5059FF]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="font-bold text-[#3A3534] block mb-1">חודש יעד בלוח:</label>
              <select
                value={monthKey}
                onChange={(e) => setMonthKey(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-[#C7C1C0] bg-white font-semibold text-[#3A3534]"
              >
                {months.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.title} ({m.hebrew})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-bold text-[#3A3534] block mb-1">קטגוריה:</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as EventCategory)}
                className="w-full p-2.5 rounded-xl border border-[#C7C1C0] bg-white font-semibold text-[#3A3534]"
              >
                <option value="holiday">חג ומועד (Holiday)</option>
                <option value="campaign">קמפיין עונתי (Campaign)</option>
                <option value="b2b">ועדים וארגונים (B2B)</option>
                <option value="social">סושיאל ומדיה (Social)</option>
                <option value="operational">תפעול ופיתוח (Operations)</option>
                <option value="other">אחר (Other)</option>
              </select>
            </div>
          </div>

          <div className="bg-[#FAF8F7] border border-[#E6E2E1] rounded-2xl p-3.5 flex flex-col gap-3">
            <label className="flex items-center gap-2 cursor-pointer font-bold text-[#3A3534]">
              <input
                type="checkbox"
                checked={isFloating}
                onChange={(e) => setIsFloating(e.target.checked)}
                className="accent-[#3A3534]"
              />
              <span>אירוע חודשי ללא תאריך מדויק (Floating Campaign)</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-[#3A3534] block mb-1">תאריך התנעה (עולים לאוויר):</label>
                <input
                  type="date"
                  value={kickoffDate}
                  onChange={(e) => setKickoffDate(e.target.value)}
                  className="w-full p-2 rounded-xl border border-[#C7C1C0] bg-white font-mono"
                />
              </div>

              {!isFloating && (
                <div>
                  <label className="font-bold text-[#3A3534] block mb-1">תאריך אמת (מועד האירוע):</label>
                  <input
                    type="date"
                    value={actualDate}
                    onChange={(e) => setActualDate(e.target.value)}
                    className="w-full p-2 rounded-xl border border-[#C7C1C0] bg-white font-mono"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="font-bold text-[#3A3534] block mb-1">חודשי הכנה מומלצים מראש:</label>
              <input
                type="number"
                min="0"
                max="12"
                value={prepMonths}
                onChange={(e) => setPrepMonths(Number(e.target.value))}
                className="w-full p-2 rounded-xl border border-[#C7C1C0] bg-white"
              />
            </div>
          </div>

          <div>
            <label className="font-bold text-[#3A3534] block mb-1">הערה / כותרת משנה:</label>
            <input
              type="text"
              placeholder="לדוגמה: לאירוע דצמבר 2026, דורש אישור מנכ״ל..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-[#C7C1C0] bg-white text-[#3A3534]"
            />
          </div>

          <div>
            <label className="font-bold text-[#3A3534] block mb-1">תיאור והנחיות מפורטות:</label>
            <textarea
              rows={3}
              placeholder="פירוט היעדים, תקציב מוערך, רשתות משתתפות..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-[#C7C1C0] bg-white text-[#3A3534]"
            ></textarea>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E6E2E1]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full text-xs font-bold text-[#6B6362] hover:bg-[#FAF8F7]"
            >
              ביטול
            </button>
            <button
              type="submit"
              className="px-6 py-2 rounded-full border-2 border-[#3A3534] bg-[#F7414B] hover:bg-[#DE2A34] text-white font-bold text-xs xtra-sticker-shadow cursor-pointer"
            >
              הוסף אירוע לגאנט
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
