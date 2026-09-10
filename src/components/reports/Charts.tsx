import React, { useId, useMemo, useState } from 'react';
import { ChartKind, ReportColumnType, ReportResult } from '../../types';
import { CATEGORY_META, STATUS_META } from '../../utils/eventMeta';
import { monthName } from '../../utils/period';
import { cn } from '../ui';

/**
 * Five ways to draw one answer, and no library to do it.
 *
 * A charting dependency is 60–200kB on a screen most people open twice a week,
 * and none of them draws a right-to-left axis without a fight. What is actually
 * needed here is a rectangle, a polyline and an arc — so they are drawn, in SVG,
 * against the product's own colour tokens.
 *
 * Every chart is also a table underneath: the numbers are in the DOM, in order,
 * with the group they belong to. That is what makes them readable by a screen
 * reader, and it is why there is no `aria-hidden` on anything that carries a
 * value.
 */

/* ------------------------------------------------------------------ colour */

/**
 * A colour per series, from the palette the rest of the product already uses.
 *
 * Six hues that stay apart at 8px — the same set the category dots are drawn
 * from, so a chart never introduces a seventh vocabulary of colour.
 */
const SERIES = [
  { fill: 'fill-cat-b2b', bg: 'bg-cat-b2b', text: 'text-cat-b2b', stroke: 'stroke-cat-b2b' },
  { fill: 'fill-cat-campaign', bg: 'bg-cat-campaign', text: 'text-cat-campaign', stroke: 'stroke-cat-campaign' },
  { fill: 'fill-cat-operational', bg: 'bg-cat-operational', text: 'text-cat-operational', stroke: 'stroke-cat-operational' },
  { fill: 'fill-cat-holiday', bg: 'bg-cat-holiday', text: 'text-cat-holiday', stroke: 'stroke-cat-holiday' },
  { fill: 'fill-cat-social', bg: 'bg-cat-social', text: 'text-cat-social', stroke: 'stroke-cat-social' },
  { fill: 'fill-ms-workstart', bg: 'bg-ms-workstart', text: 'text-ms-workstart', stroke: 'stroke-ms-workstart' }
];

/** Fills that already mean something. A "קמפיין" bar is the campaign colour. */
const BY_VALUE: Record<string, string> = {
  holiday: 'fill-cat-holiday',
  campaign: 'fill-cat-campaign',
  b2b: 'fill-cat-b2b',
  social: 'fill-cat-social',
  operational: 'fill-cat-operational',
  other: 'fill-cat-other',
  todo: 'fill-todo',
  in_progress: 'fill-progress',
  ready_kickoff: 'fill-ready',
  done: 'fill-done',
  low: 'fill-todo',
  medium: 'fill-todo',
  high: 'fill-progress',
  urgent: 'fill-late'
};

/**
 * Which colour a slice gets.
 *
 * When one measure is grouped by something that already has a colour in this
 * product — a category, a status — the group's own colour is used. Anything
 * else falls back to the series palette, which is the honest answer: the order
 * is arbitrary, and pretending otherwise invents a meaning.
 */
function fillFor(groupKey: string | null, index: number, singleSeries: boolean): string {
  if (singleSeries && groupKey && BY_VALUE[groupKey]) return BY_VALUE[groupKey];
  return SERIES[index % SERIES.length].fill;
}

/* ---------------------------------------------------------------- numbers */

export function formatValue(value: string | number | null, type: ReportColumnType): string {
  if (value === null || value === undefined || value === '') return '—';
  if (type === 'text') return String(value);
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (type === 'percent') return `${Math.round(n)}%`;
  if (type === 'days') return n === 1 ? 'יום אחד' : `${n.toLocaleString('he-IL', { maximumFractionDigits: 1 })} ימים`;
  return n.toLocaleString('he-IL');
}

/**
 * A group as a person would say it.
 *
 * `2026-12` is a key, not a label. Months and quarters are the two groups the
 * query returns in a machine's spelling, and reading "דצמבר 2026" off an axis
 * is the difference between a chart and a printout.
 */
export function formatGroup(label: string): string {
  const month = /^(\d{4})-(\d{2})$/.exec(label);
  if (month) return `${monthName(`${label}-01`)} ${month[1]}`;
  const quarter = /^(\d{4})-Q(\d)$/.exec(label);
  if (quarter) return `רבעון ${quarter[2]} ${quarter[1]}`;
  return label;
}

/* ------------------------------------------------------------------ chart */

export interface ChartProps {
  result: ReportResult;
  kind: ChartKind;
  /** Opening the records behind one group. Absent means the chart is not clickable. */
  onDrill?: (groupKey: string | null, label: string) => void;
  /** Shorter axes and fewer labels, for a dashboard card. */
  compact?: boolean;
}

