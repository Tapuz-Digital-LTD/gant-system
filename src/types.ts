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
  phone?: string | null;
  /** What this person may actually do. Comes from the server, never guessed. */
  permissions?: string[];
}

/** Every capability the UI gates on. Mirrors server/permissions.ts. */
export type Capability =
  | 'event.create' | 'event.edit' | 'event.delete' | 'event.restore' | 'event.purge'
  | 'task.create' | 'task.edit' | 'task.delete'
  | 'comment.create'
  | 'board.create' | 'board.edit' | 'board.duplicate' | 'board.delete' | 'board.purge'
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
  /** When it last changed hands. Null for work nobody has been given. */
  assignedAt: string | null;
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
  /** Always a full YYYY-MM-DD. Month precision anchors to the 1st. */
  actualDate: string;
  actualPrecision: DatePrecision;
  prepMonths: number;

  /* Milestones — all optional, all day-precision, none derived from another.
     src/data/milestones.ts says what each one means and how it is drawn. */
  /** Overrides `actualDate - prepMonths` when the exact day is known. */
  workStartDate: string | null;
  reviewDate: string | null;
  freezeDate: string | null;
  /** The campaign starts reaching customers. */
  kickoffDate: string | null;
  /** Internal announcement. Never auto-filled from kickoffDate. */
  announceDate: string | null;
  /** Falls after actualDate, so it sits outside the work window. */
  campaignEndDate: string | null;
  note: string | null;
  description: string | null;
  createdAt: string;
  version: number;
  tasks: TaskItem[];
}

/**
 * A task as it looks on "my tasks": the work plus the two things that make it
 * mean something — which event it belongs to and when that event happens.
 */
export interface MyTask extends TaskItem {
  eventTitle: string;
  eventDate: string;
  eventPrecision: DatePrecision;
  boardId: string;
  boardName: string;
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

export type NotificationKind =
  | 'task_assigned'
  | 'task_due_soon'
  | 'task_overdue'
  | 'task_stalled'
  | 'milestone_soon';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  /** An in-app path. Clicking goes straight to the thing it is about. */
  link: string | null;
  entity: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

/**
 * Notification preferences. Mirrors server/notifications/prefs.ts, which is
 * the authority — a test there fails if the two sets of defaults drift apart.
 */
export interface NotificationPrefs {
  email: 'digest' | 'off';
  sms: 'off' | 'urgent';
  digestHour: number;
  digestDays: number[];
  stalledAfterDays: number;
  dueBeforeDays: number;
  overdue: boolean;
  milestoneBeforeDays: number;
  managerScope: 'none' | 'team' | 'all';
}

export interface DigestItem {
  kind: NotificationKind;
  title: string;
  body: string;
  link: string;
  severity: 1 | 2 | 3;
}

export interface DigestSection {
  heading: string;
  severity: 1 | 2 | 3;
  items: DigestItem[];
}

/** What today's digest would say, without anything being switched on. */
export interface DigestPreview {
  date: string;
  hasAnything: boolean;
  sections: DigestSection[];
  team: DigestSection[];
  text: string;
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

/** One of the seven moments in an event's life. Described in data/milestones.ts. */
export type MilestoneKey =
  | 'workStart'
  | 'review'
  | 'freeze'
  | 'kickoff'
  | 'announce'
  | 'actual'
  | 'campaignEnd';

export interface FilterState {
  search: string;
  category: string;
  status: string;
  assignee: string;
  /**
   * Milestone kinds the person has switched off. Empty means show everything.
   * Replaces the two showKickoffs/showActuals booleans, which could not grow
   * past two kinds and said nothing about the other five.
   */
  hiddenMilestones: MilestoneKey[];
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
