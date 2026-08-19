import {
  GanttBoard,
  EventItem,
  TaskItem,
  UserAccess,
  EventComment,
  ActivityEntry,
  EventCategory,
  TaskStatus,
  TaskPriority,
  DatePrecision,
  UserRole,
  Person,
  PermissionMatrix,
  Holiday,
  SearchHit
} from '../types';

const BASE = '/api';

/** A failed request carries the server's code so callers can react to 409 specifically. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: { field: string; message: string }[],
    public readonly currentVersion?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isConflict() {
    return this.status === 409;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const e = json?.error ?? {};
    throw new ApiError(
      res.status,
      e.code ?? 'UNKNOWN',
      e.message ?? 'לא הצלחנו לבצע את הפעולה. נסה שוב',
      e.details,
      e.currentVersion
    );
  }

  return json?.data as T;
}

const body = (data: unknown) => ({ body: JSON.stringify(data) });

export interface EventInput {
  title: string;
  category?: EventCategory;
  status?: TaskStatus;
  kickoffDate?: string | null;
  actualDate: string;
  actualPrecision?: DatePrecision;
  prepMonths?: number;
  note?: string | null;
  description?: string | null;
}

export interface TaskInput {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  dueDate?: string | null;
}

export const api = {
  health: () => request<never>('/health'),

  boards: {
    list: () => request<GanttBoard[]>('/boards'),
    create: (input: { name: string; description?: string }) =>
      request<GanttBoard>('/boards', { method: 'POST', ...body(input) }),
    update: (id: string, input: { name?: string; description?: string; archived?: boolean }) =>
      request<GanttBoard>(`/boards/${id}`, { method: 'PATCH', ...body(input) }),
    duplicate: (id: string, name?: string) =>
      request<GanttBoard>(`/boards/${id}/duplicate`, { method: 'POST', ...body({ name }) }),
    archive: (id: string) => request<void>(`/boards/${id}`, { method: 'DELETE' })
  },

  events: {
    /** The windowed read — the client always asks for a range, never a whole board. */
    list: (boardId: string, from: string, to: string) =>
      request<EventItem[]>(`/boards/${boardId}/events?from=${from}&to=${to}`),
    get: (id: string) => request<EventItem>(`/events/${id}`),
    search: (boardId: string, q: string) =>
      request<SearchHit[]>(`/boards/${boardId}/search?q=${encodeURIComponent(q)}`),
    create: (boardId: string, input: EventInput) =>
      request<EventItem>(`/boards/${boardId}/events`, { method: 'POST', ...body(input) }),
    update: (id: string, version: number, changes: Partial<EventInput>) =>
      request<EventItem>(`/events/${id}`, { method: 'PATCH', ...body({ ...changes, version }) }),
    archive: (id: string) => request<void>(`/events/${id}`, { method: 'DELETE' }),
    listArchived: (boardId: string) => request<EventItem[]>(`/boards/${boardId}/archive`),
    restore: (id: string) => request<EventItem>(`/events/${id}/restore`, { method: 'POST' }),
    activity: (id: string) => request<ActivityEntry[]>(`/events/${id}/activity`)
  },

  tasks: {
    create: (eventId: string, input: TaskInput) =>
      request<TaskItem>(`/events/${eventId}/tasks`, { method: 'POST', ...body(input) }),
    update: (id: string, version: number, changes: Partial<TaskInput>) =>
      request<TaskItem>(`/tasks/${id}`, { method: 'PATCH', ...body({ ...changes, version }) }),
    remove: (id: string) => request<void>(`/tasks/${id}`, { method: 'DELETE' })
  },

  comments: {
    list: (eventId: string) => request<EventComment[]>(`/events/${eventId}/comments`),
    create: (eventId: string, input: { body: string; taskId?: string | null }) =>
      request<EventComment>(`/events/${eventId}/comments`, { method: 'POST', ...body(input) })
  },

  users: {
    list: () => request<UserAccess[]>('/users')
  },

  /** The real Hebrew calendar. Computed on the server, never stored. */
  holidays: {
    list: (from: string, to: string) => request<Holiday[]>(`/holidays?from=${from}&to=${to}`)
  },

  people: {
    list: () => request<Person[]>('/people'),
    create: (input: { email: string; name?: string; role: UserRole; isGuest: boolean }) =>
      request<Person>('/people', { method: 'POST', ...body(input) }),
    update: (id: string, input: { name?: string; role?: UserRole }) =>
      request<Person>(`/people/${id}`, { method: 'PATCH', ...body(input) }),
    remove: (id: string) => request<void>(`/people/${id}`, { method: 'DELETE' }),
    grantBoard: (boardId: string, userId: string, role: 'editor' | 'viewer') =>
      request<void>(`/boards/${boardId}/members`, { method: 'POST', ...body({ userId, role }) }),
    revokeBoard: (boardId: string, userId: string) =>
      request<void>(`/boards/${boardId}/members/${userId}`, { method: 'DELETE' })
  },

  permissions: {
    get: () => request<PermissionMatrix>('/permissions'),
    set: (role: UserRole, permission: string, allowed: boolean) =>
      request<Record<UserRole, Record<string, boolean>>>('/permissions', {
        method: 'PATCH',
        ...body({ role, permission, allowed })
      })
  }
};
