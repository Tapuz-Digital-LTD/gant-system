import React from 'react';
import { Tooltip as RadixTooltip } from 'radix-ui';

export const TooltipProvider = RadixTooltip.Provider;

export function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          sideOffset={6}
          className="z-50 rounded-md bg-ink px-2 py-1 text-xs font-medium text-white shadow-pop"
        >
          {label}
          <RadixTooltip.Arrow className="fill-ink" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
