import React from 'react';
import { Lock } from 'lucide-react';

/**
 * Shown where a person can reach an area but may not use it.
 * Silence would read as a broken screen; this says plainly what is missing
 * and who to ask, which is what a professional tool does.
 */
export function NoPermission({
  title = 'אין לך גישה לחלק הזה',
  detail = 'אם אתה צריך אותו, בקש ממנהל המערכת להוסיף לך הרשאה.'
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 px-4 py-20 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-subtle">
        <Lock className="h-5 w-5 text-ink-tertiary" aria-hidden="true" />
      </span>
      <p className="text-md font-semibold text-ink">{title}</p>
      <p className="max-w-xs text-base text-ink-tertiary">{detail}</p>
    </div>
  );
}
