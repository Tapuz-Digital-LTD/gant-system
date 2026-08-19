import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './cn';

const CONTROL =
  'w-full rounded-md border border-line bg-surface text-ink text-base ' +
  'placeholder:text-ink-tertiary transition-colors ' +
  'hover:border-line-strong focus:border-primary focus:outline-none ' +
  'disabled:bg-subtle disabled:text-ink-disabled disabled:cursor-not-allowed';

export function Label({
  children,
  htmlFor,
  required,
  hint
}: {
  children: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="flex items-baseline gap-1.5 text-xs font-semibold text-ink-secondary">
      <span>{children}</span>
      {required && <span className="text-primary">*</span>}
      {hint && <span className="font-normal text-ink-tertiary">{hint}</span>}
    </label>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(CONTROL, 'h-9 px-3', className)} {...rest} />;
  }
);

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, rows = 3, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(CONTROL, 'px-3 py-2 resize-y', className)} {...rest} />;
});

/** Native select — already keyboard- and RTL-correct in every browser. */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...rest }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(CONTROL, 'h-9 ps-3 pe-9 appearance-none cursor-pointer', className)}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute inset-y-0 end-2.5 my-auto h-4.5 w-4.5 text-ink-tertiary"
        aria-hidden="true"
      />
    </div>
  );
});

/** Label + control + optional error, stacked. */
export function Field({
  label,
  required,
  hint,
  error,
  htmlFor,
  children
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={htmlFor} required={required} hint={hint}>
        {label}
      </Label>
      {children}
      {error && <span className="text-xs text-late">{error}</span>}
    </div>
  );
}
