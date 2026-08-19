import React from 'react';
import { Popover as RadixPopover } from 'radix-ui';
import { cn } from './cn';

/** For panels holding form controls — unlike a menu, arrow keys stay with the inputs. */
export function Popover({
  trigger,
  children,
  align = 'end',
  className
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  return (
    <RadixPopover.Root>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          align={align}
          sideOffset={6}
          className={cn(
            'z-50 rounded-lg border border-line bg-surface p-3 shadow-pop',
            className
          )}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}

export const PopoverClose = RadixPopover.Close;
