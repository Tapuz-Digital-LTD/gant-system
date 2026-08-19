import React, { useEffect, useRef, useState } from 'react';
import { Search, Loader2, X, CalendarDays, ListChecks, CornerDownLeft } from 'lucide-react';
import { SearchHit, isFloating } from '../types';
import { useSearch } from '../hooks/useBoardData';
import { formatDate } from '../utils/dateHelpers';
import { Button, Input, cn } from './ui';

const WHY: Record<SearchHit['matchedOn'], string> = {
  title: 'בשם האירוע',
  note: 'בהערה',
  description: 'בתיאור',
  task: 'בשם המשימה'
};

/**
 * Search that waits to be asked, then says what it found and takes you there.
 * Typing alone changes nothing — the old instant filter quietly reshaped the
 * board and left no way to tell what had matched.
 */
export function SearchBox({
  boardId,
  onOpenEvent
}: {
  boardId: string | undefined;
  onOpenEvent: (eventId: string) => void;
}) {
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const results = useSearch(boardId, submitted);
  const hits: SearchHit[] = results.data ?? [];

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  const run = () => {
    const q = text.trim();
    if (q.length < 2) return;
    setSubmitted(q);
    setOpen(true);
    setCursor(0);
  };

  const choose = (hit: SearchHit) => {
    onOpenEvent(hit.eventId);
    setOpen(false);
  };

  const clear = () => {
    setText('');
    setSubmitted('');
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        className="flex items-center gap-1.5"
      >
        <div className="relative w-48 sm:w-64">
          <Search
            className="pointer-events-none absolute inset-y-0 start-3 my-auto h-5 w-5 text-ink-tertiary"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => submitted && setOpen(true)}
            onKeyDown={(e) => {
              if (!open || hits.length === 0) return;
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, hits.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === 'Enter' && submitted === text.trim()) {
                e.preventDefault();
                choose(hits[cursor]);
              } else if (e.key === 'Escape') {
                setOpen(false);
              }
            }}
            placeholder="פסח, קמפיין קיץ, אישור תקציב"
            aria-label="חפש אירוע או משימה"
            className="h-9 ps-10 pe-9"
          />
          {text && (
            <button
              type="button"
              onClick={clear}
              aria-label="נקה חיפוש"
              className="absolute inset-y-0 end-2 my-auto grid h-6 w-6 place-items-center rounded text-ink-tertiary hover:bg-subtle hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <Button type="submit" variant="secondary" disabled={text.trim().length < 2}>
          {results.isFetching ? <Loader2 className="h-5 w-5 animate-spin" /> : 'חפש'}
        </Button>
      </form>

      {open && submitted && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 max-h-96 w-[26rem] overflow-y-auto rounded-lg border border-line bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-sm text-ink-secondary">
              {results.isFetching
                ? 'מחפש…'
                : hits.length === 0
                  ? `לא נמצא כלום עבור "${submitted}"`
                  : `${hits.length} תוצאות עבור "${submitted}"`}
            </span>
            {hits.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-ink-tertiary">
                <CornerDownLeft className="h-3.5 w-3.5" />
                לפתיחה
              </span>
            )}
          </div>

          {!results.isFetching && hits.length === 0 && (
            <p className="px-3 py-4 text-sm text-ink-tertiary">
              נסה מילה אחרת, או חלק ממנה. החיפוש עובר על כל האירועים והמשימות בלוח — גם כאלה שלא מוצגים כרגע.
            </p>
          )}

          <ul>
            {hits.map((hit, i) => (
              <li key={`${hit.kind}-${hit.eventId}-${i}`}>
                <button
                  onClick={() => choose(hit)}
                  onMouseEnter={() => setCursor(i)}
                  className={cn(
                    'flex w-full items-start gap-2.5 px-3 py-2.5 text-start transition-colors',
                    i === cursor ? 'bg-primary-soft' : 'hover:bg-canvas'
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md',
                      hit.kind === 'task' ? 'bg-done-soft text-done' : 'bg-primary-soft text-primary'
                    )}
                  >
                    {hit.kind === 'task' ? <ListChecks className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}
                  </span>

                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-base font-semibold text-ink">{hit.title}</span>
                    <span className="truncate text-sm text-ink-tertiary">
                      {WHY[hit.matchedOn]}
                      {hit.context ? ` · ${hit.context}` : ''}
                    </span>
                  </span>

                  <span className="mt-0.5 shrink-0 text-sm text-ink-tertiary tnum">
                    {isFloating(hit) ? hit.actualDate.slice(0, 7) : formatDate(hit.actualDate)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
