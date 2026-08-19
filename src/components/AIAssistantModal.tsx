import React, { useState } from 'react';
import { Sparkles, Check, X, Loader2, Lightbulb, ArrowRight, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';
import { EventItem, TaskItem, UserAccess } from '../types';

interface AIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  event?: EventItem | null;
  onAddGeneratedTasks: (tasks: TaskItem[]) => void;
  users: UserAccess[];
  currentUser: UserAccess;
}

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({
  isOpen,
  onClose,
  event,
  onAddGeneratedTasks,
  users,
  currentUser
}) => {
  if (!isOpen) return null;

  const [loading, setLoading] = useState(false);
  const [generatedTasks, setGeneratedTasks] = useState<any[]>([]);
  const [tips, setTips] = useState<string[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [customTitle, setCustomTitle] = useState(event?.title || '');
  const [customCategory, setCustomCategory] = useState(event?.category || 'campaign');
  const [prepMonths, setPrepMonths] = useState(event?.prepMonths || 2);
  const [isDoneAdding, setIsDoneAdding] = useState(false);

  const handleGenerate = async () => {
    if (!customTitle.trim()) return;
    setLoading(true);
    setGeneratedTasks([]);
    setTips([]);
    setIsDoneAdding(false);

    try {
      const response = await api.ai.suggestTasks({
        eventTitle: customTitle,
        category: customCategory,
        kickoffDate: event?.kickoffDate,
        actualDate: event?.actualDate,
        prepMonths: prepMonths
      });

      if (response && response.recommendedTasks) {
        setGeneratedTasks(response.recommendedTasks);
        setTips(response.strategicTips || []);
        // Select all by default
        setSelectedIndices(response.recommendedTasks.map((_: any, idx: number) => idx));
      }
    } catch (err) {
      console.error('Failed to generate AI tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleIndex = (index: number) => {
    if (selectedIndices.includes(index)) {
      setSelectedIndices(selectedIndices.filter((i) => i !== index));
    } else {
      setSelectedIndices([...selectedIndices, index]);
    }
  };

  const handleApplySelected = () => {
    const tasksToInsert: TaskItem[] = selectedIndices.map((idx) => {
      const g = generatedTasks[idx];
      // Pick suitable user based on suggestedRole
      const matchingUser = users.find((u) => u.name.includes(g.suggestedRole) || u.email.includes(g.suggestedRole)) || currentUser;

      return {
        id: `task-ai-${Date.now()}-${idx}`,
        title: g.title,
        description: g.description || '',
        status: 'todo',
        priority: g.priority || 'medium',
        assigneeEmail: matchingUser.email,
        assigneeName: matchingUser.name,
        dueDate: event?.kickoffDate || undefined,
        checklist: (g.checklist || []).map((txt: string, cIdx: number) => ({
          id: `c-ai-${idx}-${cIdx}`,
          text: txt,
          done: false
        })),
        comments: [
          {
            id: `com-ai-${Date.now()}`,
            userEmail: 'gemini-server@xtra.co.il',
            userName: 'Gemini AI Assistant (Server)',
            text: 'משימה זו נוצרה אוטומטית לפי מודל תכנון קמפיין XTRA',
            date: new Date().toLocaleDateString('he-IL')
          }
        ]
      };
    });

    onAddGeneratedTasks(tasksToInsert);
    setIsDoneAdding(true);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl">
      <div
        id="ai-assistant-modal"
        className="bg-white rounded-2xl border-4 border-[#3A3534] shadow-[8px_8px_0px_#3A3534] w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#5059FF] to-[#7B82FF] p-6 text-white border-b-4 border-[#3A3534] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#FFD446] rounded-xl border-2 border-[#3A3534] flex items-center justify-center text-[#3A3534] shadow-[2px_2px_0px_#3A3534]">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl font-black">סייר המשימות החכם (AI Server Engine)</h2>
              <p className="text-xs text-white/90 font-medium">
                יצירת תוכנית עבודה, חלוקת תפקידים וצ'קליסט מלא על בסיס שרת Gemini
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 bg-white text-[#3A3534] rounded-lg border-2 border-[#3A3534] flex items-center justify-center hover:bg-slate-100 transition cursor-pointer shadow-[2px_2px_0px_#3A3534]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Inputs */}
          <div className="bg-[#FAF8F7] p-4 rounded-xl border-2 border-[#3A3534] space-y-4">
            <div>
              <label className="block text-xs font-black text-[#3A3534] mb-1">
                שם האירוע / הקמפיין:
              </label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="למשל: קמפיין תווי שי לראש השנה 2026"
                className="w-full px-3 py-2 bg-white border-2 border-[#3A3534] rounded-lg font-bold text-sm focus:outline-none focus:ring-2 focus:ring-[#5059FF]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#6B6362] mb-1">קטגוריה:</label>
                <select
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border-2 border-[#3A3534] rounded-lg font-semibold text-xs focus:outline-none"
                >
                  <option value="holiday">חגים ומועדים</option>
                  <option value="campaign">קמפיינים וסושיאל</option>
                  <option value="b2b">מכירות וארגונים B2B</option>
                  <option value="operational">תפעול והטבות</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#6B6362] mb-1">חודשי הכנה נדרשים:</label>
                <input
                  type="number"
                  min="0"
                  max="6"
                  value={prepMonths}
                  onChange={(e) => setPrepMonths(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white border-2 border-[#3A3534] rounded-lg font-semibold text-xs focus:outline-none"
                />
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={loading || !customTitle.trim()}
              className="w-full py-3 bg-[#FFD446] hover:bg-[#ffcd2b] text-[#3A3534] font-black rounded-xl border-2 border-[#3A3534] shadow-[3px_3px_0px_#3A3534] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>מעבד בשרת Gemini...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 text-[#3A3534]" />
                  <span>יצירת משימות עם בינה מלאכותית</span>
                </>
              )}
            </button>
          </div>

          {/* Results */}
          {generatedTasks.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-sm text-[#3A3534] flex items-center gap-2">
                  <span>המשימות שהופקו על ידי השרת ({generatedTasks.length}):</span>
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedIndices.length === generatedTasks.length) {
                      setSelectedIndices([]);
                    } else {
                      setSelectedIndices(generatedTasks.map((_, i) => i));
                    }
                  }}
                  className="text-xs text-[#5059FF] font-bold hover:underline"
                >
                  {selectedIndices.length === generatedTasks.length ? 'בטל בחירת הכל' : 'בחר הכל'}
                </button>
              </div>

              <div className="space-y-3">
                {generatedTasks.map((t, idx) => {
                  const isSelected = selectedIndices.includes(idx);
                  return (
                    <div
                      key={idx}
                      onClick={() => handleToggleIndex(idx)}
                      className={`p-3.5 rounded-xl border-2 cursor-pointer transition ${
                        isSelected
                          ? 'border-[#5059FF] bg-[#5059FF]/5 shadow-[2px_2px_0px_#5059FF]'
                          : 'border-slate-200 bg-white opacity-70'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-5 h-5 rounded-md border-2 flex items-center justify-center mt-0.5 ${
                            isSelected
                              ? 'bg-[#5059FF] border-[#3A3534] text-white'
                              : 'border-slate-400 bg-white'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="font-extrabold text-sm text-[#3A3534]">{t.title}</h4>
                            <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 rounded-full border border-slate-300">
                              {t.suggestedRole}
                            </span>
                          </div>
                          {t.description && (
                            <p className="text-xs text-[#6B6362] mt-1">{t.description}</p>
                          )}
                          {t.checklist && t.checklist.length > 0 && (
                            <div className="mt-2 text-[11px] text-slate-600 bg-white/80 p-2 rounded-lg border border-slate-200">
                              <span className="font-bold text-slate-700 block mb-1">צ'קליסט:</span>
                              <ul className="list-disc list-inside space-y-0.5">
                                {t.checklist.map((c: string, ci: number) => (
                                  <li key={ci}>{c}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Strategic Tips */}
              {tips.length > 0 && (
                <div className="bg-[#FFD446]/20 border-2 border-[#FFD446] p-3.5 rounded-xl space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-black text-[#8A6A00]">
                    <Lightbulb className="w-4 h-4" />
                    <span>טיפים אסטרטגיים מהמודל:</span>
                  </div>
                  {tips.map((tip, i) => (
                    <p key={i} className="text-xs text-[#524419] font-medium leading-relaxed">
                      • {tip}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t-2 border-[#3A3534] flex items-center justify-between gap-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-[#6B6362] hover:bg-slate-100 rounded-lg border border-slate-300 cursor-pointer"
          >
            ביטול
          </button>

          {generatedTasks.length > 0 && (
            <button
              onClick={handleApplySelected}
              disabled={selectedIndices.length === 0 || isDoneAdding}
              className="px-5 py-2.5 bg-[#2FA36B] hover:bg-[#258757] text-white font-black text-xs rounded-xl border-2 border-[#3A3534] shadow-[3px_3px_0px_#3A3534] flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isDoneAdding ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>המשימות נוספו בהצלחה!</span>
                </>
              ) : (
                <>
                  <span>הוסף {selectedIndices.length} משימות שנבחרו לגאנט</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
