import { EventItem, FilterState } from '../types';

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

export function filterEvents(events: EventItem[], filter: FilterState): EventItem[] {
  return events.filter((ev) => {
    if (!matchesSearch(ev, filter.search)) return false;
    if (filter.category !== 'all' && ev.category !== filter.category) return false;

    // Time is not a filter any more. Which period is on screen is navigation,
    // and the server already returns only what overlaps it; a second, invisible
    // year filter on top of that was how events went missing.

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
