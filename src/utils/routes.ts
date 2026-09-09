import { Period, PeriodMode, periodOfToday, todayISO } from './period';

/**
 * The address bar is the state.
 *
 * Everything a person can be looking at — which board, which view, which
 * period, which event is open — lives in the URL. Refreshing, pressing back,
 * or pasting a link into a message all land in the same place, and none of
 * that needed a routing library: the app is already served with an SPA
 * fallback, so the History API is enough.
 *
 *   /                          choose what to do
 *   /b/{board}                 what would you like to see?
 *   /b/{board}/calendar        ?d=2026-09-06&m=week
 *   /b/{board}/timeline        ?d=2026-09-01
 *   /b/{board}/list
 *   ...any of the above        &e={event}   an open event
 *                              &new=1       the new-event steps
 */

export type ViewName = 'calendar' | 'timeline' | 'list' | 'status' | 'overview';

export const VIEW_NAMES: ViewName[] = ['calendar', 'timeline', 'list', 'status', 'overview'];

export interface Route {
  /**
   * "My tasks" is not a view of a board — it crosses all of them — so it is a
   * place of its own rather than a value of `view`.
   */
  myTasks: boolean;
  /** null on the home screen. */
  boardId: string | null;
  /** null on the board hub, before a view is chosen. */
  view: ViewName | null;
  period: Period;
  /** The event whose details are open, if any. */
  eventId: string | null;
  /** Whether the new-event steps are open. */
  creating: boolean;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isView(v: string): v is ViewName {
  return (VIEW_NAMES as string[]).includes(v);
}

export function parseRoute(url: string): Route {
  const [path, query = ''] = url.split('?');
  const segments = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query);

  const myTasks = segments[0] === 'my';
  const boardId = segments[0] === 'b' && segments[1] ? segments[1] : null;
  const rawView = boardId ? segments[2] : undefined;
  const view = rawView && isView(rawView) ? rawView : null;

  const anchor = params.get('d');
  const mode = params.get('m');
  const period: Period = {
    mode: mode === 'week' ? 'week' : 'month',
    // A malformed or missing day is not an error worth a screen — it is today.
    anchor: anchor && ISO_DAY.test(anchor) ? anchor : todayISO()
  };

  return {
    myTasks,
    boardId,
    view,
    period,
    eventId: params.get('e'),
    creating: params.get('new') === '1'
  };
}

export function buildRoute(route: Partial<Route>): string {
  const { myTasks = false, boardId = null, view = null, period, eventId = null, creating = false } = route;

  if (myTasks) {
    const params = new URLSearchParams();
    if (eventId) params.set('e', eventId);
    const query = params.toString();
    return query ? `/my?${query}` : '/my';
  }

  if (!boardId) return '/';

  const path = view ? `/b/${boardId}/${view}` : `/b/${boardId}`;
  const params = new URLSearchParams();

  // The period is only worth writing down where it changes what is on screen.
  if (period && view && view !== 'list' && view !== 'status' && view !== 'overview') {
    params.set('d', period.anchor);
    if (period.mode !== 'month') params.set('m', period.mode);
  }
  if (eventId) params.set('e', eventId);
  if (creating) params.set('new', '1');

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/** A fresh route for a board, landing on today. */
export function boardRoute(boardId: string, view?: ViewName, mode: PeriodMode = 'month'): string {
  return buildRoute({ boardId, view: view ?? null, period: periodOfToday(mode) });
}

/**
 * The last place someone was, so the home screen can offer to put them back.
 * Deliberately in the browser, not on the server: it is a convenience for this
 * person on this device, and it must never decide what anyone is allowed to see.
 */
const LAST_PLACE = 'xtra:last-place';

export interface LastPlace {
  url: string;
  boardId: string;
  boardName: string;
  view: ViewName | null;
  savedAt: string;
}

export function rememberPlace(place: Omit<LastPlace, 'savedAt'>): void {
  try {
    localStorage.setItem(LAST_PLACE, JSON.stringify({ ...place, savedAt: new Date().toISOString() }));
  } catch {
    // A browser with storage switched off simply does not get the shortcut.
  }
}

export function recallPlace(): LastPlace | null {
  try {
    const raw = localStorage.getItem(LAST_PLACE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastPlace;
    return parsed?.url && parsed?.boardId ? parsed : null;
  } catch {
    return null;
  }
}

export function forgetPlace(): void {
  try {
    localStorage.removeItem(LAST_PLACE);
  } catch {
    /* nothing to clean up */
  }
}
