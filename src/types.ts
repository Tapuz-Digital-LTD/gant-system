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
  | 'export.run' | 'import.run' | 'activity.view'
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
  /** ישיבת התנעה — the meeting that opens the work and hands it out. */
  kickoffMeetingDate: string | null;
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
  /**
   * What would happen to the daily digest right now.
   * 'send' — it goes out · 'log' — connected, but sending is off ·
   * 'unconfigured' — no provider.
   */
  delivery: 'send' | 'log' | 'unconfigured';
  /** The same, for the mail sent when somebody is handed a task. */
  assignmentDelivery: 'send' | 'log' | 'unconfigured';
}

/**
 * A master switch, and why it is where it is.
 *
 * 'on'/'off' — an administrator's choice, and they can change it back.
 * 'blocked'  — this deployment is not permitted to send that kind, so the
 *              switch is shown but explained rather than pretending to work.
 * 'unconfigured' — no provider connected at all.
 */
export interface ChannelState {
  enabled: boolean;
  state: 'on' | 'off' | 'blocked' | 'unconfigured';
}

export interface ChannelSettings {
  assignment: ChannelState;
  digest: ChannelState;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  position: number;
}

export interface TaskAttachment {
  id: string;
  kind: string;
  title: string;
  url: string;
  createdAt: string;
  addedByName: string | null;
}

export interface TaskComment {
  id: string;
  body: string;
  createdAt: string;
  authorName: string | null;
}

/** One entry in a task's history, already turned into words by the server. */
export interface TaskHistoryEntry {
  id: string;
  action: string;
  at: string;
  by: string | null;
  changed: string[];
}

/** Everything a task is, for the panel that opens it. */
export interface TaskDetail {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  assigneeName: string | null;
  creatorName: string | null;
  dueDate: string | null;
  version: number;
  event: { id: string; title: string; date: string };
  board: { id: string; name: string };
  history: TaskHistoryEntry[];
}

/** A task as the project-wide list returns it. */
export interface BoardTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  version: number;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventCategory: EventCategory;
}

