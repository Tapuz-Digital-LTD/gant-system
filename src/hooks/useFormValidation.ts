import { useState } from 'react';

/**
 * Client-side validation for forms.
 *
 * The server is the authority — every mutation is re-checked with Zod there.
 * This exists so a person sees the problem in Hebrew, next to the field, instead
 * of the browser's own bubble, which is in the browser's language, points the
 * wrong way in an RTL layout, and cannot be styled.
 *
 * Every form using this must also set `noValidate` on the <form>.
 */
export type Rules<T extends string> = Record<T, () => string | undefined>;

export function useFormValidation<T extends string>(rules: Rules<T>) {
  const [submitted, setSubmitted] = useState(false);

  const collect = (): Partial<Record<T, string>> => {
    const found: Partial<Record<T, string>> = {};
    for (const key of Object.keys(rules) as T[]) {
      const message = rules[key]();
      if (message) found[key] = message;
    }
    return found;
  };

  const errors: Partial<Record<T, string>> = submitted ? collect() : {};
  const messages = Object.values(errors) as string[];

  /**
   * Returns true when the form may proceed. On failure it marks the form as
   * submitted (so errors appear) and moves focus to the first bad field —
   * otherwise a keyboard user is left guessing what went wrong.
   */
  const check = (focusPrefix?: string): boolean => {
    setSubmitted(true);
    const found = collect();
    const first = Object.keys(found)[0];
    if (!first) return true;
    if (focusPrefix) document.getElementById(`${focusPrefix}-${first}`)?.focus();
    return false;
  };

  return {
    /** Message for one field, or undefined before the first submit attempt. */
    error: (field: T) => errors[field],
    errors: messages,
    hasErrors: messages.length > 0,
    check,
    reset: () => setSubmitted(false)
  };
}

/* --- rules shared across forms --- */

export const isEmail = (value: string) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(value.trim());

export function required(value: string, message: string): string | undefined {
  return value.trim() ? undefined : message;
}

export function maxLength(value: string, max: number, label: string): string | undefined {
  return value.trim().length > max ? `${label} ארוך מדי. אפשר עד ${max} תווים` : undefined;
}
