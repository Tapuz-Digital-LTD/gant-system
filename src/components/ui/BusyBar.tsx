import React, { useEffect, useState } from 'react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';

/**
 * The thin line that says the system heard you.
 *
 * Most screens only showed a spinner on their very first load. Everything
 * afterwards — moving to the next month, saving an event, dragging a card,
 * opening a campaign — kept the previous data on screen and changed nothing
 * until the answer arrived. On a slow connection that reads as a click that
 * did not register, and people click again.
 *
 * Driven by React Query's own counters, so it covers every request without any
 * screen having to remember to opt in. A screen added next year gets it too.
 */

/**
 * Long enough that a fast reply never flashes a bar, short enough that a slow
 * one is acknowledged before somebody reaches for the mouse again. Below about
 * a tenth of a second people read a change as instant; past a third they start
 * to doubt.
 */
const SHOW_AFTER_MS = 180;

export function BusyBar() {
  const busy = useIsFetching() + useIsMutating() > 0;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!busy) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [busy]);

  return (
    <div
      // Announced, not described: a screen reader user needs to know the system
      // is working, and does not need the bar itself narrated.
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-0.5"
    >
      {visible && (
        <>
          <span className="sr-only">טוען…</span>
          <div className="h-full w-full overflow-hidden bg-primary-soft">
            <div className="h-full w-1/3 animate-busy rounded-full bg-primary" />
          </div>
        </>
      )}
    </div>
  );
}
