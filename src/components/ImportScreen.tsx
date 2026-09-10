import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  Info,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Sheet,
  Upload
} from 'lucide-react';
import { GanttBoard, ImportPreview, ImportResult, PlannedImportEvent } from '../types';
import { api } from '../services/api';
import { describeError } from '../hooks/useBoardData';
import { MILESTONES } from '../data/milestones';
import { formatDate } from '../utils/dateHelpers';
import { CATEGORY_META } from '../utils/eventMeta';
import { Button, Badge, Field, Input, Select, Tooltip, cn, useToast } from './ui';

/**
 * Bringing a year of planning in from a spreadsheet.
 *
 * The screen exists because of one fact about the file it was built for: the
 * same campaign is written down three times, in two different layouts, and one
 * of those layouts is computed from the other by formula. Nobody could see that
 * by looking, and an importer that could not see it would have created four
 * copies of every campaign and called it a success.
 *
 * So nothing happens until a person has read what is about to happen. Five
 * steps, and only the last one writes anything.
 */

type Step = 1 | 2 | 3 | 4;

const STEPS: { id: Step; label: string }[] = [
  { id: 1, label: 'הקובץ' },
  { id: 2, label: 'לאיזה פרויקט' },
  { id: 3, label: 'מה ייכנס' },
  { id: 4, label: 'סיום' }
];

/** A date the server produced reads as a date; the file's own text reads as it was typed. */
const asShown = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDate(value) : value);

/** Reads a file into what the API takes. Held in state, so a retry costs nothing. */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const result = String(reader.result);
      // data:…;base64,XXXX — everything after the comma.
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}

const ACTION_META = {
  create: { label: 'חדש', tone: 'done' as const },
  update: { label: 'יתעדכן', tone: 'primary' as const },
  unchanged: { label: 'ללא שינוי', tone: 'neutral' as const },
  skip: { label: 'ידולג', tone: 'late' as const }
};

