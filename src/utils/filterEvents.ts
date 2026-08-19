import { EventItem, FilterState, monthKeyOf } from '../types';

// One implementation for every view. Previously each of the four views carried
// its own copy and honoured a different subset, so the same filter chip produced
// different results depending on which tab you were on.

function matchesSearch(ev: EventItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const haystack = [
    ev.title,
    ev.description,
    ev.note,
    ...(ev.tasks || []).flatMap((t) => [t.title, t.description])
  ];

  return haystack.some((field) => field?.toLowerCase().includes(q));
}

/** An event matches a year if any of its three dates falls in it. */
function matchesYear(ev: EventItem, year: string): boolean {
  if (year === 'all') return true;
  return [monthKeyOf(ev), ev.kickoffDate, ev.actualDate].some((d) => d?.startsWith(year));
}

export function filterEvents(events: EventItem[], filter: FilterState): EventItem[] {
  return events.filter((ev) => {
    if (!matchesSearch(ev, filter.search)) return false;
    if (filter.category !== 'all' && ev.category !== filter.category) return false;
    if (!matchesYear(ev, filter.year)) return false;

    // Status and assignee describe tasks, so an event matches when any task does.
    if (filter.status !== 'all') {
      if (!ev.tasks?.some((t) => t.status === filter.status)) return false;
    }

    if (filter.assignee && filter.assignee !== 'all') {
      if (!ev.tasks?.some((t) => t.assigneeId === filter.assignee)) return false;
    }

    return true;
  });
}
