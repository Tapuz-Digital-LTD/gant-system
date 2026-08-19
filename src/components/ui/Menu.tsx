import React from 'react';
import { DropdownMenu } from 'radix-ui';
import { cn } from './cn';

export function Menu({ trigger, children, align = 'start' }: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          className={cn(
            'z-50 min-w-56 overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-pop',
            'max-h-[70vh] overflow-y-auto'
          )}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function MenuItem({
  onSelect,
  active,
  className,
  children
}: {
  onSelect?: () => void;
  active?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-base outline-none',
        'data-[highlighted]:bg-subtle',
        active ? 'font-semibold text-ink' : 'text-ink-secondary',
        className
      )}
    >
      {children}
    </DropdownMenu.Item>
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenu.Label className="px-2 pb-1 pt-1.5 text-xs font-semibold tracking-wide text-ink-tertiary">
      {children}
    </DropdownMenu.Label>
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-line" />;
}
