import React, { useState } from 'react';
import { Sparkles, AlertCircle, Check, Loader2 } from 'lucide-react';
import { EventItem, TaskPriority } from '../types';
import type { TaskInput } from '../services/api';
import { api } from '../services/api';
import { Modal, Button, Badge, Field, Input, Select, cn } from './ui';
import { CATEGORY_META } from '../utils/eventMeta';

interface Suggestion {
  title: string;
  description?: string;
  priority?: string;
  suggestedRole?: string;
  daysBeforeKickoff?: number;
  checklist?: string[];
}

interface AIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  event?: EventItem;
  onAddGeneratedTasks: (tasks: TaskInput[]) => void;
}

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({
  isOpen,
  onClose,
  event,
  onAddGeneratedTasks
}) => {
  const [title, setTitle] = useState(event?.title || '');
  const [prepMonths, setPrepMonths] = useState(event?.prepMonths ?? 2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [tips, setTips] = useState<string[]>([]);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [aiGenerated, setAiGenerated] = useState(false);

  const generate = async () => {
    if (!title.trim()) return;
    setLoading(true);
    setError('');
    setSuggestions([]);
    try {
      const res = await fetch('/api/ai/suggest-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventTitle: title.trim(),
          category: event?.category,
          kickoffDate: event?.kickoffDate,
          actualDate: event?.actualDate,
          prepMonths
        })
      });
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      const list: Suggestion[] = json?.data?.recommendedTasks ?? [];
      setSuggestions(list);
      setTips(json?.data?.strategicTips ?? []);
      setChosen(new Set(list.map((_, i) => i)));
      // The server states plainly whether a model produced this. We never guess.
      setAiGenerated(Boolean(json?.aiGenerated));
    } catch {
      setError('ההצעות לא זמינות כרגע. אפשר להמשיך ולהוסיף משימות לבד');
    } finally {
      setLoading(false);
    }
  };

  const accept = () => {
    onAddGeneratedTasks(
      suggestions
        .filter((_, i) => chosen.has(i))
        .map((s) => ({
          title: s.title,
          description: s.description ?? null,
          priority: (['low', 'medium', 'high', 'urgent'].includes(s.priority ?? '')
            ? s.priority
            : 'medium') as TaskPriority,
          dueDate: event?.kickoffDate ?? null
        }))
    );
    onClose();
  };

  const toggle = (i: number) =>
    setChosen((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  return (
    <Modal
      open={isOpen}
      onOpenChange={(o) => !o && onClose()}
      title="הצעות למשימות"
      description={event ? CATEGORY_META[event.category].label : 'ספר לנו על האירוע ונציע משימות שכדאי להכין'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            בטל שינוי בשם הלוח
          </Button>
          <Button variant="primary" onClick={accept} disabled={chosen.size === 0 || suggestions.length === 0}>
            הוספת {chosen.size} משימות
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
          <Field label="איזה אירוע מתכננים?" required htmlFor="ai-title">
            <Input id="ai-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="חודשי הכנה" htmlFor="ai-prep">
            <Select id="ai-prep" value={prepMonths} onChange={(e) => setPrepMonths(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="primary" onClick={generate} disabled={loading || !title.trim()}>
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
            {loading ? 'מכין הצעות…' : 'הצע משימות'}
          </Button>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 rounded-lg bg-late-soft px-3 py-2.5">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-late" />
            <p className="text-base text-ink">{error}</p>
          </div>
        )}

        {suggestions.length > 0 && (
          <>
            <div className="flex items-center gap-2">
              <Badge tone={aiGenerated ? 'ready' : 'neutral'}>
                <Sparkles className="h-4.5 w-4.5" />
                {aiGenerated ? 'הצעה של AI' : 'תבנית מוכנה'}
              </Badge>
              <span className="text-sm text-ink-tertiary">בחר מה להוסיף</span>
            </div>

            <ul className="flex flex-col gap-1.5">
              {suggestions.map((s, i) => {
                const picked = chosen.has(i);
                return (
                  <li key={i}>
                    <button
                      onClick={() => toggle(i)}
                      aria-pressed={picked}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-lg border p-3 text-start transition-colors',
                        picked ? 'border-primary-line bg-primary-soft/50' : 'border-line hover:bg-canvas'
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border',
                          picked ? 'border-primary bg-primary text-white' : 'border-line-strong bg-surface'
                        )}
                      >
                        {picked && <Check className="h-4.5 w-4.5" strokeWidth={3} />}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="text-base font-semibold text-ink">{s.title}</span>
                        {s.description && <span className="text-sm text-ink-secondary">{s.description}</span>}
                        <span className="flex flex-wrap gap-1.5">
                          {s.suggestedRole && <Badge tone="neutral">{s.suggestedRole}</Badge>}
                          {s.checklist && s.checklist.length > 0 && (
                            <Badge tone="neutral">{s.checklist.length} סעיפי צ׳קליסט</Badge>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {tips.length > 0 && (
              <div className="rounded-lg bg-canvas p-3">
                <span className="text-sm font-semibold text-ink">כדאי לדעת</span>
                <ul className="mt-1.5 flex list-disc flex-col gap-1 ps-4">
                  {tips.map((t, i) => (
                    <li key={i} className="text-sm text-ink-secondary">
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};
