/** Mirrors what the API returns. No field here is invented by the client. */

export type ViewMode = 'calendar' | 'gantt' | 'kanban' | 'list' | 'analytics';

export type TaskStatus = 'todo' | 'in_progress' | 'ready_kickoff' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type EventCategory = 'holiday' | 'campaign' | 'b2b' | 'social' | 'operational' | 'other';
export type UserRole = 'admin' | 'editor' | 'viewer';
export type DatePrecision = 'day' | 'month';

export interface UserAccess {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isOwner?: boolean;
  /** What this person may actually do. Comes from the server, never guessed. */
  permissions?: string[];
}

/** Every capability the UI gates on. Mirrors server/permissions.ts. */
export type Capability =
  | 'event.create' | 'event.edit' | 'event.delete' | 'event.restore'
  | 'task.create' | 'task.edit' | 'task.delete'
  | 'comment.create'
  | 'board.create' | 'board.edit' | 'board.duplicate' | 'board.delete'
  | 'export.run' | 'activity.view'
  | 'people.manage' | 'permissions.manage';

/** A person plus the boards they can reach. Staff have an empty list and see everything. */
export interface Person {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isGuest: boolean;
  /** The workspace owner: bypasses every permission and cannot be removed. */
  isOwner: boolean;
  createdAt: string;
  boards: { boardId: string; role: 'editor' | 'viewer' }[];
}

export interface PermissionEntry {
  key: string;
  label: string;
  group: string;
}

export interface PermissionMatrix {
  catalog: PermissionEntry[];
  roles: { key: UserRole; label: string }[];
  matrix: Record<UserRole, Record<string, boolean>>;
}

export interface TaskItem {
  id: string;
  eventId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  startDate: string | null;
  endDate: string | null;
  dueDate: string | null;
  position: number;
  completedAt: string | null;
  version: number;
}

export interface EventItem {
  id: string;
  boardId: string;
  title: string;
  category: EventCategory;
  /** The event's own state — set by a person, not derived from its tasks. */
  status: TaskStatus;
  /** Optional milestone inside the work window, not its start. */
  kickoffDate: string | null;
  /** Always a full YYYY-MM-DD. Month precision anchors to the 1st. */
  actualDate: string;
  actualPrecision: DatePrecision;
  prepMonths: number;
  note: string | null;
  description: string | null;
  createdAt: string;
  version: number;
  tasks: TaskItem[];
}

export interface EventComment {
  id: string;
  eventId: string;
  taskId: string | null;
  body: string;
  createdAt: string;
  authorId: string | null;
  authorName: string | null;
  authorEmail: string | null;
}

export interface GanttBoard {
  id: string;
  name: string;
  description: string;
  position: number;
  eventCount: number;
}

export interface ActivityEntry {
  id: string;
  actorId: string | null;
  entity: string;
  entityId: string;
  action: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export interface Holiday {
  date: string;
  title: string;
  hebrewDate: string;
  kind: 'major' | 'minor' | 'modern' | 'fast' | 'roshchodesh';
  /** A day people do not work — the constraint that matters when planning. */
  isYomTov: boolean;
}

export interface SearchHit {
  kind: 'event' | 'task';
  eventId: string;
  title: string;
  actualDate: string;
  actualPrecision: DatePrecision;
  /** Why this row matched — shown to the reader so a result is never a mystery. */
  matchedOn: 'title' | 'note' | 'description' | 'task';
  context: string | null;
  status?: TaskStatus;
  dueDate?: string | null;
}

export interface MonthMeta {
  key: string;
  title: string;
  hebrew: string;
  year: number;
  monthNumber: number;
}

export interface FilterState {
  search: string;
  category: string;
  status: string;
  assignee: string;
  showKickoffs: boolean;
  showActuals: boolean;
  year: string;
}

/* --- derived, never stored --- */

/** The month an event is filed under. Derived, so it can never disagree. */
export function monthKeyOf(event: Pick<EventItem, 'actualDate'>): string {
  return event.actualDate.slice(0, 7);
}

/** "During the month, no exact day" — one source of truth, no boolean to contradict it. */
export function isFloating(event: Pick<EventItem, 'actualPrecision'>): boolean {
  return event.actualPrecision === 'month';
}
