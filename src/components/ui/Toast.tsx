import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { cn } from './cn';

type Kind = 'success' | 'error';
interface Toast { id: number; kind: Kind; text: string }

const ToastContext = createContext<{ notify: (kind: Kind, text: string) => void }>({
  notify: () => undefined
});

export const useToast = () => useContext(ToastContext);

/** Feedback the prototype never had: a failed save is now visible, not a console line. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((kind: Kind, text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    // Errors stay long enough to read and act on; confirmations get out of the way.
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 2500);
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex max-w-md items-start gap-2.5 rounded-lg px-3.5 py-2.5 shadow-pop',
              t.kind === 'error' ? 'bg-late text-white' : 'bg-ink text-white'
            )}
          >
            {t.kind === 'error' ? (
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            )}
            <span className="text-base">{t.text}</span>
            <button
              onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}
              aria-label="סגור"
              className="ms-1 shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
