import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Loader2,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  X
} from 'lucide-react';
import { DashboardSize, SavedReport } from '../types';
import { api } from '../services/api';
import { describeError } from '../hooks/useBoardData';
import { ReportChart } from './reports/Charts';
import { describeDefinition } from './reports/ReportBuilder';
import { Button, cn, useToast } from './ui';

/**
 * A morning screen made of answers somebody already decided were worth keeping.
 *
 * Deliberately not a BI canvas: no free placement, no resizing by drag, no
 * widget library. A dashboard here is an ordered list of saved reports and how
 * wide each one sits — which is every arrangement anybody actually wants, and
 * it survives a phone.
 *
 * Reordering is buttons rather than drag. A dashboard is arranged once and read
 * every day, so the rare action does not need to be the fast one — and arrows
 * work for somebody on a keyboard, which drag never has.
 */

const SIZES: { key: DashboardSize; label: string; span: string }[] = [
  { key: 'small', label: 'צר', span: 'lg:col-span-1' },
  { key: 'medium', label: 'רגיל', span: 'lg:col-span-2' },
  { key: 'large', label: 'רחב', span: 'lg:col-span-3' }
];

export function DashboardScreen({
  canSave,
  onBackHome,
  onOpenReports,
  onOpenReport
}: {
  canSave: boolean;
  onBackHome: () => void;
  onOpenReports: () => void;
  onOpenReport: (id: string) => void;
}) {
  const { notify } = useToast();
  const qc = useQueryClient();

  const savedQuery = useQuery({ queryKey: ['saved-reports'], queryFn: api.reports.saved.list });
  const dashboardQuery = useQuery({ queryKey: ['dashboard'], queryFn: api.reports.dashboard.get });

  const save = useMutation({
    mutationFn: api.reports.dashboard.save,
    onSuccess: (next) => qc.setQueryData(['dashboard'], next)
  });

  const [editing, setEditing] = useState(false);

  const saved = savedQuery.data ?? [];
  const byId = useMemo(() => new Map(saved.map((r) => [r.id, r])), [saved]);

  /**
   * An empty dashboard is the pinned reports.
   *
   * Somebody who has pinned four reports has already said what belongs on their
   * morning screen; making them arrange it a second time before it shows
   * anything is asking the same question twice.
   */
  const layout = useMemo(() => {
    const stored = (dashboardQuery.data?.layout ?? []).filter((c) => byId.has(c.savedReportId));
    if (stored.length > 0) return stored;
    return saved.filter((r) => r.pinned).map((r) => ({ savedReportId: r.id, size: 'medium' as DashboardSize }));
  }, [dashboardQuery.data, saved, byId]);

  const commit = (next: typeof layout) => {
    save.mutate(next, { onError: (e) => notify('error', describeError(e)) });
  };

  const move = (index: number, delta: number) => {
    const next = [...layout];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };

  const resize = (index: number, size: DashboardSize) => {
    const next = layout.map((c, i) => (i === index ? { ...c, size } : c));
    commit(next);
  };

  const remove = (index: number) => commit(layout.filter((_, i) => i !== index));

  const add = (id: string) => commit([...layout, { savedReportId: id, size: 'medium' }]);

  if (savedQuery.isLoading || dashboardQuery.isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas" dir="rtl">
        <Loader2 className="h-6 w-6 animate-spin text-ink-tertiary" aria-hidden="true" />
      </div>
    );
  }

  const available = saved.filter((r) => !layout.some((c) => c.savedReportId === r.id));

  return (
    <div className="min-h-dvh bg-canvas" dir="rtl">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:px-6">
          <Button variant="ghost" size="sm" onClick={onBackHome}>
            <ArrowRight className="h-4.5 w-4.5" />
            למסך הראשי
          </Button>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 pb-20 pt-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-ink">לוח המחוונים שלי</h1>
            <p className="mt-1 text-base text-ink-secondary">
              הדוחות ששמרת, על מסך אחד. הסידור שלך בלבד — לאף אחד אחר הוא לא משתנה.
            </p>
          </div>
          <Button variant="secondary" onClick={onOpenReports}>
            <BarChart3 className="h-5 w-5" />
            כל הדוחות
          </Button>
          {canSave && layout.length > 0 && (
            <Button variant={editing ? 'primary' : 'secondary'} onClick={() => setEditing((v) => !v)}>
              {editing ? <Check className="h-5 w-5" /> : <Pencil className="h-5 w-5" />}
              {editing ? 'סיימתי לסדר' : 'סדר את המסך'}
            </Button>
          )}
        </div>

        {layout.length === 0 ? (
          <EmptyDashboard hasReports={saved.length > 0} onOpenReports={onOpenReports} />
        ) : (
          <div className="grid gap-3 lg:grid-cols-3">
            {layout.map((card, index) => {
              const report = byId.get(card.savedReportId);
              if (!report) return null;
              return (
                <Card
                  key={card.savedReportId}
                  report={report}
                  size={card.size}
                  editing={editing}
                  first={index === 0}
                  last={index === layout.length - 1}
                  onOpen={() => onOpenReport(report.id)}
                  onMove={(delta) => move(index, delta)}
                  onResize={(size) => resize(index, size)}
                  onRemove={() => remove(index)}
                />
              );
            })}
          </div>
        )}

        {editing && available.length > 0 && (
          <section className="rounded-xl border border-dashed border-line-strong bg-surface p-4">
            <h2 className="mb-2 text-base font-bold text-ink">להוסיף למסך</h2>
            <div className="flex flex-wrap gap-1.5">
              {available.map((r) => (
                <button
                  key={r.id}
                  onClick={() => add(r.id)}
                  className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-base text-ink-secondary transition-colors hover:border-primary hover:text-ink"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {r.name}
                </button>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Card({
  report,
  size,
  editing,
  first,
  last,
  onOpen,
  onMove,
  onResize,
  onRemove
}: {
  report: SavedReport;
  size: DashboardSize;
  editing: boolean;
  first: boolean;
  last: boolean;
  onOpen: () => void;
  onMove: (delta: number) => void;
  onResize: (size: DashboardSize) => void;
  onRemove: () => void;
}) {
  const span = SIZES.find((s) => s.key === size)?.span ?? 'lg:col-span-2';
  const result = useQuery({
    queryKey: ['report-run', report.definition],
    queryFn: () => api.reports.run(report.definition),
    staleTime: 60_000
  });

  const modelQuery = useQuery({ queryKey: ['report-model'], queryFn: api.reports.model, staleTime: 60 * 60_000 });

  return (
    <section
      className={cn('flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 shadow-card', span)}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <button onClick={onOpen} className="truncate text-md font-bold text-ink hover:underline">
            {report.name}
          </button>
          {modelQuery.data && (
            <p className="truncate text-sm text-ink-tertiary">
              {describeDefinition(modelQuery.data, report.definition)}
            </p>
          )}
        </div>

        {editing && (
          <div className="flex shrink-0 items-center gap-0.5">
            <IconButton label="הזז ימינה" onClick={() => onMove(-1)} disabled={first}>
              <ChevronRight className="h-4.5 w-4.5" />
            </IconButton>
            <IconButton label="הזז שמאלה" onClick={() => onMove(1)} disabled={last}>
              <ChevronLeft className="h-4.5 w-4.5" />
            </IconButton>
            <IconButton
              label={size === 'large' ? 'הקטן' : 'הגדל'}
              onClick={() => onResize(size === 'large' ? 'small' : size === 'small' ? 'medium' : 'large')}
            >
              {size === 'large' ? <Minimize2 className="h-4.5 w-4.5" /> : <Maximize2 className="h-4.5 w-4.5" />}
            </IconButton>
            <IconButton label="הסר מהמסך" onClick={onRemove}>
              <X className="h-4.5 w-4.5" />
            </IconButton>
          </div>
        )}
      </div>

      <div className="min-h-24">
        {result.isLoading ? (
          <div className="grid h-24 place-items-center text-ink-disabled" role="status">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            <span className="sr-only">טוען את {report.name}</span>
          </div>
        ) : result.isError ? (
          <p className="py-6 text-center text-sm text-late">{describeError(result.error)}</p>
        ) : result.data ? (
          <ReportChart result={result.data} kind={report.chart} compact={size !== 'large'} />
        ) : null}
      </div>
    </section>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid h-8 w-8 place-items-center rounded-lg text-ink-tertiary transition hover:bg-subtle hover:text-ink disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function EmptyDashboard({ hasReports, onOpenReports }: { hasReports: boolean; onOpenReports: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary">
        <LayoutDashboard className="h-7 w-7" aria-hidden="true" />
      </span>
      <p className="text-md font-bold text-ink">המסך שלך עדיין ריק</p>
      <p className="max-w-md text-base text-ink-secondary">
        {hasReports
          ? 'נעץ דוח שכבר שמרת, והוא יופיע כאן בכל בוקר.'
          : 'שמור דוח אחד, נעץ אותו, והמסך הזה יתחיל לענות לך על מה קורה — בלי לחפש.'}
      </p>
      <Button variant="primary" onClick={onOpenReports}>
        <BarChart3 className="h-5 w-5" />
        {hasReports ? 'לכל הדוחות' : 'צור דוח ראשון'}
      </Button>
    </div>
  );
}
