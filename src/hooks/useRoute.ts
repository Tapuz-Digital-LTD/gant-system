import { useCallback, useSyncExternalStore } from 'react';
import { Route, buildRoute, parseRoute } from '../utils/routes';

/**
 * The History API, subscribed to properly — no routing library.
 *
 * `popstate` covers the back and forward buttons; pushes from inside the app
 * fire the same notification by hand, because the browser deliberately does not.
 */

const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  if (listeners.size === 1) window.addEventListener('popstate', emit);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) window.removeEventListener('popstate', emit);
  };
}

function snapshot(): string {
  return window.location.pathname + window.location.search;
}

export function navigate(url: string, options?: { replace?: boolean }): void {
  if (url === snapshot()) return;
  if (options?.replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
  emit();
}

export function useRoute(): {
  route: Route;
  url: string;
  go: (next: Partial<Route>, options?: { replace?: boolean }) => void;
} {
  const url = useSyncExternalStore(subscribe, snapshot, () => '/');
  const route = parseRoute(url);

  const go = useCallback(
    (next: Partial<Route>, options?: { replace?: boolean }) => {
      const current = parseRoute(window.location.pathname + window.location.search);
      navigate(buildRoute({ ...current, ...next }), options);
    },
    []
  );

  return { route, url, go };
}
