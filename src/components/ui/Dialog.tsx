import React from 'react';
import { Dialog as RadixDialog } from 'radix-ui';
import { ArrowRight, X } from 'lucide-react';
import { cn } from './cn';

/**
 * Radix supplies focus trap, Esc, scroll lock, focus restore and aria wiring.
 * Everything visual below is ours.
 */
/**
 * A dialog, optionally one level deep.
 *
 * `onBack` is what stops this from becoming a dialog on top of a dialog. A task
 * lives inside a campaign, so opening one from the other is a step inwards, not
 * a second window — two overlays means two close buttons, two footers, and a
 * shadow of the first sticking out behind the second, and the person looking at
 * it has to work out which "סגור" belongs to what.
 *
 * So the same surface goes one level in, and the header grows a way back. It is
 * the pattern a phone uses for a list and its detail, and it needs no
 * explaining to anybody who has used one.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  size = 'md',
  footer,
  onBack,
  backLabel,
  children
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  footer?: React.ReactNode;
  /** Given when this view sits inside another one. Renders the way back. */
  onBack?: () => void;
  /** What we go back *to*, named. "חזרה" alone makes people guess. */
  backLabel?: string;
  children: React.ReactNode;
}) {
  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }[size];

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-ink/25 backdrop-blur-[1px]" />
        <RadixDialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            'flex max-h-[88vh] w-[calc(100vw-2rem)] flex-col overflow-hidden',
            'rounded-lg border border-line bg-surface shadow-modal',
            width
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              {onBack && (
                /*
                 * Above the title, not beside it: the title is what you are
                 * looking at, and this is where you came from. Reading order in
                 * Hebrew puts it first, which is also the order of the thought.
                 */
                <button
                  onClick={onBack}
                  className="-mr-1 mb-0.5 flex w-fit items-center gap-1 rounded-md px-1 py-0.5 text-sm text-ink-tertiary transition-colors hover:bg-subtle hover:text-ink"
                >
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  <span className="truncate">{backLabel ? `חזרה ל${backLabel}` : 'חזרה'}</span>
                </button>
              )}
              <RadixDialog.Title className="text-lg font-bold text-ink">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="text-sm text-ink-tertiary">
                  {description}
                </RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close
              aria-label="סגור"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-subtle text-ink-secondary transition-colors hover:bg-muted hover:text-ink"
            >
              <X className="h-5 w-5" strokeWidth={2.25} />
            </RadixDialog.Close>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

          {footer && (
            <footer className="flex items-center justify-end gap-2 border-t border-line bg-canvas px-5 py-3">
              {footer}
            </footer>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export const DialogClose = RadixDialog.Close;
