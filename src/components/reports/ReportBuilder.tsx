import React, { useMemo } from 'react';
import { CalendarRange, Filter, Group, Ruler, Table2, BarChart3, LineChart, PieChart, Hash } from 'lucide-react';
import {
  ChartKind,
  GanttBoard,
  ReportDataset,
  ReportDatasetModel,
  ReportDefinition,
  ReportModel,
  UserAccess
} from '../../types';
import { addMonths, monthKey, startOfMonth, endOfMonth, todayISO } from '../../utils/period';
import { Field, Input, cn } from '../ui';

/**
 * Five questions, in the order somebody actually asks them.
 *
 * מה · מתי · מה לסנן · לפי מה לקבץ · מה למדוד · איך לראות.
 *
 * Nothing here is called a dimension, a measure or an aggregate. Every word on
 * this screen comes from the server's own model, in Hebrew, with a sentence
 * under it — so adding a measure is one entry in `server/reports/model.ts` and
 * no change here at all.
 */

const CHART_ICONS: Record<ChartKind, typeof BarChart3> = {
  number: Hash,
  table: Table2,
  bar: BarChart3,
  line: LineChart,
  pie: PieChart
};

/** The ranges people actually ask for, so nobody types two dates to see this quarter. */
const PRESETS: { key: string; label: string; range: () => { from?: string; to?: string } }[] = [
  { key: 'all', label: 'הכול', range: () => ({}) },
  {
    key: 'thisYear',
    label: 'השנה',
    range: () => ({ from: `${todayISO().slice(0, 4)}-01-01`, to: `${todayISO().slice(0, 4)}-12-31` })
  },
  {
    key: 'thisQuarter',
    label: 'הרבעון',
    range: () => {
      const q = Math.floor((Number(todayISO().slice(5, 7)) - 1) / 3);
      const year = todayISO().slice(0, 4);
      const first = `${year}-${String(q * 3 + 1).padStart(2, '0')}-01`;
      return { from: first, to: endOfMonth(`${year}-${String(q * 3 + 3).padStart(2, '0')}-01`) };
    }
  },
  {
    key: 'last3',
    label: '3 חודשים אחורה',
    range: () => ({ from: startOfMonth(addMonths(todayISO(), -2)), to: endOfMonth(todayISO()) })
  },
  {
    key: 'next3',
    label: '3 חודשים קדימה',
    range: () => ({ from: startOfMonth(todayISO()), to: endOfMonth(addMonths(todayISO(), 2)) })
  },
  { key: 'custom', label: 'תאריכים משלי', range: () => ({}) }
];

export interface BuilderProps {
  model: ReportModel;
  definition: ReportDefinition;
  chart: ChartKind;
  boards: GanttBoard[];
  users: UserAccess[];
  onChange: (next: ReportDefinition) => void;
  onChartChange: (next: ChartKind) => void;
}