export function ImportScreen({
  boards,
  onBackHome,
  onOpenBoard
}: {
  boards: GanttBoard[];
  onBackHome: () => void;
  onOpenBoard: (boardId: string) => void;
}) {
  const { notify } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<{ name: string; size: number; base64: string } | null>(null);
  const [dragging, setDragging] = useState(false);

  const [target, setTarget] = useState<{ mode: 'existing' | 'new'; boardId: string; name: string }>({
    mode: boards.length > 0 ? 'existing' : 'new',
    boardId: boards[0]?.id ?? '',
    name: 'תכנון שנתי'
  });

  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Every decision in one place, and the plan always recomputed from it.
   *
   * The alternative — patching the plan on screen when a box is ticked — means
   * two implementations of the same rules, and the one in the browser is the
   * one nobody tests. The server owns what a tick means; the screen owns the
   * ticks.
   */
  const [decisions, setDecisions] = useState<{ accepted: string[]; rejected: string[]; excluded: string[] }>(
    { accepted: [], rejected: [], excluded: [] }
  );
  const [openRow, setOpenRow] = useState<string | null>(null);

  const excluded = useMemo(() => new Set(decisions.excluded), [decisions.excluded]);
  const accepted = useMemo(() => new Set(decisions.accepted), [decisions.accepted]);
  const rejected = useMemo(() => new Set(decisions.rejected), [decisions.rejected]);

  const boardId = target.mode === 'existing' ? target.boardId : null;

  const pick = async (chosen: File | null | undefined) => {
    if (!chosen) return;
    setError(null);
    if (!/\.xlsx$/i.test(chosen.name)) {
      setError('צריך קובץ אקסל מסוג xlsx. אם הקובץ ישן (xls) או CSV — פתח אותו באקסל ושמור בשם כ-xlsx.');
      return;
    }
    setBusy(true);
    try {
      const base64 = await toBase64(chosen);
      setFile({ name: chosen.name, size: chosen.size, base64 });
      setPreview(null);
      setStep(2);
    } catch {
      setError('לא הצלחנו לקרוא את הקובץ מהמחשב. נסה שוב.');
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fresh = { accepted: [], rejected: [], excluded: [] };
      const next = await api.imports.preview({
        fileName: file.name,
        fileBase64: file.base64,
        boardId,
        ...fresh
      });
      setPreview(next);
      setDecisions(fresh);
      setStep(3);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  /**
   * The plan on screen is the server's, and the counts are recomputed here from
   * the person's own ticks — so the number on the button is the number that
   * happens, and the server refuses if the two ever disagree.
   */
  const counts = useMemo(() => {
    const events = preview?.plan.events ?? [];
    const live = events.filter((e) => !excluded.has(e.sourceKey));
    return {
      create: live.filter((e) => e.action === 'create').length,
      update: live.filter((e) => e.action === 'update').length,
      unchanged: live.filter((e) => e.action === 'unchanged').length,
      skip: events.length - live.filter((e) => e.action !== 'skip').length
    };
  }, [preview, excluded]);

  const commit = async () => {
    if (!file || !preview) return;
    setBusy(true);
    setError(null);
    try {
      const done = await api.imports.commit({
        fileName: file.name,
        fileBase64: file.base64,
        boardId,
        boardName: target.mode === 'new' ? target.name.trim() : null,
        ...decisions,
        expect: { create: counts.create, update: counts.update }
      });
      setResult(done);
      setStep(4);
      notify('success', `נוספו ${done.created} אירועים`);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-canvas" dir="rtl">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3 sm:px-6">
          <Button variant="ghost" size="sm" onClick={onBackHome}>
            <ArrowRight className="h-4.5 w-4.5" />
            למסך הראשי
          </Button>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 pb-20 pt-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">ייבוא מאקסל</h1>
          <p className="mt-1 text-base text-ink-secondary">
            מעלים את קובץ התכנון, רואים בדיוק מה עומד להיכנס, ורק אז מאשרים.
          </p>
        </div>

        <Stepper current={step} />

        {error && (
          <div className="flex items-start gap-2.5 rounded-lg bg-late-soft px-3 py-2.5" role="alert">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-late" aria-hidden="true" />
            <span className="text-base text-ink">{error}</span>
          </div>
        )}

        {/* ------------------------------------------------------ 1 · the file */}
        {step === 1 && (
          <section
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void pick(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              'flex flex-col items-center gap-3 rounded-xl border-2 border-dashed bg-surface px-6 py-14 text-center transition-colors',
              dragging ? 'border-primary bg-primary-soft' : 'border-line-strong'
            )}
          >
            <span className="grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary">
              <Upload className="h-7 w-7" aria-hidden="true" />
            </span>
            <p className="text-md font-bold text-ink">גרור לכאן את קובץ האקסל</p>
            <p className="max-w-sm text-base text-ink-secondary">
              או בחר אותו מהמחשב. שום דבר לא נשמר עד שתאשר — השלב הבא רק מראה מה יש בקובץ.
            </p>
            {/*
              The visible button is the control. Left reachable, this input is a
              second, unlabelled "Choose File" in the tab order and in every
              screen reader — two ways to do one thing, one of them anonymous.
            */}
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx"
              tabIndex={-1}
              aria-hidden="true"
              className="sr-only"
              onChange={(e) => void pick(e.target.files?.[0])}
            />
            <Button variant="primary" onClick={() => fileInput.current?.click()} disabled={busy}>
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileSpreadsheet className="h-5 w-5" />}
              בחר קובץ
            </Button>
          </section>
        )}

        {/* -------------------------------------------------- 2 · which board */}
        {step === 2 && file && (
          <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 shadow-card">
            <div className="flex items-center gap-2.5 rounded-lg bg-canvas px-3 py-2.5">
              <FileSpreadsheet className="h-5 w-5 shrink-0 text-ink-tertiary" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-base font-semibold text-ink">{file.name}</span>
              <span className="shrink-0 text-sm text-ink-tertiary tnum">{Math.round(file.size / 1024)} KB</span>
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                החלף
              </Button>
            </div>

            <h2 className="text-md font-bold text-ink">לאיזה פרויקט להכניס את האירועים?</h2>

            <div className="flex flex-col gap-2">
              <Choice
                active={target.mode === 'existing'}
                disabled={boards.length === 0}
                onSelect={() => setTarget((t) => ({ ...t, mode: 'existing' }))}
                title="לפרויקט קיים"
                hint={
                  boards.length === 0
                    ? 'אין עדיין פרויקטים'
                    : 'אירוע שכבר קיים יתעדכן במקום להיווצר פעם שנייה'
                }
              >
                <Field label="הפרויקט" htmlFor="imp-board">
                  <Select
                    id="imp-board"
                    value={target.boardId}
                    onChange={(e) => setTarget((t) => ({ ...t, boardId: e.target.value }))}
                  >
                    {boards.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.eventCount} אירועים)
                      </option>
                    ))}
                  </Select>
                </Field>
              </Choice>

              <Choice
                active={target.mode === 'new'}
                onSelect={() => setTarget((t) => ({ ...t, mode: 'new' }))}
                title="לפרויקט חדש"
                hint="ניצור פרויקט ריק ונכניס אליו את כל מה שבקובץ"
              >
                <Field label="שם הפרויקט" htmlFor="imp-name">
                  <Input
                    id="imp-name"
                    value={target.name}
                    onChange={(e) => setTarget((t) => ({ ...t, name: e.target.value }))}
                    placeholder="תכנון שנתי 2027"
                  />
                </Field>
              </Choice>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ArrowRight className="h-5 w-5" />
                חזור
              </Button>
              <Button
                variant="primary"
                onClick={runPreview}
                disabled={busy || (target.mode === 'existing' ? !target.boardId : !target.name.trim())}
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowLeft className="h-5 w-5" />}
                {busy ? 'קורא את הקובץ…' : 'הצג לי מה יש בקובץ'}
              </Button>
            </div>
          </section>
        )}

        {/* ----------------------------------------------------- 3 · preview */}
        {step === 3 && preview && (
          <Preview
            preview={preview}
            counts={counts}
            excluded={excluded}
            accepted={accepted}
            rejected={rejected}
            openRow={openRow}
            busy={busy}
            onToggleRow={(key) => setOpenRow((k) => (k === key ? null : key))}
            onToggleExcluded={(key) => void decide('excluded', key)}
            onToggleSuggestion={(key, fromFile) => void decide(fromFile ? 'rejected' : 'accepted', key)}
            onBack={() => setStep(2)}
            onCommit={commit}
          />
        )}

        {/* ------------------------------------------------------ 4 · the report */}
        {step === 4 && result && (
          <Report result={result} preview={preview} onOpenBoard={onOpenBoard} onBackHome={onBackHome} />
        )}
      </main>
    </div>
  );

  /**
   * Records one tick and asks the server what the plan is now.
   *
   * Excluding a row only changes a count, but a suggestion changes dates — and
   * working out which dates is exactly the logic that must not exist twice. One
   * round trip per tick is a price worth paying for a preview that cannot lie.
   */
  async function decide(kind: 'accepted' | 'rejected' | 'excluded', key: string) {
    if (!file) return;
    const list = decisions[kind];
    const next = {
      ...decisions,
      [kind]: list.includes(key) ? list.filter((k) => k !== key) : [...list, key]
    };
    setDecisions(next);
    setBusy(true);
    try {
      setPreview(
        await api.imports.preview({ fileName: file.name, fileBase64: file.base64, boardId, ...next })
      );
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }
}

