import {
  ChannelSettings,
  GanttBoard,
  EventItem,
  TaskItem,
  TaskDetail,
  BoardTask,
  ChecklistItem,
  TaskAttachment,
  TaskComment,
  MyTask,
  AppNotification,
  NotificationPrefs,
  DigestPreview,
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
  SearchHit,
  ImportPreview,
  ImportResult,
  Dashboard,
  ReportDefinition,
  ReportModel,
  ReportResult,
  SavedReport,
  ChartKind
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
  actualDate: string;
  actualPrecision?: DatePrecision;
  prepMonths?: number;
  /* Milestones — every one optional, none derived from another. */
  kickoffMeetingDate?: string | null;
  workStartDate?: string | null;
  reviewDate?: string | null;
  freezeDate?: string | null;
  kickoffDate?: string | null;
  announceDate?: string | null;
  campaignEndDate?: string | null;
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
    archive: (id: string) => request<void>(`/boards/${id}`, { method: 'DELETE' }),
    /** The finished shelf. Same permissions, same scoping — just the other state. */
    listArchived: () => request<GanttBoard[]>('/boards?archived=1'),
    restore: (id: string) => request<GanttBoard>(`/boards/${id}/restore`, { method: 'POST' }),
    purge: (id: string) => request<{ id: string }>(`/boards/${id}/permanent`, { method: 'DELETE' })
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
    /** Irreversible, and only for an event already in the archive. */
    purge: (id: string) =>
      request<{ id: string; title: string; taskCount: number }>(`/events/${id}/permanent`, {
        method: 'DELETE'
      }),
    activity: (id: string) => request<ActivityEntry[]>(`/events/${id}/activity`)
  },

  tasks: {
    /** The signed-in person's own work, across every board they can reach. */
    mine: () => request<MyTask[]>('/my/tasks'),
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

  notifications: {
    list: () => request<{ items: AppNotification[]; unread: number }>('/notifications'),
    prefs: () => request<NotificationPrefs>('/my/notification-prefs'),
    savePrefs: (prefs: Partial<NotificationPrefs>) =>
      request<NotificationPrefs>('/my/notification-prefs', { method: 'PUT', ...body(prefs) }),
    /** What today's digest would say. Reads only; sends nothing. */
    preview: () => request<DigestPreview>('/my/digest-preview'),
    orgDefaults: () => request<Partial<NotificationPrefs>>('/settings/notification-defaults'),
    /** The master switches. Admin only; the server enforces that, not the screen. */
    channels: () => request<ChannelSettings>('/settings/channels'),
    saveChannels: (next: { assignment?: boolean; digest?: boolean }) =>
      request<{ assignment: boolean; digest: boolean }>('/settings/channels', { method: 'PUT', ...body(next) }),
    saveOrgDefaults: (prefs: Partial<NotificationPrefs>) =>
      request<Partial<NotificationPrefs>>('/settings/notification-defaults', { method: 'PUT', ...body(prefs) }),
    markRead: (id?: string) =>
      request<void>('/notifications/read', { method: 'POST', ...body(id ? { id } : {}) }),
    remove: (id: string) => request<void>(`/notifications/${id}`, { method: 'DELETE' }),
    /** Your own mobile. Normalised on the server, or refused there. */
    savePhone: (phone: string | null) =>
      request<{ phone: string | null }>('/my/phone', { method: 'PUT', ...body({ phone }) })
  },

  /** One task, and everything hanging off it. */
  task: {
    detail: (id: string) => request<TaskDetail>(`/tasks/${id}`),
    forBoard: (boardId: string) => request<BoardTask[]>(`/boards/${boardId}/tasks`),

    checklist: (id: string) => request<ChecklistItem[]>(`/tasks/${id}/checklist`),
    addStep: (id: string, text: string) =>
      request<ChecklistItem>(`/tasks/${id}/checklist`, { method: 'POST', ...body({ text }) }),
    setStep: (taskId: string, id: string, changes: { text?: string; done?: boolean }) =>
      request<ChecklistItem>(`/tasks/${taskId}/checklist/${id}`, { method: 'PATCH', ...body(changes) }),
    removeStep: (taskId: string, id: string) =>
      request<void>(`/tasks/${taskId}/checklist/${id}`, { method: 'DELETE' }),

    attachments: (id: string) => request<TaskAttachment[]>(`/tasks/${id}/attachments`),
    addLink: (id: string, input: { url: string; title?: string }) =>
      request<TaskAttachment>(`/tasks/${id}/attachments`, { method: 'POST', ...body(input) }),
    removeLink: (taskId: string, id: string) =>
      request<void>(`/tasks/${taskId}/attachments/${id}`, { method: 'DELETE' }),

    comments: (id: string) => request<TaskComment[]>(`/tasks/${id}/comments`),
    addComment: (id: string, text: string) =>
      request<TaskComment>(`/tasks/${id}/comments`, { method: 'POST', ...body({ body: text }) })
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

  /**
   * Excel in, and the same file twice.
   *
   * The file rides along on both calls. Nothing is stored between them, so
   * there is no half-finished import to expire and no state for a second tab
   * to trample — the server derives the plan from the file each time, and the
   * client sends decisions rather than data.
   */
  imports: {
    preview: (input: {
      fileName: string;
      fileBase64: string;
      boardId?: string | null;
      accepted?: string[];
      rejected?: string[];
      excluded?: string[];
    }) => request<ImportPreview>('/import/preview', { method: 'POST', ...body(input) }),
    commit: (input: {
      fileName: string;
      fileBase64: string;
      boardId?: string | null;
      boardName?: string | null;
      accepted: string[];
      rejected: string[];
      excluded: string[];
      expect: { create: number; update: number };
    }) => request<ImportResult>('/import/commit', { method: 'POST', ...body(input) })
  },

  /**
   * Reports.
   *
   * The definition goes up, aggregated rows come back. The browser never
   * receives the records a number is made of unless somebody clicks the number,
   * which is what keeps a report on three years of campaigns the same size as a
   * report on one.
   */
  reports: {
    model: () => request<ReportModel>('/reports/model'),
    run: (definition: ReportDefinition) =>
      request<ReportResult>('/reports/run', { method: 'POST', ...body(definition) }),
    /** The records behind one bar. Capped on the server; this is a look, not a download. */
    drill: (definition: ReportDefinition, groupKey: string | null) =>
      request<ReportResult>('/reports/drill', {
        method: 'POST',
        ...body({ definition, cell: { groupKey } })
      }),

    saved: {
      list: () => request<SavedReport[]>('/reports/saved'),
      create: (input: { name: string; definition: ReportDefinition; chart: ChartKind }) =>
        request<SavedReport>('/reports/saved', { method: 'POST', ...body(input) }),
      update: (
        id: string,
        changes: { name?: string; definition?: ReportDefinition; chart?: ChartKind; pinned?: boolean; position?: number }
      ) => request<SavedReport>(`/reports/saved/${id}`, { method: 'PATCH', ...body(changes) }),
      remove: (id: string) => request<void>(`/reports/saved/${id}`, { method: 'DELETE' }),
      duplicate: (id: string) =>
        request<SavedReport>(`/reports/saved/${id}/duplicate`, { method: 'POST' })
    },

    dashboard: {
      get: () => request<Dashboard>('/reports/dashboard'),
      save: (layout: Dashboard['layout']) =>
        request<Dashboard>('/reports/dashboard', { method: 'PUT', ...body({ layout }) })
    }
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