export function ReportChart({ result, kind, onDrill, compact }: ChartProps) {
  const measures = result.columns.filter((c) => c.key !== 'group');

  if (result.rows.length === 0) {
    return (
      <p className="py-10 text-center text-base text-ink-tertiary">
        אין נתונים שמתאימים למה שבחרת. נסה טווח תאריכים רחב יותר, או פחות סינון.
      </p>
    );
  }

  if (kind === 'number') return <BigNumbers result={result} onDrill={onDrill} />;
  if (kind === 'table') return <Table result={result} onDrill={onDrill} />;
  if (kind === 'pie') return <Donut result={result} onDrill={onDrill} compact={compact} />;
  if (kind === 'line') return <Line result={result} compact={compact} />;
  return <Bars result={result} onDrill={onDrill} compact={compact} stacked={measures.length > 1} />;
}

/* ------------------------------------------------------------- big number */

function BigNumbers({ result, onDrill }: { result: ReportResult; onDrill?: ChartProps['onDrill'] }) {
  const measures = result.columns.filter((c) => c.key !== 'group');

  /*
   * One group is the number itself; several are a small stack.
   *
   * "כמה משימות באיחור" is a single figure somebody wants at a glance, and
   * putting it in a one-row table hides the one thing they came for.
   */
  const totals = measures.map((m) => ({
    ...m,
    value: result.rows.reduce((sum, r) => sum + (Number(r[m.key]) || 0), 0),
    // An average of averages is not an average, and a total of percentages is
    // nonsense — so a percentage of one group is shown, and of many is not.
    usable: m.type !== 'percent' || result.rows.length === 1
  }));

  return (
    <div className="flex flex-wrap gap-4 py-2">
      {totals.map((m, i) => (
        <div key={m.key} className="min-w-40 flex-1">
          <div className={cn('text-4xl font-bold tabular-nums', SERIES[i % SERIES.length].text)}>
            {m.usable
              ? formatValue(result.rows.length === 1 ? result.rows[0][m.key] : m.value, m.type)
              : '—'}
          </div>
          <div className="mt-0.5 text-base text-ink-secondary">{m.label}</div>
          {!m.usable && <div className="text-sm text-ink-tertiary">אחוז אינו מסתכם — בחר תצוגת טבלה</div>}
        </div>
      ))}
      {result.rows.length > 1 && (
        <div className="w-full">
          <p className="mb-1.5 text-sm text-ink-tertiary">לפי {result.columns[0].label}</p>
          <Table result={result} onDrill={onDrill} dense />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ table */

function Table({
  result,
  onDrill,
  dense
}: {
  result: ReportResult;
  onDrill?: ChartProps['onDrill'];
  dense?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-line text-xs font-semibold text-ink-tertiary">
            {result.columns.map((c) => (
              <th key={c.key} className={cn('px-3 py-2', c.type === 'text' ? 'text-start' : 'text-end')}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {result.rows.map((row, i) => (
            <tr key={i} className="hover:bg-subtle">
              {result.columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    'px-3',
                    dense ? 'py-1.5' : 'py-2',
                    c.type === 'text' ? 'text-start' : 'text-end tabular-nums',
                    c.type === 'text' ? 'font-semibold text-ink' : 'text-ink-secondary'
                  )}
                >
                  {c.type === 'text' && onDrill ? (
                    <button
                      onClick={() => onDrill(row.groupKey as string | null, String(row.group))}
                      className="rounded text-start hover:underline"
                    >
                      {formatGroup(String(row[c.key] ?? ''))}
                    </button>
                  ) : (
                    formatValue(row[c.key], c.type)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------- bars */

function Bars({
  result,
  onDrill,
  compact,
  stacked
}: {
  result: ReportResult;
  onDrill?: ChartProps['onDrill'];
  compact?: boolean;
  stacked: boolean;
}) {
  const measures = result.columns.filter((c) => c.key !== 'group');
  /*
   * Horizontal bars, always.
   *
   * The group names here are Hebrew words of very different lengths — "ועידת
   * ישראל למשאבי אנוש…" against "פסח" — and a vertical chart answers that by
   * rotating the labels 45° and making everyone tilt their head. A horizontal
   * bar gives the label a whole line to itself and reads in the direction the
   * language already runs.
   */
  const rows = compact ? result.rows.slice(0, 8) : result.rows;
  const peak = Math.max(
    1,
    ...rows.map((r) =>
      stacked
        ? measures.reduce((sum, m) => sum + (Number(r[m.key]) || 0), 0)
        : Math.max(...measures.map((m) => Number(r[m.key]) || 0))
    )
  );

  return (
    <div className="flex flex-col gap-2">
      {measures.length > 1 && <Legend measures={measures} />}

      <ul className="flex flex-col gap-1.5">
        {rows.map((row, i) => {
          const label = formatGroup(String(row.group ?? ''));
          const total = measures.reduce((sum, m) => sum + (Number(r2n(row[m.key])) || 0), 0);

          return (
            <li key={i} className="flex items-center gap-2">
              <span
                className={cn('shrink-0 truncate text-sm text-ink-secondary', compact ? 'w-24' : 'w-40')}
                title={label}
              >
                {label}
              </span>

              {/*
                A bar is a button only where it does something.
                
                Rendering it disabled instead — on a dashboard card, where the
                whole card opens the report — puts "לחצן, מושבת" into every
                screen reader for every bar, which is noise about a control that
                was never offered.
              */}
              <Bar
                clickable={Boolean(onDrill)}
                onClick={() => onDrill?.(row.groupKey as string | null, String(row.group))}
                label={`${label}: ${measures
                  .map((m) => `${m.label} ${formatValue(row[m.key], m.type)}`)
                  .join(', ')}${onDrill ? '. לחץ כדי לראות את הרשומות' : ''}`}
              >
                {measures.map((m, mi) => {
                  const value = Number(r2n(row[m.key])) || 0;
                  const width = (value / peak) * 100;
                  if (width <= 0) return null;
                  return (
                    <span
                      key={m.key}
                      style={{ width: `${Math.max(width, 0.6)}%` }}
                      title={`${m.label}: ${formatValue(row[m.key], m.type)}`}
                      className={cn(
                        'h-full transition-opacity first:rounded-s-sm last:rounded-e-sm group-hover:opacity-85',
                        fillFor(row.groupKey as string | null, mi, measures.length === 1).replace('fill-', 'bg-')
                      )}
                    />
                  );
                })}
              </Bar>

              <span className="w-14 shrink-0 text-end text-sm font-semibold text-ink tabular-nums">
                {stacked ? total.toLocaleString('he-IL') : formatValue(row[measures[0].key], measures[0].type)}
              </span>
            </li>
          );
        })}
      </ul>

      {compact && result.rows.length > rows.length && (
        <p className="text-sm text-ink-tertiary">ועוד {result.rows.length - rows.length} קבוצות</p>
      )}
    </div>
  );
}

/** The bar itself: a button where it opens something, a plain figure where it does not. */
function Bar({
  clickable,
  onClick,
  label,
  children
}: {
  clickable: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const className = 'group flex h-6 min-w-0 flex-1 items-center gap-px rounded-sm';
  if (!clickable) {
    return (
      <span className={className} role="img" aria-label={label}>
        {children}
      </span>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={label} className={cn(className, 'cursor-pointer')}>
      {children}
    </button>
  );
}

/** A percentage is not a count; summing one is meaningless, so it is not summed. */
const r2n = (v: string | number | null) => (v === null ? 0 : Number(v));

function Legend({ measures }: { measures: { key: string; label: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {measures.map((m, i) => (
        <li key={m.key} className="flex items-center gap-1.5 text-sm text-ink-secondary">
          <span className={cn('h-2.5 w-2.5 rounded-sm', SERIES[i % SERIES.length].bg)} aria-hidden="true" />
          {m.label}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------- line */

function Line({ result, compact }: { result: ReportResult; compact?: boolean }) {
  const measures = result.columns.filter((c) => c.key !== 'group');
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);

  const width = 100;
  const height = compact ? 34 : 44;
  const peak = Math.max(1, ...result.rows.flatMap((r) => measures.map((m) => Number(r[m.key]) || 0)));
  const step = result.rows.length > 1 ? width / (result.rows.length - 1) : 0;

  const points = (key: string) =>
    result.rows
      .map((row, i) => `${(width - i * step).toFixed(2)},${(height - ((Number(row[key]) || 0) / peak) * height).toFixed(2)}`)
      .join(' ');

  return (
    <div className="flex flex-col gap-2">
      {measures.length > 1 && <Legend measures={measures} />}

      {/*
        The x axis runs right to left, like the language and like every other
        date in this product. Drawing it left to right and flipping the
        container with a transform breaks the text inside it.
      */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className={cn('w-full', compact ? 'h-28' : 'h-48')}
        role="img"
        aria-labelledby={`${id}-title`}
      >
        <title id={`${id}-title`}>
          {measures.map((m) => m.label).join(', ')} לאורך {result.columns[0].label}
        </title>
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1="0"
            x2={width}
            y1={height * f}
            y2={height * f}
            className="stroke-line"
            strokeWidth="0.25"
          />
        ))}
        {measures.map((m, i) => (
          <polyline
            key={m.key}
            points={points(m.key)}
            fill="none"
            strokeWidth="0.8"
            strokeLinejoin="round"
            strokeLinecap="round"
            className={SERIES[i % SERIES.length].stroke}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      <div className="flex justify-between text-xs text-ink-tertiary">
        <span>{formatGroup(String(result.rows[result.rows.length - 1]?.group ?? ''))}</span>
        <span>{formatGroup(String(result.rows[0]?.group ?? ''))}</span>
      </div>

      {/* The numbers themselves, because a line is a shape and not a reading. */}
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        {result.rows.map((row, i) => (
          <li
            key={i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className={cn('rounded px-1 tabular-nums', hover === i ? 'bg-subtle text-ink' : 'text-ink-tertiary')}
          >
            {formatGroup(String(row.group ?? ''))}:{' '}
            <b className="text-ink">{formatValue(row[measures[0].key], measures[0].type)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ donut */

function Donut({
  result,
  onDrill,
  compact
}: {
  result: ReportResult;
  onDrill?: ChartProps['onDrill'];
  compact?: boolean;
}) {
  const measure = result.columns.find((c) => c.key !== 'group');
  const id = useId();

  const slices = useMemo(() => {
    if (!measure) return [];
    const values = result.rows.map((r) => Math.max(0, Number(r[measure.key]) || 0));
    const total = values.reduce((a, b) => a + b, 0);
    if (total === 0) return [];

    let offset = 0;
    return result.rows.map((row, i) => {
      const share = values[i] / total;
      const slice = { row, value: values[i], share, offset, index: i };
      offset += share;
      return slice;
    });
  }, [result, measure]);

  if (!measure || slices.length === 0) {
    return <p className="py-8 text-center text-base text-ink-tertiary">אין מה לחלק — כל הערכים אפס</p>;
  }

  if (measure.type === 'percent') {
    return (
      <div className="flex flex-col gap-2">
        <p className="rounded-lg bg-progress-soft px-3 py-2 text-base text-ink">
          עוגה מחלקת שלם לחלקים, ואחוזים אינם מסתכמים לשלם. בחר טבלה או עמודות.
        </p>
        <Table result={result} onDrill={onDrill} dense />
      </div>
    );
  }

  // r = 100/(2π) makes the circumference exactly 100, so a share is a length.
  const R = 15.9155;

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox="0 0 42 42" className={cn(compact ? 'h-32 w-32' : 'h-44 w-44')} role="img" aria-labelledby={id}>
        <title id={id}>{measure.label} לפי {result.columns[0].label}</title>
        <circle cx="21" cy="21" r={R} fill="none" className="stroke-subtle" strokeWidth="6" />
        {slices.map((s) => (
          <circle
            key={s.index}
            cx="21"
            cy="21"
            r={R}
            fill="none"
            strokeWidth="6"
            strokeDasharray={`${(s.share * 100).toFixed(3)} ${(100 - s.share * 100).toFixed(3)}`}
            // -25 puts the first slice at twelve o'clock rather than at three.
            strokeDashoffset={(-s.offset * 100 + 25).toFixed(3)}
            className={fillFor(s.row.groupKey as string | null, s.index, true).replace('fill-', 'stroke-')}
          >
            <title>
              {formatGroup(String(s.row.group))}: {formatValue(s.value, measure.type)} (
              {Math.round(s.share * 100)}%)
            </title>
          </circle>
        ))}
      </svg>

      <ul className="flex min-w-48 flex-1 flex-col gap-1">
        {slices.map((s) => (
          <li key={s.index}>
            <Slice
              clickable={Boolean(onDrill)}
              onClick={() => onDrill?.(s.row.groupKey as string | null, String(s.row.group))}
            >
              <span
                className={cn(
                  'h-2.5 w-2.5 shrink-0 rounded-sm',
                  fillFor(s.row.groupKey as string | null, s.index, true).replace('fill-', 'bg-')
                )}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-ink-secondary">
                {formatGroup(String(s.row.group))}
              </span>
              <span className="shrink-0 font-semibold text-ink tabular-nums">
                {formatValue(s.value, measure.type)}
              </span>
              <span className="w-10 shrink-0 text-end text-sm text-ink-tertiary tabular-nums">
                {Math.round(s.share * 100)}%
              </span>
            </Slice>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One legend row: a button where clicking opens the records, a line of text where it does not. */
function Slice({
  clickable,
  onClick,
  children
}: {
  clickable: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const className = 'flex w-full items-center gap-2 rounded px-1 py-0.5 text-start text-base';
  if (!clickable) return <div className={className}>{children}</div>;
  return (
    <button type="button" onClick={onClick} className={cn(className, 'hover:bg-subtle')}>
      {children}
    </button>
  );
}

/** Exported so the dashboard and the builder colour their own chips the same way. */
export { SERIES, CATEGORY_META, STATUS_META };
