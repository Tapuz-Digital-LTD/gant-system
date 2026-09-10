import React from 'react';
import { cn } from './cn';

/**
 * Six boxes, one per digit, and no button at the end.
 *
 * A single field asks somebody to trust that six characters went in correctly;
 * six boxes show it. And once the sixth digit is there the intent is not in
 * doubt — asking for a click as well is asking a question that has already been
 * answered.
 *
 * Laid out left to right even on a right-to-left page: a number is read in one
 * direction in every language, and mirroring the boxes would put the first
 * digit typed under the last box.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  invalid,
  disabled,
  label = 'קוד בן 6 ספרות'
}: {
  value: string;
  onChange: (next: string) => void;
  /** Fired once, when the sixth digit lands. */
  onComplete: (code: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const LENGTH = 6;
  const boxes = React.useRef<(HTMLInputElement | null)[]>([]);
  /*
   * So a complete code fires once.
   *
   * Without this, every re-render while the request is in flight would call it
   * again — and each call is a sign-in attempt against a code that allows three.
   */
  const fired = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (value.length === LENGTH && fired.current !== value) {
      fired.current = value;
      onComplete(value);
    }
    if (value.length < LENGTH) fired.current = null;
  }, [value, onComplete]);

  const setDigit = (index: number, digit: string) => {
    const next = value.padEnd(LENGTH, ' ').split('');
    next[index] = digit;
    onChange(next.join('').replace(/\s/g, '').slice(0, LENGTH));
  };

  const focusBox = (index: number) => boxes.current[Math.max(0, Math.min(LENGTH - 1, index))]?.focus();

  return (
    <div
      dir="ltr"
      role="group"
      aria-label={label}
      className="flex justify-center gap-2"
    >
      {Array.from({ length: LENGTH }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            boxes.current[i] = el;
          }}
          // The first box carries the autofill hint, so a code arriving by SMS
          // lands in the whole group rather than one box.
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          disabled={disabled}
          aria-label={`ספרה ${i + 1} מתוך ${LENGTH}`}
          value={value[i] ?? ''}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '');
            if (!digits) return;
            // A paste lands in one box; spread it across the rest.
            if (digits.length > 1) {
              onChange((value.slice(0, i) + digits).slice(0, LENGTH));
              focusBox(i + digits.length);
              return;
            }
            setDigit(i, digits);
            focusBox(i + 1);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace') {
              e.preventDefault();
              // Clear this one, or step back and clear that — which is what
              // backspace does everywhere else.
              if (value[i]) setDigit(i, '');
              else {
                setDigit(i - 1, '');
                focusBox(i - 1);
              }
              return;
            }
            if (e.key === 'ArrowLeft') focusBox(i - 1);
            if (e.key === 'ArrowRight') focusBox(i + 1);
          }}
          onFocus={(e) => e.target.select()}
          className={cn(
            'h-14 w-11 rounded-xl border-2 bg-surface text-center text-2xl font-bold text-ink tnum transition',
            'focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary-soft',
            'disabled:opacity-60',
            invalid ? 'border-late' : 'border-line-strong'
          )}
        />
      ))}
    </div>
  );
}