/* ------------------------------------------------------------------ steps */

function Stepper({ current }: { current: Step }) {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="שלבים">
      {STEPS.map((s, i) => {
        const done = current > s.id;
        const active = current === s.id;
        return (
          <li key={s.id} className="flex items-center gap-2">
            <span
              className={cn(
                'grid h-7 w-7 place-items-center rounded-full text-sm font-bold',
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
            {i < STEPS.length - 1 && <span className="h-px w-5 bg-line-strong" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

function Choice({
  active,
  disabled,
  onSelect,
  title,
  hint,
  children
}: {
  active: boolean;
  disabled?: boolean;
  onSelect: () => void;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border-2 p-3 transition-colors',
        active ? 'border-primary bg-primary-soft/40' : 'border-line',
        disabled && 'opacity-50'
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        aria-pressed={active}
        className="flex w-full items-start gap-2.5 text-start"
      >
        <span
          className={cn(
            'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2',
            active ? 'border-primary bg-primary text-white' : 'border-line-strong'
          )}
        >
          {active && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />}
        </span>
        <span className="flex flex-col">
          <span className="text-base font-bold text-ink">{title}</span>
          <span className="text-sm text-ink-tertiary">{hint}</span>
        </span>
      </button>
      {active && !disabled && <div className="mt-3 ps-7">{children}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- preview */

function Preview({
  preview,
  counts,
  excluded,
  accepted,
  rejected,
  openRow,
  busy,
  onToggleRow,
  onToggleExcluded,
  onToggleSuggestion,
  onBack,
  onCommit
}: {
  preview: ImportPreview;
  counts: { create: number; update: number; unchanged: number; skip: number };
  excluded: Set<string>;
  accepted: Set<string>;
  rejected: Set<string>;
  openRow: string | null;
  busy: boolean;
  onToggleRow: (key: string) => void;
  onToggleExcluded: (key: string) => void;
  onToggleSuggestion: (key: string, fromFile: boolean) => void;
  onBack: () => void;
  onCommit: () => void;
}) {
  const { plan, sheets } = preview;
  const problems = plan.events.flatMap((e) => e.issues.map((i) => ({ ...i, title: e.title })));
  const errors = problems.filter((p) => p.severity === 'error');
  const warnings = problems.filter((p) => p.severity === 'warning');
  const conflicts = plan.events.flatMap((e) => e.conflicts.map((c) => ({ ...c, title: e.title })));
  const suggestions = plan.events.flatMap((e) =>
    e.suggestions.map((s) => ({ ...s, title: e.title, key: `${e.sourceKey}:${s.field}` }))
  );

  const willWrite = counts.create + counts.update;

  return (
    <div className="flex flex-col gap-4">
      {/* what is in the file */}
      <section className="rounded-xl border border-line bg-surface p-4 shadow-card">
        <h2 className="mb-1 text-md font-bold text-ink">מה יש בקובץ</h2>
        <p className="mb-3 text-base text-ink-secondary">
          {plan.summary.sourceRows} שורות בקובץ מתארות{' '}
          <b className="text-ink">{plan.summary.events} אירועים</b>. אותה פעילות מופיעה בכמה
          גיליונות, ולכן היא נספרת פעם אחת.
        </p>
        <ul className="flex flex-col gap-1.5">
          {sheets.map((s) => (
            <li key={s.name} className="flex items-center gap-2 text-base">
              <Sheet
                className={cn('h-4.5 w-4.5 shrink-0', s.used ? 'text-done' : 'text-ink-disabled')}
                aria-hidden="true"
              />
              <span className={cn('font-semibold', s.used ? 'text-ink' : 'text-ink-tertiary')}>{s.name}</span>
              <span className="text-ink-tertiary">
                {s.used ? `· ${s.rows} שורות` : `· לא נקרא — ${s.reason ?? 'אין בו טבלה'}`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* the numbers */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="אירועים חדשים" value={counts.create} tone="done" icon={Plus} />
        <Stat label="אירועים שיתעדכנו" value={counts.update} tone="primary" icon={RefreshCw} />
        <Stat label="בלי שינוי" value={counts.unchanged} tone="neutral" icon={Check} />
        <Stat label="לא ייכנסו" value={counts.skip} tone={counts.skip ? 'late' : 'neutral'} icon={Minus} />
      </section>

      <p className="text-base text-ink-secondary">
        בקובץ הזה <b className="text-ink">אין משימות</b> — רק אירועים ותאריכים. את המשימות מחלקים
        בישיבת ההתנעה, אחרי הייבוא.
      </p>

      {/* problems, conflicts, suggestions */}
      {errors.length > 0 && (
        <Panel tone="late" icon={AlertTriangle} title={`${errors.length} דברים שלא נכנסים`}>
          {errors.map((p, i) => (
            <Line key={i} where={p.where} title={p.title} message={p.message} />
          ))}
        </Panel>
      )}

      {warnings.length > 0 && (
        <Panel tone="progress" icon={AlertTriangle} title={`${warnings.length} דברים ששווה לבדוק`}>
          {warnings.map((p, i) => (
            <Line key={i} where={p.where} title={p.title} message={p.message} />
          ))}
        </Panel>
      )}

      {conflicts.length > 0 && (
        <Panel tone="progress" icon={Info} title={`${conflicts.length} מקומות שבהם הגיליונות לא מסכימים`}>
          {conflicts.map((c, i) => (
            <div key={i} className="flex flex-col gap-1 border-b border-line py-2 last:border-0">
              <span className="text-base font-semibold text-ink">
                {c.title} · {c.fieldLabel}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {c.values.map((v) => (
                  <span
                    key={v.value}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-2 py-1 text-sm',
                      v.value === c.chosen ? 'bg-done-soft font-bold text-done' : 'bg-subtle text-ink-secondary'
                    )}
                  >
                    {v.value === c.chosen && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                    {formatDate(v.value)}
                    <span className="text-ink-tertiary">({v.where.join(', ')})</span>
                  </span>
                ))}
              </div>
              <span className="text-sm text-ink-tertiary">
                נבחר הערך מהגיליון שבו הוקלד התאריך ביד. אפשר לשנות אחרי הייבוא.
              </span>
            </div>
          ))}
        </Panel>
      )}

      {suggestions.length > 0 && (
        <Panel tone="primary" icon={Info} title={`${suggestions.length} הצעות לתיקון`}>
          {suggestions.map((s) => {
            const ticked = s.fromFile ? !rejected.has(s.key) : accepted.has(s.key);
            return (
              <label
                key={s.key}
                className="flex cursor-pointer items-start gap-2.5 border-b border-line py-2 last:border-0"
              >
                <input
                  type="checkbox"
                  checked={ticked}
                  disabled={busy}
                  onChange={() => onToggleSuggestion(s.key, s.fromFile)}
                  className="mt-1 h-4.5 w-4.5 shrink-0 accent-primary"
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-base text-ink">
                    <b>{s.title}</b> · {s.fieldLabel}:{' '}
                    <span className="text-late line-through">{asShown(s.from)}</span> →{' '}
                    <span className="font-bold text-done">{formatDate(s.to)}</span>
                  </span>
                  <span className="text-sm text-ink-tertiary">{s.reason}</span>
                  {!s.fromFile && (
                    <span className="text-sm text-progress">
                      זו הצעה בלבד. בלי סימון, התאריך נשמר כפי שהוא בקובץ.
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </Panel>
      )}

      {/* the rows */}
      <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <h2 className="border-b border-line px-4 py-3 text-md font-bold text-ink">
          כל האירועים שזוהו
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-3xl text-start">
            <thead>
              <tr className="border-b border-line bg-canvas text-xs font-semibold text-ink-tertiary">
                <th className="px-3 py-2 text-start">ייכנס</th>
                <th className="px-3 py-2 text-start">מה יקרה</th>
                <th className="px-3 py-2 text-start">שם האירוע</th>
                <th className="px-3 py-2 text-start">ישיבת התנעה</th>
                <th className="px-3 py-2 text-start">עלייה לאוויר</th>
                <th className="px-3 py-2 text-start">תאריך האירוע</th>
                <th className="px-3 py-2 text-start">הכנה</th>
                <th className="px-3 py-2 text-start">שורות בקובץ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {plan.events.map((e) => (
                <Row
                  key={e.sourceKey}
                  event={e}
                  excluded={excluded.has(e.sourceKey)}
                  open={openRow === e.sourceKey}
                  onToggleOpen={() => onToggleRow(e.sourceKey)}
                  onToggleExcluded={() => onToggleExcluded(e.sourceKey)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface/95 px-1 py-3 backdrop-blur">
        <span className="me-auto text-base text-ink-secondary">
          {willWrite === 0
            ? 'אין מה לייבא — הכול כבר קיים במערכת'
            : `עומדים להיכנס ${counts.create} אירועים חדשים ולהתעדכן ${counts.update}`}
        </span>
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          <ArrowRight className="h-5 w-5" />
          חזור
        </Button>
        <Button variant="primary" onClick={onCommit} disabled={busy || willWrite === 0}>
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
          {busy ? 'מייבא…' : `אשר וייבא ${willWrite} אירועים`}
        </Button>
      </div>
    </div>
  );
}

function Row({
  event,
  excluded,
  open,
  onToggleOpen,
  onToggleExcluded
}: {
  event: PlannedImportEvent;
  excluded: boolean;
  open: boolean;
  onToggleOpen: () => void;
  onToggleExcluded: () => void;
}) {
  const meta = ACTION_META[excluded ? 'skip' : event.action];
  const blocked = event.action === 'skip';
  const errors = event.issues.filter((i) => i.severity === 'error').length;
  const warnings = event.issues.filter((i) => i.severity === 'warning').length;

  return (
    <>
      <tr className={cn('text-base', (excluded || blocked) && 'opacity-55')}>
        <td className="px-3 py-2">
          <input
            type="checkbox"
            checked={!excluded && !blocked}
            disabled={blocked}
            onChange={onToggleExcluded}
            aria-label={`לכלול את ${event.title} בייבוא`}
            className="h-4.5 w-4.5 accent-primary"
          />
        </td>
        <td className="px-3 py-2">
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </td>
        <td className="px-3 py-2">
          <button onClick={onToggleOpen} className="flex items-center gap-1.5 text-start hover:underline">
            <span
              className={cn('h-2 w-2 shrink-0 rounded-full', CATEGORY_META[event.values.category].dot)}
              aria-hidden="true"
            />
            <span className="font-semibold text-ink">{event.title}</span>
            {errors > 0 && (
              <Tooltip label={`${errors} שגיאות`}>
                <AlertTriangle className="h-4 w-4 text-late" />
              </Tooltip>
            )}
            {warnings > 0 && (
              <Tooltip label={`${warnings} אזהרות`}>
                <AlertTriangle className="h-4 w-4 text-progress" />
              </Tooltip>
            )}
          </button>
        </td>
        <td className="px-3 py-2 text-ink-secondary tnum">
          {event.values.kickoffMeetingDate ? formatDate(event.values.kickoffMeetingDate) : '—'}
        </td>
        <td className="px-3 py-2 text-ink-secondary tnum">
          {event.values.kickoffDate ? formatDate(event.values.kickoffDate) : '—'}
        </td>
        <td className="px-3 py-2 text-ink-secondary tnum">
          {event.values.actualDate
            ? event.values.actualPrecision === 'month'
              ? `במהלך ${event.values.actualDate.slice(0, 7)}`
              : formatDate(event.values.actualDate)
            : '—'}
        </td>
        <td className="px-3 py-2 text-ink-secondary tnum">{event.values.prepMonths || '—'}</td>
        <td className="px-3 py-2 text-sm text-ink-tertiary">{event.sources.length}</td>
      </tr>

      {open && (
        <tr>
          <td colSpan={8} className="bg-canvas px-4 py-3">
            <div className="flex flex-col gap-3">
              <div>
                <h4 className="mb-1 text-sm font-bold text-ink-secondary">כל התאריכים</h4>
                <ul className="flex flex-wrap gap-x-4 gap-y-1">
                  {MILESTONES.map((m) => {
                    const value = (event.values as unknown as Record<string, string | null>)[m.field];
                    return (
                      <li key={m.key} className="flex items-center gap-1.5 text-sm">
                        <m.icon className={cn('h-4 w-4', value ? m.text : 'text-ink-disabled')} aria-hidden="true" />
                        <span className={value ? 'text-ink-secondary' : 'text-ink-disabled'}>{m.short}</span>
                        <span className={cn('tnum', value ? 'font-semibold text-ink' : 'text-ink-disabled')}>
                          {value ? formatDate(value) : 'לא נקבע'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div>
                <h4 className="mb-1 text-sm font-bold text-ink-secondary">מאיפה בקובץ</h4>
                <p className="text-sm text-ink-tertiary">{event.sources.join(' · ')}</p>
              </div>

              {event.changes && event.changes.length > 0 && (
                <div>
                  <h4 className="mb-1 text-sm font-bold text-ink-secondary">מה ישתנה</h4>
                  <ul className="flex flex-col gap-0.5">
                    {event.changes.map((c) => (
                      <li key={c.field} className="text-sm text-ink-secondary">
                        {c.fieldLabel}: <span className="text-ink-tertiary line-through">{c.from}</span> →{' '}
                        <b className="text-ink">{c.to}</b>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {event.issues.length > 0 && (
                <ul className="flex flex-col gap-0.5">
                  {event.issues.map((i, n) => (
                    <li
                      key={n}
                      className={cn('text-sm', i.severity === 'error' ? 'text-late' : 'text-progress')}
                    >
                      {i.where} · {i.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ----------------------------------------------------------------- report */

function Report({
  result,
  preview,
  onOpenBoard,
  onBackHome
}: {
  result: ImportResult;
  preview: ImportPreview | null;
  onOpenBoard: (boardId: string) => void;
  onBackHome: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <section className="flex items-start gap-3 rounded-xl border border-done/30 bg-done-soft p-4">
        <CheckCircle2 className="mt-0.5 h-7 w-7 shrink-0 text-done" aria-hidden="true" />
        <div>
          <h2 className="text-md font-bold text-ink">הייבוא הסתיים</h2>
          <p className="text-base text-ink-secondary">
            {result.boardCreated ? `נוצר הפרויקט «${result.board.name}» ו` : ''}
            נוספו {result.created} אירועים
            {result.updated > 0 ? `, ${result.updated} התעדכנו` : ''}
            {result.unchanged > 0 ? `, ${result.unchanged} כבר היו זהים` : ''}
            {result.skipped > 0 ? `, ${result.skipped} דולגו` : ''}.
          </p>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="אירועים שנוצרו" value={result.created} tone="done" icon={Plus} />
        <Stat label="אירועים שעודכנו" value={result.updated} tone="primary" icon={RefreshCw} />
        <Stat label="משימות" value={result.tasks} tone="neutral" icon={Check} />
        <Stat
          label="דברים שדרשו תיקון"
          value={result.warnings}
          tone={result.warnings ? 'progress' : 'neutral'}
          icon={AlertTriangle}
        />
      </section>

      <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-md font-bold text-ink">עשר רשומות לבדיקה מול האקסל</h2>
          <p className="text-sm text-ink-tertiary">
            כל שורה כאן מציינת מאיזה גיליון ואיזו שורה בקובץ היא הגיעה. אפשר לפתוח את האקסל
            ולהשוות.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-2xl">
            <thead>
              <tr className="border-b border-line bg-canvas text-xs font-semibold text-ink-tertiary">
                <th className="px-3 py-2 text-start">שם האירוע</th>
                <th className="px-3 py-2 text-start">ישיבת התנעה</th>
                <th className="px-3 py-2 text-start">עלייה לאוויר</th>
                <th className="px-3 py-2 text-start">תאריך האירוע</th>
                <th className="px-3 py-2 text-start">הכנה</th>
                <th className="px-3 py-2 text-start">שורות המקור</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-base">
              {result.sample.map((row) => (
                <tr key={row.title + row.actualDate}>
                  <td className="px-3 py-2 font-semibold text-ink">{row.title}</td>
                  <td className="px-3 py-2 text-ink-secondary tnum">
                    {row.kickoffMeetingDate ? formatDate(row.kickoffMeetingDate) : '—'}
                  </td>
                  <td className="px-3 py-2 text-ink-secondary tnum">
                    {row.kickoffDate ? formatDate(row.kickoffDate) : '—'}
                  </td>
                  <td className="px-3 py-2 text-ink-secondary tnum">{formatDate(row.actualDate)}</td>
                  <td className="px-3 py-2 text-ink-secondary tnum">{row.prepMonths || '—'}</td>
                  <td className="px-3 py-2 text-sm text-ink-tertiary">{row.sources.join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {preview && preview.plan.summary.warnings > 0 && (
        <p className="text-base text-ink-secondary">
          {preview.plan.summary.warnings} אזהרות נרשמו ביומן הפעילות של הפרויקט. אף תאריך לא שונה
          בלי אישור.
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onBackHome}>
          למסך הראשי
        </Button>
        <Button variant="primary" onClick={() => onOpenBoard(result.board.id)}>
          <ArrowLeft className="h-5 w-5" />
          פתח את הפרויקט
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ atoms */

function Stat({
  label,
  value,
  tone,
  icon: Icon
}: {
  label: string;
  value: number;
  tone: 'done' | 'primary' | 'late' | 'progress' | 'neutral';
  icon: typeof Plus;
}) {
  const TONES = {
    done: 'bg-done-soft text-done',
    primary: 'bg-primary-soft text-primary',
    late: 'bg-late-soft text-late',
    progress: 'bg-progress-soft text-progress',
    neutral: 'bg-subtle text-ink-tertiary'
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-card">
      <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg', TONES[tone])}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-2xl font-bold text-ink tnum">{value}</span>
        <span className="truncate text-sm text-ink-tertiary">{label}</span>
      </div>
    </div>
  );
}

function Panel({
  tone,
  icon: Icon,
  title,
  children
}: {
  tone: 'late' | 'progress' | 'primary';
  icon: typeof Info;
  title: string;
  children: React.ReactNode;
}) {
  const TONES = {
    late: 'border-late/30 bg-late-soft/40 text-late',
    progress: 'border-progress/30 bg-progress-soft/40 text-progress',
    primary: 'border-primary/30 bg-primary-soft/40 text-primary'
  };
  return (
    <section className={cn('rounded-xl border p-4', TONES[tone])}>
      <h3 className="mb-2 flex items-center gap-2 text-md font-bold">
        <Icon className="h-5 w-5" aria-hidden="true" />
        {title}
      </h3>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

function Line({ where, title, message }: { where: string; title: string; message: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 border-b border-line py-1.5 text-base last:border-0">
      <span className="rounded bg-surface px-1.5 py-0.5 text-xs font-semibold text-ink-secondary">{where}</span>
      <span className="font-semibold text-ink">{title}</span>
      <span className="text-ink-secondary">{message}</span>
    </div>
  );
}
