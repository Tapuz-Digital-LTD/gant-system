import React from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover disabled:bg-ink-disabled',
  secondary:
    'bg-surface text-ink border border-line-strong hover:bg-subtle hover:border-ink-tertiary disabled:text-ink-disabled disabled:bg-surface',
  ghost: 'text-ink-secondary hover:bg-subtle hover:text-ink disabled:text-ink-disabled',
  danger:
    'bg-surface text-late border border-late/30 hover:bg-late-soft hover:border-late/50 disabled:text-ink-disabled'
};

/**
 * Padding is chosen here, never layered as an override.
 * `px-3.5` and `px-0` have identical specificity, so a later class in the
 * attribute does NOT win — stylesheet order does. That mistake is what squashes
 * an icon button's contents to a 6px sliver.
 */
const SIZES: Record<Size, { text: string; box: string }> = {
  sm: { text: 'h-8 px-3 text-sm gap-1.5', box: 'h-8 w-8 p-0' },
  md: { text: 'h-9 px-3.5 text-base gap-2', box: 'h-9 w-9 p-0' }
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Square button holding only an icon. Requires aria-label. */
  iconOnly?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', iconOnly, className, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md font-semibold whitespace-nowrap',
        'transition-colors duration-100 cursor-pointer disabled:cursor-not-allowed',
        // Flex must never compress an icon child.
        '[&>svg]:shrink-0',
        VARIANTS[variant],
        iconOnly ? SIZES[size].box : SIZES[size].text,
        className
      )}
      {...rest}
    />
  );
});
