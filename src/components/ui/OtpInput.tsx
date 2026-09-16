import React from 'react';
import { cn } from './cn';

export const OTP_LENGTH = 6;

/** Six digits and nothing else — a hole left by a correction is not a code. */
export const isCompleteOtp = (value: string) => /^\d{6}$/.test(value);

/**
 * One digit into one box, positionally.
 *
 * A blank box stays a blank character so every later digit keeps its place;
 * only the tail is trimmed, so a finished code is six digits and nothing else.
 * Collapsing the blanks instead — which is what this used to do — slid the rest
 * of the code one box to the left the moment somebody fixed a digit in the
 * middle, and the correction landed on the wrong digit.
 */
export function setOtpDigit(value: string, index: number, digit: string): string {
  const next = value.padEnd(OTP_LENGTH, ' ').split('');
  next[index] = digit || ' ';
  return next.join('').slice(0, OTP_LENGTH).replace(/ +$/, '');
}

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
 *
 * The value is positional — see `setOtpDigit` — so `isCompleteOtp` is the only
 * test of readiness.
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
  /** Fired once, when all six digits are present. */
  onComplete: (code: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const LENGTH = OTP_LENGTH;
  const boxes = React.useRef<(HTMLInputElement | null)[]>([]);
  /*
   * So a complete code fires once.
   *
   * Without this, every re-render while the request is in flight would call it
   * again — and each call is a sign-in attempt against a code that allows three.
   */
  const fired = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (isCompleteOtp(value) && fired.current !== value) {
      fired.current = value;
      onComplete(value);
    }
    if (!isCompleteOtp(value)) fired.current = null;
  }, [value, onComplete]);

  const setDigit = (index: number, digit: string) => onChange(setOtpDigit(value, index, digit));

  const digitAt = (index: number) => (value[index] ?? '').trim();

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
          value={digitAt(i)}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '');
            if (!digits) return;
            // A paste lands in one box; spread it across the rest.
            if (digits.length > 1) {
              onChange((value.padEnd(i, ' ').slice(0, i) + digits).slice(0, LENGTH).replace(/ +$/, ''));
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
              if (digitAt(i)) setDigit(i, '');
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
