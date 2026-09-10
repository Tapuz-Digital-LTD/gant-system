import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  BarChart3,
  Copy,
  Download,
  LayoutDashboard,
  Loader2,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Save,
  Trash2,
  X
} from 'lucide-react';
import {
  ChartKind,
  Dashboard,
  GanttBoard,
  ReportDefinition,
  ReportModel,
  SavedReport,
  UserAccess
} from '../types';
import { api } from '../services/api';
import { describeError } from '../hooks/useBoardData';
import { ReportChart, formatGroup } from './reports/Charts';
import { ReportBuilder, describeDefinition, freshDefinition } from './reports/ReportBuilder';
import { Button, ConfirmDialog, Input, Menu, MenuItem, MenuSeparator, cn, useToast } from './ui';

/**
 * Reports, without the word "report" doing any work.
 *
 * The brief for this screen was "professional behind the scenes, simple in
 * front" — so the query model is closed and aggregated in Postgres, and what a
 * person sees is six questions in Hebrew and a picture that changes as they
 * answer them. Nothing here says dimension, measure, pivot or aggregate.
 *
 * A report somebody keeps becomes a view, in the same sense as the calendar and
 * the timeline: it has a name, it can be pinned, duplicated and thrown away, and
 * it opens to the thing it was saved as.
 */

export function ReportsScreen({
  boards,
  users,
  canSave,
  canExport,
  currentUserId,
  isOwner,
  openId,
  creating,
  onOpenReport,
  onNew,
  onCloseReport,
  onBackHome,
  onOpenDashboard
}: {
  boards: GanttBoard[];
  users: UserAccess[];
  canSave: boolean;
  canExport: boolean;
  currentUserId: string;
  isOwner: boolean;
  /** The saved report currently open, from the URL. */
  openId: string | null;
  creating: boolean;
  onOpenReport: (id: string) => void;
  onNew: () => void;
  onCloseReport: () => void;
  onBackHome: () => void;
  onOpenDashboard: () => void;
}) {
  const { notify } = useToast();
  const qc = useQueryClient();

  const modelQuery = useQuery({ queryKey: ['report-model'], queryFn: api.reports.model, staleTime: 60 * 60_000 });
  const savedQuery = useQuery({ queryKey: ['saved-reports'], queryFn: api.reports.saved.list });

  const model = modelQuery.data;
  const saved = savedQuery.data ?? [];
  const open = openId ? saved.find((r) => r.id === openId) ?? null : null;

  const refreshSaved = () => qc.invalidateQueries({ queryKey: ['saved-reports'] });

  const mutations = {
    create: useMutation({ mutationFn: api.reports.saved.create, onSuccess: refreshSaved }),
    update: useMutation({
      mutationFn: (v: { id: string; changes: Parameters<typeof api.reports.saved.update>[1] }) =>
        api.reports.saved.update(v.id, v.changes),
      onSuccess: refreshSaved
    }),
    remove: useMutation({ mutationFn: api.reports.saved.remove, onSuccess: refreshSaved }),
    duplicate: useMutation({ mutationFn: api.reports.saved.duplicate, onSuccess: refreshSaved })
  };

  const [confirmDelete, setConfirmDelete] = useState<SavedReport | null>(null);

  if (modelQuery.isLoading || savedQuery.isLoading) {
    return <Loading />;
  }

  if (!model) {
    return (
      <Shell onBackHome={onBackHome}>
        <p className="py-16 text-center text-base text-ink-secondary">
          {describeError(modelQuery.error)}
        </p>
      </Shell>
    );
  }

  if (creating || open) {
    return (
      <Shell onBackHome={onBackHome} onBack={onCloseReport} backLabel="לכל הדוחות">
        <Editor
          model={model}
          boards={boards}
          users={users}
          canSave={canSave}
          canExport={canExport}
          existing={open}
          mayChange={!open || open.ownerId === currentUserId || isOwner}
          onSave={async (name, definition, chart) => {
            if (open) {
              await mutations.update.mutateAsync({ id: open.id, changes: { name, definition, chart } });
              notify('success', 'הדוח נשמר');
            } else {
              const created = await mutations.create.mutateAsync({ name, definition, chart });
              notify('success', `«${created.name}» נשמר בדוחות שלך`);
              onOpenReport(created.id);
            }
          }}
        />
      </Shell>
    );
  }

  return (
    <Shell onBackHome={onBackHome}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-ink">דוחות</h1>
          <p className="mt-1 text-base text-ink-secondary">
            בוחרים מה רוצים לראות, ושומרים את זה כתצוגה. בלי נוסחאות ובלי מונחים.
          </p>
        </div>
        <Button variant="secondary" onClick={onOpenDashboard}>
          <LayoutDashboard className="h-5 w-5" />
          לוח המחוונים שלי
        </Button>
        {canSave && (
          <Button variant="primary" onClick={onNew}>
            <Plus className="h-5 w-5" />
            דוח חדש
          </Button>
        )}
      </div>

      {saved.length === 0 ? (
        <EmptyReports canSave={canSave} onNew={onNew} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {saved.map((report) => (
            <SavedCard
              key={report.id}
              report={report}
              model={model}
              mayChange={report.ownerId === currentUserId || isOwner}
              onOpen={() => onOpenReport(report.id)}
              onPin={() =>
                mutations.update.mutate({ id: report.id, changes: { pinned: !report.pinned } })
              }
              onDuplicate={async () => {
                const copy = await mutations.duplicate.mutateAsync(report.id);
                notify('success', `«${copy.name}» נוצר`);
              }}
              onDelete={() => setConfirmDelete(report)}
            />
          ))}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`למחוק את «${confirmDelete.name}»?`}
          body="הדוח יימחק לכולם. הנתונים עצמם לא נוגעים — רק השאלה ששמרת."
          confirmLabel="מחק"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            const target = confirmDelete;
            setConfirmDelete(null);
            try {
              await mutations.remove.mutateAsync(target.id);
              notify('success', 'הדוח נמחק');
            } catch (e) {
              notify('error', describeError(e));
            }
          }}
        />
      )}
    </Shell>
  );
}

