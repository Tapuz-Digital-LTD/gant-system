import React from 'react';
import { cn } from './cn';

/** Quiet chips — metadata that should not compete with a status. */
type Tone = 'neutral' | 'primary' | 'done' | 'progress' | 'late' | 'ready';

const TONES: Record<Tone, string> = {
  neutral: 'bg-subtle text-ink-secondary',
  primary: 'bg-primary-soft text-primary',
  done: 'bg-done-soft text-done',
  progress: 'bg-progress-soft text-progress',
  ready: 'bg-ready-soft text-ready',
  late: 'bg-late-soft text-late'
};

export function Badge({
  tone = 'neutral',
  className,
  children
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5',
        'text-xs font-semibold whitespace-nowrap',
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/**
 * Solid status pill. Saturated fill, white text — the one place in the product
 * where colour is loud, because state is what people scan for.
 */
export type StatusFill = 'todo' | 'progress' | 'ready' | 'done' | 'late';

const FILLS: Record<StatusFill, string> = {
  todo: 'bg-todo',
  progress: 'bg-progress',
  ready: 'bg-ready',
  done: 'bg-done',
  late: 'bg-late'
};

export function StatusPill({
  fill,
  className,
  children
}: {
  fill: StatusFill;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center justify-center rounded-md px-2.5',
        'text-xs font-semibold whitespace-nowrap text-white',
        FILLS[fill],
        className
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', className)} />;
}