export interface GanttBoard {
  /** Set when the project is finished and living on the archive shelf. */
  archivedAt?: string | null;
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
  | 'kickoffMeeting'
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


/* ==================================================================
   ייבוא מאקסל

   Mirrors server/import/plan.ts. Nothing here is computed on the client:
   the plan is derived on the server from the file, twice — once to show and
   once to run — so what a person approves is what happens.
   ================================================================== */

export interface ImportIssue {
  severity: 'error' | 'warning';
  /** "גיליון!12" — what to type into Excel's Name Box to go and look. */
  where: string;
  field?: string;
  message: string;
}

export interface ImportSuggestion {
  field: string;
  fieldLabel: string;
  from: string;
  to: string;
  reason: string;
  /** The answer came from the file itself, so it arrives already ticked. */
  fromFile: boolean;
  applied: boolean;
}

export interface ImportConflict {
  field: string;
  fieldLabel: string;
  values: { value: string; where: string[] }[];
  chosen: string;
}

export type ImportAction = 'create' | 'update' | 'unchanged' | 'skip';

export interface ImportEventValues {
  title: string;
  category: EventCategory;
  actualDate: string;
  actualPrecision: DatePrecision;
  prepMonths: number;
  kickoffMeetingDate: string | null;
  workStartDate: string | null;
  reviewDate: string | null;
  freezeDate: string | null;
  kickoffDate: string | null;
  announceDate: string | null;
  campaignEndDate: string | null;
  note: string | null;
  description: string | null;
}

export interface PlannedImportEvent {
  sourceKey: string;
  /** Unique across the whole plan: which sheet, and which activity in it. */
  planKey: string;
  sheet: string;
  title: string;
  action: ImportAction;
  values: ImportEventValues;
  stated: string[];
  sources: string[];
  issues: ImportIssue[];
  conflicts: ImportConflict[];
  suggestions: ImportSuggestion[];
  existingId?: string;
  changes?: { field: string; fieldLabel: string; from: string; to: string }[];
}

export interface ImportPlanSummary {
  sourceRows: number;
  events: number;
  create: number;
  update: number;
  unchanged: number;
  skip: number;
  tasks: number;
  errors: number;
  warnings: number;
  conflicts: number;
  suggestions: number;
}

/**
 * One sheet, and the board it becomes.
 *
 * A workbook is a set of sheets, and each sheet that holds a table is a board.
 * The mapping is shown before anything is written and can be changed there, so
 * a whole workbook can never land in one board without somebody having seen it.
 */
export interface ImportBoardPlan {
  sheet: string;
  boardName: string;
  boardId: string | null;
  include: boolean;
  events: PlannedImportEvent[];
  summary: ImportPlanSummary;
}

export interface ImportPlan {
  boards: ImportBoardPlan[];
  skipped: { sheet: string; rows: number; reason: string }[];
  summary: ImportPlanSummary;
}

/** What a person changed about where a sheet goes. */
export interface SheetChoice {
  sheet: string;
  boardName?: string;
  boardId?: string | null;
  include?: boolean;
}

export interface ImportPreview {
  fileName: string;
  /** Every sheet in the file, including the ones that gave nothing and why. */
  sheets: { name: string; rows: number; used: boolean; reason: string | null }[];
  plan: ImportPlan;
}

export interface ImportedBoard {
  boardId: string;
  boardName: string;
  sheet: string;
  boardCreated: boolean;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  /** Ten rows per board, to check against the spreadsheet by eye. */
  sample: {
    title: string;
    sources: string[];
    actualDate: string;
    kickoffMeetingDate: string | null;
    kickoffDate: string | null;
    prepMonths: number;
  }[];
}

export interface ImportResult {
  boards: ImportedBoard[];
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  tasks: number;
  warnings: number;
  errors: number;
}


/* ==================================================================
   דוחות

   Mirrors server/reports/. The vocabulary — which groupings and which
   measures exist, and what each is called in Hebrew — is fetched from
   `/api/reports/model` and never written down here: a label that lives
   in two places is a label that will eventually disagree with itself.
   ================================================================== */

export type ReportDataset = 'events' | 'tasks';
export type ChartKind = 'bar' | 'line' | 'pie' | 'table' | 'number';
export type ReportColumnType = 'text' | 'number' | 'percent' | 'days';

export interface ReportTerm {
  key: string;
  label: string;
  hint: string;
}

export interface ReportMeasureTerm extends ReportTerm {
  type: Exclude<ReportColumnType, 'text'>;
}

export interface ReportDatasetModel {
  key: ReportDataset;
  label: string;
  hint: string;
  dimensions: ReportTerm[];
  measures: ReportMeasureTerm[];
  dateFields: ReportTerm[];
  filters: ReportTerm[];
}

export interface ReportModel {
  datasets: ReportDatasetModel[];
  values: {
    categories: { key: string; label: string }[];
    statuses: { key: string; label: string }[];
    priorities: { key: string; label: string }[];
  };
  charts: { key: ChartKind; label: string }[];
}

/** Only keys the server's own model lists ever reach here. */
export interface ReportFilters {
  dateField?: string;
  from?: string;
  to?: string;
  boardIds?: string[];
  categories?: string[];
  statuses?: string[];
  priorities?: string[];
  assigneeIds?: string[];
  onlyOpen?: boolean;
  onlyLate?: boolean;
}

export interface ReportDefinition {
  dataset: ReportDataset;
  dimension: string;
  measures: string[];
  filters: ReportFilters;
  includeArchived: boolean;
}

export interface ReportColumn {
  key: string;
  label: string;
  type: ReportColumnType;
}

export interface ReportResult {
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  total: number;
  truncated: boolean;
}

export interface SavedReport {
  id: string;
  name: string;
  definition: ReportDefinition;
  chart: ChartKind;
  ownerId: string | null;
  pinned: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export type DashboardSize = 'small' | 'medium' | 'large';

export interface Dashboard {
  layout: { savedReportId: string; size: DashboardSize }[];
}