/* ----------------------------------------------------------------- editor */

function Editor({
  model,
  boards,
  users,
  canSave,
  canExport,
  existing,
  mayChange,
  onSave
}: {
  model: ReportModel;
  boards: GanttBoard[];
  users: UserAccess[];
  canSave: boolean;
  canExport: boolean;
  existing: SavedReport | null;
  mayChange: boolean;
  onSave: (name: string, definition: ReportDefinition, chart: ChartKind) => Promise<void>;
}) {
  const { notify } = useToast();

  const [definition, setDefinition] = useState<ReportDefinition>(
    existing?.definition ?? freshDefinition(model)
  );
  const [chart, setChart] = useState<ChartKind>(existing?.chart ?? 'bar');
  const [name, setName] = useState(existing?.name ?? '');
  const [naming, setNaming] = useState(false);
  const [drill, setDrill] = useState<{ groupKey: string | null; label: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Opening a different saved report replaces what is being edited.
  useEffect(() => {
    if (!existing) return;
    setDefinition(existing.definition);
    setChart(existing.chart);
    setName(existing.name);
  }, [existing?.id]);

  /*
   * The definition is the query key, so the answer follows the questions with
   * no run button and no stale picture. React Query dedupes the identical
   * definitions a person produces by ticking a box on and off again.
   */
  const run = useQuery({
    queryKey: ['report-run', definition],
    queryFn: () => api.reports.run(definition),
    placeholderData: (previous) => previous
  });

  const drillQuery = useQuery({
    queryKey: ['report-drill', definition, drill?.groupKey],
    queryFn: () => api.reports.drill(definition, drill!.groupKey),
    enabled: drill !== null
  });

  const summary = useMemo(() => describeDefinition(model, definition), [model, definition]);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onSave(trimmed, definition, chart);
      setNaming(false);
    } catch (e) {
      notify('error', describeError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
      <section className="rounded-xl border border-line bg-surface p-4 shadow-card">
        <ReportBuilder
          model={model}
          definition={definition}
          chart={chart}
          boards={boards}
          users={users}
          onChange={setDefinition}
          onChartChange={setChart}
        />
      </section>

      <section className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold text-ink">{existing?.name ?? 'דוח חדש'}</h1>
            <p className="text-base text-ink-secondary">{summary}</p>
          </div>

          {canExport && (
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await api.reports.exportXlsx(definition, name.trim() || existing?.name || 'דוח');
                } catch (e) {
                  notify('error', describeError(e));
                }
              }}
            >
              <Download className="h-5 w-5" />
              הורדה לאקסל
            </Button>
          )}

          {canSave && mayChange && (
            <Button variant="primary" onClick={() => (existing ? void save() : setNaming(true))} disabled={saving}>
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              {existing ? 'שמור שינויים' : 'שמור כתצוגה'}
            </Button>
          )}
        </div>

        {naming && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="flex flex-wrap items-end gap-2 rounded-lg border border-primary/30 bg-primary-soft/40 p-3"
          >
            <label className="flex min-w-52 flex-1 flex-col gap-1">
              <span className="text-xs font-semibold text-ink-secondary">איך לקרוא לדוח?</span>
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="מצב משימות שיווק"
              />
            </label>
            <Button type="submit" variant="primary" disabled={!name.trim() || saving}>
              שמור
            </Button>
            <Button variant="ghost" onClick={() => setNaming(false)}>
              ביטול
            </Button>
          </form>
        )}

        <div className="min-h-64 rounded-xl border border-line bg-surface p-4 shadow-card">
          {run.isLoading ? (
            <div className="grid place-items-center py-16 text-ink-tertiary" role="status">
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
              <span className="sr-only">מחשב…</span>
            </div>
          ) : run.isError ? (
            <p className="py-12 text-center text-base text-late">{describeError(run.error)}</p>
          ) : run.data ? (
            <>
              <ReportChart
                result={run.data}
                kind={chart}
                onDrill={(groupKey, label) => setDrill({ groupKey, label })}
              />
              {run.data.truncated && (
                <p className="mt-3 text-sm text-progress">
                  מוצגות {run.data.rows.length} קבוצות מתוך {run.data.total}. צמצם את הטווח כדי לראות
                  הכול.
                </p>
              )}
            </>
          ) : null}
        </div>

        {drill && (
          <div className="rounded-xl border border-line bg-surface shadow-card">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <h2 className="min-w-0 flex-1 truncate text-md font-bold text-ink">
                {formatGroup(drill.label)}
              </h2>
              <span className="shrink-0 text-sm text-ink-tertiary">
                {drillQuery.data ? `${drillQuery.data.total} רשומות` : ''}
              </span>
              <button
                onClick={() => setDrill(null)}
                aria-label="סגור"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-tertiary hover:bg-subtle hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-96 overflow-auto p-1">
              {drillQuery.isLoading ? (
                <p className="py-8 text-center text-base text-ink-tertiary">טוען…</p>
              ) : drillQuery.data ? (
                <ReportChart result={drillQuery.data} kind="table" />
              ) : (
                <p className="py-8 text-center text-base text-late">{describeError(drillQuery.error)}</p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ cards */

function SavedCard({
  report,
  model,
  mayChange,
  onOpen,
  onPin,
  onDuplicate,
  onDelete
}: {
  report: SavedReport;
  model: ReportModel;
  mayChange: boolean;
  onOpen: () => void;
  onPin: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const preview = useQuery({
    queryKey: ['report-run', report.definition],
    queryFn: () => api.reports.run(report.definition),
    staleTime: 60_000
  });

  return (
    <div className="group relative flex flex-col gap-2 overflow-hidden rounded-xl border border-line bg-surface p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-raised focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary">
      <button onClick={onOpen} aria-label={`פתח את ${report.name}`} className="absolute inset-0 z-0" />

      <div className="pointer-events-none z-10 flex items-start gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
          <BarChart3 className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-md font-bold text-ink">{report.name}</h3>
          <p className="truncate text-sm text-ink-tertiary">{describeDefinition(model, report.definition)}</p>
        </div>
        {report.pinned && <Pin className="h-4.5 w-4.5 shrink-0 text-primary" aria-label="נעוץ בדשבורד" />}
      </div>

      <div className="pointer-events-none z-10 min-h-24">
        {preview.data ? (
          <ReportChart result={preview.data} kind={report.chart} compact />
        ) : (
          <div className="grid h-24 place-items-center text-ink-disabled">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="absolute start-2 top-2 z-20">
        <Menu
          align="end"
          trigger={
            <button
              aria-label={`פעולות על ${report.name}`}
              className="grid h-8 w-8 place-items-center rounded-lg text-ink-tertiary opacity-0 transition hover:bg-subtle hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          }
        >
          <MenuItem onSelect={onOpen}>
            <Pencil className="h-4.5 w-4.5" />
            פתח וערוך
          </MenuItem>
          <MenuItem onSelect={onPin}>
            {report.pinned ? <PinOff className="h-4.5 w-4.5" /> : <Pin className="h-4.5 w-4.5" />}
            {report.pinned ? 'הסר מהדשבורד' : 'נעץ בדשבורד'}
          </MenuItem>
          <MenuItem onSelect={onDuplicate}>
            <Copy className="h-4.5 w-4.5" />
            שכפל
          </MenuItem>
          {mayChange && (
            <>
              <MenuSeparator />
              <MenuItem onSelect={onDelete} className="text-late">
                <Trash2 className="h-4.5 w-4.5" />
                מחק
              </MenuItem>
            </>
          )}
        </Menu>
      </div>
    </div>
  );
}

function EmptyReports({ canSave, onNew }: { canSave: boolean; onNew: () => void }) {
  const EXAMPLES = [
    'קמפיינים לפי חודש',
    'משימות לפי עובד',
    'אחוז השלמה לכל פרויקט',
    'מה באיחור, ואצל מי'
  ];
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary">
        <BarChart3 className="h-7 w-7" aria-hidden="true" />
      </span>
      <p className="text-md font-bold text-ink">עוד לא שמרת אף דוח</p>
      <p className="max-w-md text-base text-ink-secondary">
        דוח הוא שאלה ששמרת: מה מסתכלים עליו, לאיזו תקופה, ואיך מחלקים אותו. אחרי שמירה הוא נפתח
        בקליק, בדיוק כמו לוח שנה או גאנט.
      </p>
      <ul className="flex flex-wrap justify-center gap-1.5">
        {EXAMPLES.map((e) => (
          <li key={e} className="rounded-full bg-subtle px-3 py-1 text-sm text-ink-secondary">
            {e}
          </li>
        ))}
      </ul>
      {canSave && (
        <Button variant="primary" onClick={onNew} className="mt-1">
          <Plus className="h-5 w-5" />
          צור דוח ראשון
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ shell */

function Shell({
  children,
  onBackHome,
  onBack,
  backLabel
}: {
  children: React.ReactNode;
  onBackHome: () => void;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <div className="min-h-dvh bg-canvas" dir="rtl">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:px-6">
          <Button variant="ghost" size="sm" onClick={onBackHome}>
            <ArrowRight className="h-4.5 w-4.5" />
            למסך הראשי
          </Button>
          {onBack && (
            <>
              <span className="text-ink-disabled" aria-hidden="true">
                ›
              </span>
              <Button variant="ghost" size="sm" onClick={onBack}>
                {backLabel}
              </Button>
            </>
          )}
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 pb-20 pt-6 sm:px-6">{children}</main>
    </div>
  );
}

function Loading() {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas" dir="rtl">
      <Loader2 className="h-6 w-6 animate-spin text-ink-tertiary" aria-hidden="true" />
    </div>
  );
}

export type { Dashboard };
