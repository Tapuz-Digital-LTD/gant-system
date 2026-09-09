import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Plus, TriangleAlert } from 'lucide-react';
import { EventCategory, MilestoneKey } from '../types';
import type { EventInput } from '../services/api';
import { CATEGORY_META, currentMonthKey } from '../utils/eventMeta';
import { MILESTONES, OPTIONAL_MILESTONES, milestoneText, milestoneWarnings } from '../data/milestones';
import { monthName, monthKeyFromOrdinal, monthOrdinal } from '../utils/period';
import { Modal, Button, Field, Input, Textarea, cn } from './ui';

interface AddEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddEvent: (input: EventInput) => void;
  defaultDate?: string;
  defaultMonthKey?: string;
  isSaving?: boolean;
}

/**
 * Two questions, then save.
 *
 * The form it replaces asked for eight things at once, including a "target
 * month" and an "actual date" that read as two contradictory answers to the
 * same question. Here step one is what is happening, step two is when, and
 * everything optional is folded away until somebody asks for it.
 *
 * The optional dates are never invented. Left empty they are saved as null, and
 * the timeline draws them as unknown rather than as a guess.
 */

const CATEGORIES: EventCategory[] = ['campaign', 'holiday', 'b2b', 'social', 'operational', 'other'];

type StepId = 1 | 2;

const STEPS: { id: StepId; label: string }[] = [
  { id: 1, label: 'מה קורה' },
  { id: 2, label: 'מתי' }
];

/** One shape for "not filled in", so an empty field is never a stray undefined. */
const NO_DATES: Record<MilestoneKey, string> = {
  workStart: '',
  review: '',
  freeze: '',
  kickoff: '',
  announce: '',
  actual: '',
  campaignEnd: ''
};