export function ReportBuilder({
  model,
  definition,
  chart,
  boards,
  users,
  onChange,
  onChartChange
}: BuilderProps) {
  const dataset = model.datasets.find((d) => d.key === definition.dataset)!;
  const allows = (filter: string) => dataset.filters.some((f) => f.key === filter);

  const set = (patch: Partial<ReportDefinition>) => onChange({ ...definition, ...patch });
  const setFilter = (patch: Partial<ReportDefinition['filters']>) =>
    set({ filters: { ...definition.filters, ...patch } });

  /** Which preset the current range matches, so the chips reflect what is set. */
  const activePreset = useMemo(() => {
    const { from, to } = definition.filters;
    if (!from && !to) return 'all';
    const match = PRESETS.find((p) => {
      const r = p.range();
      return p.key !== 'all' && p.key !== 'custom' && r.from === from && r.to === to;
    });
    return match?.key ?? 'custom';
  }, [definition.filters]);

  return (
    <div className="flex flex-col gap-5">
      {/* 1 · what */}
      <Question icon={Group} title="על מה הדוח?" hint="אירועים וקמפיינים, או המשימות שבתוכם">
        <Chips
          options={model.datasets.map((d) => ({ key: d.key, label: d.label, hint: d.hint }))}
          selected={[definition.dataset]}
          onPick={(key) => onChange(freshDefinition(model, key as ReportDataset))}
        />
      </Question>

      {/* 2 · when */}
      <Question icon={CalendarRange} title="לאיזו תקופה?" hint="ואיזה תאריך סופרים">
        <Chips
          options={PRESETS.map((p) => ({ key: p.key, label: p.label }))}
          selected={[activePreset]}
          onPick={(key) => {
            const preset = PRESETS.find((p) => p.key === key)!;
            const range = preset.range();
            setFilter({
              ...range,
              // A range needs a column to apply to; the first one listed is the
              // event's own date, which is what "בתקופה הזאת" means to a person.
              dateField:
                key === 'all' ? undefined : definition.filters.dateField ?? dataset.dateFields[0].key,
              ...(key === 'custom' && !definition.filters.from
                ? { from: `${todayISO().slice(0, 4)}-01-01`, to: `${todayISO().slice(0, 4)}-12-31` }
                : {})
            });
          }}
        />

        {activePreset !== 'all' && (
          <div className="mt-2 flex flex-col gap-2">
            <Field label="איזה תאריך סופרים" htmlFor="rp-datefield">
              <select
                id="rp-datefield"
                value={definition.filters.dateField ?? dataset.dateFields[0].key}
                onChange={(e) => setFilter({ dateField: e.target.value })}
                className="h-9 w-full rounded-md border border-line bg-surface px-3 text-base text-ink"
              >
                {dataset.dateFields.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Field>

            {activePreset === 'custom' && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="מתאריך" htmlFor="rp-from">
                  <Input
                    id="rp-from"
                    type="date"
                    value={definition.filters.from ?? ''}
                    onChange={(e) => setFilter({ from: e.target.value || undefined })}
                  />
                </Field>
                <Field label="עד תאריך" htmlFor="rp-to">
                  <Input
                    id="rp-to"
                    type="date"
                    value={definition.filters.to ?? ''}
                    onChange={(e) => setFilter({ to: e.target.value || undefined })}
                  />
                </Field>
              </div>
            )}
          </div>
        )}
      </Question>

      {/* 3 · filter */}
      <Question icon={Filter} title="מה לסנן?" hint="בלי סימון — הכול נכנס">
        {allows('boardIds') && boards.length > 1 && (
          <Group2 label="פרויקטים">
            <Chips
              multi
              options={boards.map((b) => ({ key: b.id, label: b.name }))}
              selected={definition.filters.boardIds ?? []}
              onPick={(key) => setFilter({ boardIds: toggle(definition.filters.boardIds, key) })}
            />
          </Group2>
        )}
        {allows('categories') && (
          <Group2 label="סוגי אירוע">
            <Chips
              multi
              options={model.values.categories}
              selected={definition.filters.categories ?? []}
              onPick={(key) => setFilter({ categories: toggle(definition.filters.categories, key) })}
            />
          </Group2>
        )}
        {allows('statuses') && (
          <Group2 label="מצב">
            <Chips
              multi
              options={model.values.statuses}
              selected={definition.filters.statuses ?? []}
              onPick={(key) => setFilter({ statuses: toggle(definition.filters.statuses, key) })}
            />
          </Group2>
        )}
        {allows('priorities') && (
          <Group2 label="עדיפות">
            <Chips
              multi
              options={model.values.priorities}
              selected={definition.filters.priorities ?? []}
              onPick={(key) => setFilter({ priorities: toggle(definition.filters.priorities, key) })}
            />
          </Group2>
        )}
        {allows('assigneeIds') && users.length > 0 && (
          <Group2 label="אחראים">
            <Chips
              multi
              options={users.map((u) => ({ key: u.id, label: u.name }))}
              selected={definition.filters.assigneeIds ?? []}
              onPick={(key) => setFilter({ assigneeIds: toggle(definition.filters.assigneeIds, key) })}
            />
          </Group2>
        )}

        <Group2 label="קיצורים">
          <Chips
            multi
            options={[
              { key: 'onlyOpen', label: 'רק מה שלא הושלם' },
              { key: 'onlyLate', label: 'רק מה שבאיחור' },
              { key: 'includeArchived', label: 'לכלול גם את הארכיון' }
            ]}
            selected={[
              definition.filters.onlyOpen ? 'onlyOpen' : '',
              definition.filters.onlyLate ? 'onlyLate' : '',
              definition.includeArchived ? 'includeArchived' : ''
            ].filter(Boolean)}
            onPick={(key) => {
              if (key === 'includeArchived') return set({ includeArchived: !definition.includeArchived });
              if (key === 'onlyOpen') return setFilter({ onlyOpen: !definition.filters.onlyOpen || undefined });
              return setFilter({ onlyLate: !definition.filters.onlyLate || undefined });
            }}
          />
        </Group2>
      </Question>

      {/* 4 · group by */}
      <Question icon={Group} title="לפי מה לחלק?" hint="כל קבוצה תהיה שורה או עמודה בדוח">
        <Chips
          options={dataset.dimensions}
          selected={[definition.dimension]}
          onPick={(key) => set({ dimension: key })}
        />
      </Question>

      {/* 5 · measure */}
      <Question icon={Ruler} title="מה למדוד?" hint="אפשר לבחור כמה, והם יוצגו זה לצד זה">
        <Chips
          multi
          options={dataset.measures}
          selected={definition.measures}
          onPick={(key) => {
            const next = toggle(definition.measures, key) ?? [];
            // A report with nothing to measure is an empty screen, so the last
            // one cannot be switched off.
            if (next.length > 0) set({ measures: next });
          }}
        />
      </Question>

      {/* 6 · how */}
      <Question icon={BarChart3} title="איך להציג?" hint="אפשר להחליף בכל רגע בלי לאבד את הבחירות">
        <div className="flex flex-wrap gap-2">
          {model.charts.map((c) => {
            const Icon = CHART_ICONS[c.key];
            const active = chart === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => onChartChange(c.key)}
                aria-pressed={active}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border-2 px-3 py-2 transition-colors',
                  active
                    ? 'border-primary bg-primary-soft text-primary'
                    : 'border-line text-ink-tertiary hover:border-line-strong hover:text-ink-secondary'
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="text-sm font-semibold">{c.label}</span>
              </button>
            );
          })}
        </div>
      </Question>
    </div>
  );
}

