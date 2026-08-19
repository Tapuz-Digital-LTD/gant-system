import React from 'react';
import { Dialog as RadixDialog } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from './cn';

/**
 * Radix supplies focus trap, Esc, scroll lock, focus restore and aria wiring.
 * Everything visual below is ours.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  size = 'md',
  footer,
  children
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  footer?: React.ReactNode;
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
