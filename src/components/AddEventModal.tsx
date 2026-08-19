import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { EventCategory, MonthMeta } from '../types';
import type { EventInput } from '../services/api';
import { CATEGORY_META } from '../utils/eventMeta';
import { Modal, Button, Field, Input, Textarea, Select } from './ui';

interface AddEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddEvent: (input: EventInput) => void;
  months: MonthMeta[];
  defaultDate?: string;
  defaultMonthKey?: string;
  isSaving?: boolean;
}

const CATEGORIES: EventCategory[] = ['holiday', 'campaign', 'b2b', 'social', 'operational', 'other'];

export const AddEventModal: React.FC<AddEventModalProps> = ({
  isOpen,
  onClose,
  onAddEvent,
  months,
  defaultDate,
  defaultMonthKey,
  isSaving
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<EventCategory>('campaign');
  const [monthKey, setMonthKey] = useState(defaultMonthKey || months[0]?.key || '');
  const [exactDate, setExactDate] = useState(Boolean(defaultDate));
  const [kickoffDate, setKickoffDate] = useState(defaultDate || '');
  const [actualDate, setActualDate] = useState(defaultDate || '');
  const [prepMonths, setPrepMonths] = useState(2);
  const [note, setNote] = useState('');
  const [description, setDescription] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);

  /**
   * Validated here as well as on the server. The server is the authority; this
   * exists so the person sees the problem next to the field instead of as a
   * toast after a round-trip.
   */
  const validate = (): Record<string, string> => {
    const next: Record<string, string> = {};

    if (!title.trim()) next.title = 'איך לקרוא לאירוע?';
    else if (title.trim().length > 200) next.title = 'השם ארוך מדי. אפשר עד 200 תווים';

    // The old form silently fell back to the 1st of the month here.
    if (exactDate && !actualDate) next.actualDate = 'בחר את התאריך המדויק';

    if (kickoffDate && exactDate && actualDate && kickoffDate > actualDate) {
      next.kickoffDate = 'תאריך תאריך התנעה צריך להיות לפני תאריך אמת';
    }
    if (kickoffDate && !exactDate && kickoffDate > `${monthKey}-31`) {
      next.kickoffDate = 'תאריך תאריך התנעה לא יכול להיות אחרי חודש היעד';
    }
    if (prepMonths < 0 || prepMonths > 12) next.prepMonths = 'בחר בין 0 ל-12 חודשים';

    return next;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      // Move focus to the first problem so keyboard users are not left guessing.
      const first = Object.keys(found)[0];
      document.getElementById(`ae-${first === 'actualDate' ? 'actual' : first === 'kickoffDate' ? 'kick' : first === 'prepMonths' ? 'prep' : 'title'}`)?.focus();
      return;
    }

    // A month-precision event anchors to the 1st. There is no second flag that
    // can disagree with the date — precision is the only source of truth.
    onAddEvent({
      title: title.trim(),
      category,
      kickoffDate: kickoffDate || null,
      actualDate: exactDate ? actualDate : `${monthKey}-01`,
      actualPrecision: exactDate ? 'day' : 'month',
      prepMonths: Number(prepMonths) || 0,
      note: note.trim() || null,
      description: description.trim() || null
    });
  };

  // Once the person has tried to submit, errors update as they fix them.
  const liveErrors = touched ? validate() : errors;
  const field = (name: string) => (touched ? liveErrors[name] : undefined);
  const hasErrors = Object.keys(liveErrors).length > 0;

  return (
    <Modal
      open={isOpen}
      onOpenChange={(o) => !o && onClose()}
      title="אירוע חדש"
      description="בחר מתי מתחילים לעבוד ומתי האירוע קורה"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            בטל שינוי בשם הלוח
          </Button>
          <Button variant="primary" form="add-event-form" type="submit" disabled={isSaving}>
            {isSaving ? 'שומר…' : 'צור אירוע'}
          </Button>
        </>
      }
    >
      <form id="add-event-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        {touched && hasErrors && (
          <div className="flex items-start gap-2.5 rounded-lg bg-late-soft px-3 py-2.5" role="alert">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-late" />
            <div className="flex flex-col gap-0.5">
              <span className="text-base font-semibold text-ink">יש עוד פרטים שצריך להשלים</span>
              <ul className="flex list-disc flex-col gap-0.5 ps-4">
                {Object.values(liveErrors).map((msg) => (
                  <li key={msg} className="text-sm text-ink-secondary">
                    {msg}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        <Field label="שם האירוע" required error={field('title')} htmlFor="ae-title">
          <Input
            id="ae-title"
            autoFocus
            required
            aria-invalid={Boolean(field('title'))}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="מבצע שבועות, השקת קטלוג ועדים"
            className={field('title') ? 'border-late' : undefined}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="קטגוריה" htmlFor="ae-cat">
            <Select id="ae-cat" value={category} onChange={(e) => setCategory(e.target.value as EventCategory)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_META[c].label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="חודש יעד" htmlFor="ae-month">
            <Select id="ae-month" value={monthKey} onChange={(e) => setMonthKey(e.target.value)}>
              {months.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.title}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <fieldset className="flex flex-col gap-3 rounded-lg bg-canvas p-3">
          <legend className="sr-only">מתי האירוע קורה?</legend>

          <label className="flex cursor-pointer items-center gap-2.5 text-base text-ink">
            <input
              type="checkbox"
              checked={exactDate}
              onChange={(e) => setExactDate(e.target.checked)}
              className="h-5 w-5 accent-primary"
            />
            יש תאריך אמת מדויק
            <span className="text-sm text-ink-tertiary">בלי יום מדויק: במהלך החודש</span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="תאריך תאריך התנעה" hint="עלייה לאוויר" error={field('kickoffDate')} htmlFor="ae-kick">
              <Input
                id="ae-kick"
                type="date"
                aria-invalid={Boolean(field('kickoffDate'))}
                value={kickoffDate}
                onChange={(e) => setKickoffDate(e.target.value)}
                className={field('kickoffDate') ? 'border-late' : undefined}
              />
            </Field>

            {exactDate && (
              <Field label="תאריך אמת" required hint="מועד האירוע" error={field('actualDate')} htmlFor="ae-actual">
                <Input
                  id="ae-actual"
                  type="date"
                  required
                  aria-invalid={Boolean(field('actualDate'))}
                  value={actualDate}
                  onChange={(e) => setActualDate(e.target.value)}
                  className={field('actualDate') ? 'border-late' : undefined}
                />
              </Field>
            )}
          </div>

          <Field label="חודשי הכנה" hint="חודשי הכנה" error={field('prepMonths')} htmlFor="ae-prep">
            <Input
              id="ae-prep"
              type="number"
              min={0}
              max={12}
              value={prepMonths}
              onChange={(e) => setPrepMonths(Number(e.target.value))}
            />
          </Field>
        </fieldset>

        <Field label="הערה" htmlFor="ae-note">
          <Input
            id="ae-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="המבצע המרכזי של החודש"
          />
        </Field>

        <Field label="תיאור" htmlFor="ae-desc">
          <Textarea
            id="ae-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="עובדי חברות, לקוחות ועדים, רשתות מזון ואופנה"
          />
        </Field>
      </form>
    </Modal>
  );
};