/* ------------------------------------------------------------------ atoms */

function Question({
  icon: Icon,
  title,
  hint,
  children
}: {
  icon: typeof Group;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <Icon className="h-4.5 w-4.5 shrink-0 translate-y-0.5 text-ink-tertiary" aria-hidden="true" />
        <h3 className="text-base font-bold text-ink">{title}</h3>
        <span className="text-sm text-ink-tertiary">{hint}</span>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Group2({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-ink-tertiary">{label}</span>
      {children}
    </div>
  );
}

function Chips({
  options,
  selected,
  onPick,
  multi
}: {
  options: { key: string; label: string; hint?: string }[];
  selected: string[];
  onPick: (key: string) => void;
  multi?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role={multi ? 'group' : 'radiogroup'}>
      {options.map((o) => {
        const active = selected.includes(o.key);
        return (
          <button
            key={o.key}
            type="button"
            role={multi ? undefined : 'radio'}
            aria-checked={multi ? undefined : active}
            aria-pressed={multi ? active : undefined}
            title={o.hint}
            onClick={() => onPick(o.key)}
            className={cn(
              'rounded-full border px-3 py-1 text-base transition-colors',
              active
                ? 'border-primary bg-primary text-white'
                : 'border-line bg-surface text-ink-secondary hover:border-line-strong hover:text-ink'
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Adds or removes one value, and returns undefined for "no filter" rather than []. */
function toggle(list: string[] | undefined, key: string): string[] | undefined {
  const current = list ?? [];
  const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
  return next.length ? next : undefined;
}

/**
 * A report that answers something the moment it opens.
 *
 * An empty builder is a form; a report already showing this year's campaigns by
 * month is an answer somebody can then adjust. The defaults are the first
 * dimension and the first measure the server lists, so they follow the model.
 */
export function freshDefinition(model: ReportModel, dataset: ReportDataset = 'events'): ReportDefinition {
  const ds: ReportDatasetModel = model.datasets.find((d) => d.key === dataset)!;
  return {
    dataset,
    dimension: ds.dimensions[0].key,
    measures: [ds.measures[0].key],
    filters: {},
    includeArchived: false
  };
}

/** A one-line description of what a saved report actually asks. */
export function describeDefinition(model: ReportModel, definition: ReportDefinition): string {
  const ds = model.datasets.find((d) => d.key === definition.dataset);
  if (!ds) return '';
  const dimension = ds.dimensions.find((d) => d.key === definition.dimension)?.label ?? '';
  const measures = definition.measures
    .map((m) => ds.measures.find((x) => x.key === m)?.label)
    .filter(Boolean)
    .join(' · ');
  const range =
    definition.filters.from || definition.filters.to
      ? ` · ${definition.filters.from ?? ''}–${definition.filters.to ?? ''}`
      : '';
  return `${measures}, לפי ${dimension}${range}`;
}

export { monthKey };