export const AddEventModal: React.FC<AddEventModalProps> = ({
  isOpen,
  onClose,
  onAddEvent,
  defaultDate,
  defaultMonthKey,
  isSaving
}) => {
  const [step, setStep] = useState<StepId>(1);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<EventCategory>('campaign');

  const [hasExactDay, setHasExactDay] = useState(Boolean(defaultDate));
  const [actualDate, setActualDate] = useState(defaultDate ?? '');
  const [monthKey, setMonthKey] = useState(
    defaultMonthKey ?? defaultDate?.slice(0, 7) ?? currentMonthKey()
  );
  const [prepMonths, setPrepMonths] = useState(2);

  const [dates, setDates] = useState<Record<MilestoneKey, string>>(NO_DATES);
  const [showExtraDates, setShowExtraDates] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [note, setNote] = useState('');
  const [description, setDescription] = useState('');

  const [tried, setTried] = useState<Record<StepId, boolean>>({ 1: false, 2: false });

  // Everything above is one piece of state for both steps, so going back and
  // forward never loses what was typed.

  /** The dates this kind of event usually needs. The rest fold away. */
  const suggested = useMemo(
    () => OPTIONAL_MILESTONES.filter((m) => m.openFor.includes(category)),
    [category]
  );
  const rest = useMemo(
    () => OPTIONAL_MILESTONES.filter((m) => !m.openFor.includes(category)),
    [category]
  );

  const resolvedActual = hasExactDay ? actualDate : `${monthKey}-01`;

  /** Spelled out under the field, so nobody has to do the arithmetic themselves. */
  const prepStartsIn = useMemo(() => {
    if (!resolvedActual || resolvedActual.length < 7) return null;
    return monthKeyFromOrdinal(monthOrdinal(resolvedActual) - Math.max(0, prepMonths));
  }, [resolvedActual, prepMonths]);

  const errors = useMemo(() => {
    const out: Partial<Record<'title' | 'actualDate' | 'monthKey' | 'prepMonths', string>> = {};
    if (!title.trim()) out.title = 'צריך שם, אחרת אי אפשר יהיה למצוא את האירוע';
    else if (title.trim().length > 200) out.title = 'השם ארוך מדי. אפשר עד 200 תווים';

    if (hasExactDay && !actualDate) out.actualDate = 'בחר את היום שבו האירוע קורה';
    if (!hasExactDay && !/^\d{4}-\d{2}$/.test(monthKey)) out.monthKey = 'בחר את החודש שבו האירוע קורה';
    if (prepMonths < 0 || prepMonths > 12) out.prepMonths = 'בחר בין 0 ל-12 חודשים';
    return out;
  }, [title, hasExactDay, actualDate, monthKey, prepMonths]);

  const stepErrors: Record<StepId, string[]> = {
    1: [errors.title].filter(Boolean) as string[],
    2: [errors.actualDate, errors.monthKey, errors.prepMonths].filter(Boolean) as string[]
  };

  /** An odd order is pointed out. It is never a reason to refuse the save. */
  const warnings = useMemo(
    () =>
      milestoneWarnings({
        workStartDate: dates.workStart || null,
        reviewDate: dates.review || null,
        freezeDate: dates.freeze || null,
        kickoffDate: dates.kickoff || null,
        announceDate: dates.announce || null,
        actualDate: resolvedActual,
        campaignEndDate: dates.campaignEnd || null,
        actualPrecision: hasExactDay ? 'day' : 'month'
      }),
    [dates, resolvedActual, hasExactDay]
  );

  const goToStep = (next: StepId) => {
    if (next > step && stepErrors[step].length > 0) {
      setTried((t) => ({ ...t, [step]: true }));
      document.getElementById(step === 1 ? 'ae-title' : 'ae-actual')?.focus();
      return;
    }
    setStep(next);
  };

  const submit = (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    setTried({ 1: true, 2: true });
    if (stepErrors[1].length > 0) {
      setStep(1);
      return;
    }
    if (stepErrors[2].length > 0) return;

    onAddEvent({
      title: title.trim(),
      category,
      actualDate: resolvedActual,
      actualPrecision: hasExactDay ? 'day' : 'month',
      prepMonths: Number(prepMonths) || 0,
      workStartDate: dates.workStart || null,
      reviewDate: dates.review || null,
      freezeDate: dates.freeze || null,
      kickoffDate: dates.kickoff || null,
      announceDate: dates.announce || null,
      campaignEndDate: dates.campaignEnd || null,
      note: note.trim() || null,
      description: description.trim() || null
    });
  };

  const showErrors = tried[step];

  return (
    <Modal
      open={isOpen}
      onOpenChange={(o) => !o && onClose()}
      title="אירוע חדש"
      description={step === 1 ? 'נתחיל במה שקורה' : 'עכשיו התאריכים'}
      footer={
        <>
          {step === 1 ? (
            <Button key="cancel" variant="ghost" onClick={onClose}>
              ביטול
            </Button>
          ) : (
            <Button key="back" variant="ghost" onClick={() => setStep(1)}>
              <ArrowRight className="h-5 w-5" />
              חזור
            </Button>
          )}

          {/*
            Distinct keys, and never type="submit".

            Reusing one element for both roles created an event on the first
            click of "המשך": React swapped the attributes in place during the
            handler, and the browser then evaluated the click's default action
            against the button as it had just become — a submit button. Half a
            form, saved, with one click.

            The keys stop React from patching one into the other, and calling
            submit() by hand means there is no default action to misfire. The
            form's onSubmit still handles Enter inside a field.
          */}
          {step === 1 ? (
            <Button key="next" variant="primary" onClick={() => goToStep(2)}>
              המשך
              <ArrowLeft className="h-5 w-5" />
            </Button>
          ) : (
            <Button key="save" variant="primary" onClick={submit} disabled={isSaving}>
              {isSaving ? (
                'שומר…'
              ) : (
                <>
                  <Check className="h-5 w-5" />
                  שמור אירוע
                </>
              )}
            </Button>
          )}
        </>
      }
    >
      <Stepper current={step} onGo={goToStep} />

      <form id="add-event-form" onSubmit={submit} noValidate className="mt-4 flex flex-col gap-5">
        {showErrors && stepErrors[step].length > 0 && (
          <div className="flex items-start gap-2.5 rounded-lg bg-late-soft px-3 py-2.5" role="alert">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-late" aria-hidden="true" />
            <div className="flex flex-col gap-0.5">
              <span className="text-base font-semibold text-ink">עוד רגע — חסר משהו</span>
              <ul className="flex list-disc flex-col gap-0.5 ps-4">
                {stepErrors[step].map((msg) => (
                  <li key={msg} className="text-base text-ink-secondary">
                    {msg}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {step === 1 && (
          <>
            <Field
              label="איך קוראים לאירוע?"
              required
              error={showErrors ? errors.title : undefined}
              htmlFor="ae-title"
            >
              <Input
                id="ae-title"
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="מבצע חנוכה, יום המשפחה, השקת קטלוג ועדים"
                className={cn('h-11 text-md', showErrors && errors.title && 'border-late')}
                aria-invalid={Boolean(showErrors && errors.title)}
              />
            </Field>

            <fieldset>
              <legend className="mb-2 text-xs font-semibold text-ink-secondary">
                איזה סוג אירוע זה?
              </legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CATEGORIES.map((value) => {
                  const meta = CATEGORY_META[value];
                  const active = category === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setCategory(value)}
                      aria-pressed={active}
                      className={cn(
                        'flex flex-col items-start gap-1 rounded-lg border-2 p-2.5 text-start transition-colors',
                        active
                          ? 'border-primary bg-primary-soft'
                          : 'border-line bg-surface hover:border-line-strong hover:bg-subtle'
                      )}
                    >
                      <span
                        className={cn('grid h-8 w-8 place-items-center rounded-md', meta.soft, meta.text)}
                      >
                        <meta.icon className="h-4.5 w-4.5" aria-hidden="true" />
                      </span>
                      <span className="text-base font-semibold text-ink">{meta.label}</span>
                      <span className="text-xs leading-snug text-ink-tertiary">{meta.hint}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </>
        )}

        {step === 2 && (
          <>
            <fieldset className="flex flex-col gap-3 rounded-lg border border-line bg-canvas p-3">
              <legend className="px-1 text-xs font-semibold text-ink-secondary">
                {milestoneText(MILESTONES.find((m) => m.key === 'actual')!, category).label}
              </legend>

              <div className="flex gap-2">
                <PrecisionChoice
                  active={hasExactDay}
                  onSelect={() => setHasExactDay(true)}
                  title="ביום מסוים"
                  hint="יש תאריך מדויק"
                />
                <PrecisionChoice
                  active={!hasExactDay}
                  onSelect={() => setHasExactDay(false)}
                  title="במהלך חודש"
                  hint="עוד אין יום מדויק"
                />
              </div>

              {hasExactDay ? (
                <Field
                  label="התאריך"
                  required
                  error={showErrors ? errors.actualDate : undefined}
                  htmlFor="ae-actual"
                >
                  <Input
                    id="ae-actual"
                    type="date"
                    value={actualDate}
                    onChange={(e) => {
                      setActualDate(e.target.value);
                      if (e.target.value) setMonthKey(e.target.value.slice(0, 7));
                    }}
                    className={cn('h-11', showErrors && errors.actualDate && 'border-late')}
                    aria-invalid={Boolean(showErrors && errors.actualDate)}
                  />
                </Field>
              ) : (
                <Field
                  label="החודש"
                  required
                  hint="אפשר לבחור כל חודש, גם בשנים הבאות"
                  error={showErrors ? errors.monthKey : undefined}
                  htmlFor="ae-actual"
                >
                  <Input
                    id="ae-actual"
                    type="month"
                    value={monthKey}
                    onChange={(e) => setMonthKey(e.target.value)}
                    className={cn('h-11', showErrors && errors.monthKey && 'border-late')}
                  />
                </Field>
              )}
            </fieldset>

            <Field
              label="כמה זמן צריך להתכונן?"
              hint="בחודשים"
              error={showErrors ? errors.prepMonths : undefined}
              htmlFor="ae-prep"
            >
              <Input
                id="ae-prep"
                type="number"
                min={0}
                max={12}
                value={prepMonths}
                onChange={(e) => setPrepMonths(Number(e.target.value))}
                className="h-11 max-w-28"
              />
              {prepStartsIn && (
                <p className="mt-1.5 text-base text-ink-secondary">
                  ← לפי זה מתחילים לעבוד{' '}
                  <b className="text-ink">
                    במהלך {monthName(prepStartsIn)} {prepStartsIn.slice(0, 4)}
                  </b>
                </p>
              )}
            </Field>

            <section className="flex flex-col gap-3">
              {suggested.length > 0 && (
                <>
                  <h3 className="text-xs font-semibold text-ink-secondary">
                    תאריכי תכנון — אפשר להשאיר ריק
                  </h3>
                  {suggested.map((m) => (
                    <MilestoneField
                      key={m.key}
                      meta={m}
                      category={category}
                      value={dates[m.key]}
                      onChange={(v) => setDates((d) => ({ ...d, [m.key]: v }))}
                      sameDayAs={
                        m.key === 'announce' && dates.kickoff && !dates.announce
                          ? dates.kickoff
                          : undefined
                      }
                    />
                  ))}
                </>
              )}

              {rest.length > 0 && (
                <Disclosure
                  open={showExtraDates}
                  onToggle={() => setShowExtraDates((v) => !v)}
                  label="עוד תאריכי תכנון"
                >
                  {rest.map((m) => (
                    <MilestoneField
                      key={m.key}
                      meta={m}
                      category={category}
                      value={dates[m.key]}
                      onChange={(v) => setDates((d) => ({ ...d, [m.key]: v }))}
                    />
                  ))}
                </Disclosure>
              )}
            </section>

            {warnings.length > 0 && (
              <div className="flex items-start gap-2.5 rounded-lg bg-progress-soft px-3 py-2.5">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-progress" aria-hidden="true" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-base font-semibold text-ink">שווה לבדוק את סדר התאריכים</span>
                  {warnings.map((w) => (
                    <span key={w.key + w.message} className="text-base text-ink-secondary">
                      {w.message}
                    </span>
                  ))}
                  <span className="mt-0.5 text-sm text-ink-tertiary">אפשר לשמור ככה. זו רק הערה.</span>
                </div>
              </div>
            )}

            <Disclosure open={showNotes} onToggle={() => setShowNotes((v) => !v)} label="הערה ותיאור">
              <Field label="הערה קצרה" htmlFor="ae-note">
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
                  placeholder="למי הקמפיין מיועד, מה הוא כולל, מי מעורב"
                />
              </Field>
            </Disclosure>
          </>
        )}
      </form>
    </Modal>
  );
};

function Stepper({ current, onGo }: { current: StepId; onGo: (s: StepId) => void }) {
  return (
    <ol className="flex items-center gap-2" aria-label="שלבים">
      {STEPS.map((s, i) => {
        const done = current > s.id;
        const active = current === s.id;
        return (
          <li key={s.id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onGo(s.id)}
              aria-current={active ? 'step' : undefined}
              className="flex items-center gap-2 rounded-md px-1 py-0.5"
            >
              <span
                className={cn(
                  'grid h-7 w-7 place-items-center rounded-full text-sm font-bold transition-colors',
                  active && 'bg-primary text-white',
                  done && 'bg-done text-white',
                  !active && !done && 'bg-subtle text-ink-tertiary'
                )}
              >
                {done ? <Check className="h-4 w-4" aria-hidden="true" /> : s.id}
              </span>
              <span className={cn('text-base font-semibold', active ? 'text-ink' : 'text-ink-tertiary')}>
                {s.label}
              </span>
            </button>
            {i < STEPS.length - 1 && <span className="h-px w-6 bg-line-strong" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

function PrecisionChoice({
  active,
  onSelect,
  title,
  hint
}: {
  active: boolean;
  onSelect: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        'flex flex-1 flex-col items-start gap-0.5 rounded-lg border-2 p-2.5 text-start transition-colors',
        active ? 'border-primary bg-primary-soft' : 'border-line bg-surface hover:border-line-strong'
      )}
    >
      <span className="text-base font-semibold text-ink">{title}</span>
      <span className="text-xs text-ink-tertiary">{hint}</span>
    </button>
  );
}

function MilestoneField({
  meta,
  category,
  value,
  onChange,
  sameDayAs
}: {
  meta: (typeof MILESTONES)[number];
  /** The wording follows the kind of work — see milestoneText. */
  category: EventCategory;
  value: string;
  onChange: (value: string) => void;
  /** Offers to copy a sibling date. An offer a person accepts, never an auto-fill. */
  sameDayAs?: string;
}) {
  const id = `ae-${meta.key}`;
  const text = milestoneText(meta, category);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex items-center gap-1.5 text-base font-semibold text-ink">
        <span className={cn('grid h-6 w-6 place-items-center rounded', meta.bg, meta.text)}>
          <meta.icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        {text.label}
      </label>
      <p className="text-sm text-ink-tertiary">{text.hint}</p>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 max-w-52"
        />
        {sameDayAs && (
          <Button variant="ghost" size="sm" onClick={() => onChange(sameDayAs)}>
            <Plus className="h-4 w-4" />
            אותו יום
          </Button>
        )}
      </div>
    </div>
  );
}

function Disclosure({
  open,
  onToggle,
  label,
  children
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-3 py-2.5 text-base font-semibold text-ink-secondary transition-colors hover:bg-subtle hover:text-ink"
      >
        <ChevronDown
          className={cn('h-4.5 w-4.5 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
        {label}
      </button>
      {open && <div className="flex flex-col gap-3 border-t border-line p-3">{children}</div>}
    </div>
  );
}
