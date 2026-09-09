import React from 'react';
import { TriangleAlert } from 'lucide-react';
import { EventItem, isFloating } from '../types';
import type { EventInput } from '../services/api';
import { MILESTONES, milestoneWarnings, workWindowStart } from '../data/milestones';
import { monthName } from '../utils/period';
import { formatDate } from '../utils/dateHelpers';
import { Field, Input, cn } from './ui';

/**
 * All seven dates of an event, in one place, in the order they happen.
 *
 * Reading and editing share this file on purpose: the labels, the icons and
 * the explanations come from the same list the form and the calendar use, so
 * a date cannot be called one thing where it is typed and another where it is
 * read.
 *
 * A date that is not set says so. It is never shown as a guess, and never
 * filled in from a neighbour.
 */

export function EventDatesSummary({ event }: { event: EventItem }) {
  const start = workWindowStart(event);
  const warnings = milestoneWarnings(event);

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg bg-canvas px-3 py-2.5">
        <p className="text-base text-ink">
          <b>מתחילים לעבוד</b>{' '}
          {start.approximate ? (
            <>
              במהלך {monthName(start.date)} {start.date.slice(0, 4)}{' '}
              <span className="text-ink-tertiary">
                — משוער, לפי {event.prepMonths} חודשי הכנה
              </span>
            </>
          ) : (
            <>
              ב-{formatDate(start.date)} <span className="text-ink-tertiary">— תאריך מדויק</span>
            </>
          )}
        </p>
      </div>

      <ol className="flex flex-col">
        {MILESTONES.map((meta) => {
          const raw = event[meta.field];
          const isActual = meta.key === 'actual';
          const monthOnly = isActual && isFloating(event);
          const value = !raw
            ? null
            : monthOnly
              ? `במהלך ${monthName(raw)} ${raw.slice(0, 4)}`
              : formatDate(raw);

          return (
            <li key={meta.key} className="flex items-start gap-2.5 py-1.5">
              <span
                className={cn(
                  'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md',
                  value ? meta.bg : 'bg-subtle',
                  value ? meta.text : 'text-ink-disabled'
                )}
              >
                <meta.icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold text-ink">{meta.short}</span>
                <span className="block text-sm text-ink-tertiary">{meta.hint}</span>
              </span>
              <span
                className={cn(
                  'shrink-0 text-base tnum',
                  value ? 'font-semibold text-ink' : 'text-ink-disabled'
                )}
              >
                {value ?? 'לא נקבע'}
              </span>
            </li>
          );
        })}
      </ol>

      {warnings.length > 0 && <WarningBox messages={warnings.map((w) => w.message)} />}
    </div>
  );
}

export function EventDatesEditor({
  event,
  onUpdateEvent
}: {
  event: EventItem;
  onUpdateEvent: (changes: Partial<EventInput>) => void;
}) {
  const start = workWindowStart(event);
  const warnings = milestoneWarnings(event);
  const floating = isFloating(event);

  return (
    <div className="flex flex-col gap-4">
      <Field label="כמה זמן צריך להתכונן?" hint="בחודשים" htmlFor="ev-prep">
        <Input
          id="ev-prep"
          type="number"
          min={0}
          max={12}
          value={event.prepMonths}
          onChange={(e) => onUpdateEvent({ prepMonths: Number(e.target.value) || 0 })}
          className="max-w-28"
        />
        {start.approximate && (
          <p className="mt-1.5 text-base text-ink-secondary">
            ← מתחילים לעבוד <b className="text-ink">במהלך {monthName(start.date)}</b>
          </p>
        )}
      </Field>

      {MILESTONES.map((meta) => {
        const id = `ev-${meta.key}`;
        const isActual = meta.key === 'actual';

        // The event date is the one that may be a whole month, and the one that
        // must never end up empty.
        if (isActual) {
          return (
            <div key={meta.key} className="flex flex-col gap-1">
              <MilestoneLabel meta={meta} htmlFor={id} />
              {floating ? (
                <>
                  <Input
                    id={id}
                    type="month"
                    value={event.actualDate.slice(0, 7)}
                    onChange={(e) =>
                      e.target.value &&
                      onUpdateEvent({ actualDate: `${e.target.value}-01`, actualPrecision: 'month' })
                    }
                    className="max-w-52"
                  />
                  <button
                    type="button"
                    onClick={() => onUpdateEvent({ actualPrecision: 'day' })}
                    className="self-start text-sm text-primary underline-offset-4 hover:underline"
                  >
                    יש יום מדויק? עבור לבחירת תאריך
                  </button>
                </>
              ) : (
                <>
                  <Input
                    id={id}
                    type="date"
                    value={event.actualDate}
                    onChange={(e) =>
                      e.target.value &&
                      onUpdateEvent({ actualDate: e.target.value, actualPrecision: 'day' })
                    }
                    className="max-w-52"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateEvent({
                        actualDate: `${event.actualDate.slice(0, 7)}-01`,
                        actualPrecision: 'month'
                      })
                    }
                    className="self-start text-sm text-primary underline-offset-4 hover:underline"
                  >
                    אין יום מדויק? עבור לחודש שלם
                  </button>
                </>
              )}
            </div>
          );
        }

        return (
          <div key={meta.key} className="flex flex-col gap-1">
            <MilestoneLabel meta={meta} htmlFor={id} />
            <Input
              id={id}
              type="date"
              value={event[meta.field] ?? ''}
              onChange={(e) => onUpdateEvent({ [meta.field]: e.target.value || null })}
              className="max-w-52"
            />
          </div>
        );
      })}

      {warnings.length > 0 && <WarningBox messages={warnings.map((w) => w.message)} />}
    </div>
  );
}

function MilestoneLabel({
  meta,
  htmlFor
}: {
  meta: (typeof MILESTONES)[number];
  htmlFor: string;
}) {
  return (
    <>
      <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-base font-semibold text-ink">
        <span className={cn('grid h-6 w-6 place-items-center rounded', meta.bg, meta.text)}>
          <meta.icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        {meta.label}
      </label>
      <p className="text-sm text-ink-tertiary">{meta.hint}</p>
    </>
  );
}

function WarningBox({ messages }: { messages: string[] }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-progress-soft px-3 py-2.5">
      <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-progress" aria-hidden="true" />
      <div className="flex flex-col gap-0.5">
        <span className="text-base font-semibold text-ink">שווה לבדוק את סדר התאריכים</span>
        {messages.map((msg) => (
          <span key={msg} className="text-base text-ink-secondary">
            {msg}
          </span>
        ))}
        <span className="mt-0.5 text-sm text-ink-tertiary">
          זו הערה בלבד. המערכת לא חוסמת כלום.
        </span>
      </div>
    </div>
  );
}
