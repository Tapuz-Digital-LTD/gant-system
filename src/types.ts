export type ViewMode = 'calendar' | 'gantt' | 'kanban' | 'list' | 'analytics';

export type TaskStatus = 'todo' | 'in_progress' | 'ready_kickoff' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface TaskChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TaskComment {
  id: string;
  userEmail: string;
  userName: string;
  text: string;
  date: string;
}

export interface TaskItem {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeEmail: string;
  assigneeName: string;
  dueDate?: string;
  completedAt?: string;
  checklist: TaskChecklistItem[];
  comments?: TaskComment[];
}

export type EventCategory = 'holiday' | 'campaign' | 'b2b' | 'social' | 'operational' | 'other';

export interface EventItem {
  id: string;
  title: string;
  category: EventCategory;
  kickoffDate?: string; // YYYY-MM-DD
  actualDate?: string; // YYYY-MM-DD or YYYY-MM
  prepMonths: number;
  isFloating: boolean; // if event occurs throughout the month without a specific day
  monthKey: string; // e.g. '2026-08'
  note?: string; // e.g. 'לאירוע 04.12.2026' or 'הכנה 2 חודשים'
  description?: string;
  tasks: TaskItem[];
  color?: string;
  targetAudience?: string;
  budgetEstimate?: string;
  createdAt: string;
  createdBy: string;
}

export interface MonthMeta {
  key: string;
  title: string;
  hebrew: string;
  year: number;
  monthNumber: number;
}

export type UserRole = 'admin' | 'editor' | 'viewer';

export interface UserAccess {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarBg: string;
  addedAt: string;
  accessibleBoards?: string[]; // board IDs or 'all'
}

export interface GanttBoard {
  id: string;
  name: string;
  description: string;
  category: 'events' | 'social' | 'tasks' | 'operations' | 'custom';
  color: string;
  icon: string;
  events: EventItem[];
  users: UserAccess[];
  createdAt: string;
  isDefault?: boolean;
}

export interface FilterState {
  search: string;
  category: string;
  status: string;
  assignee: string;
  showKickoffs: boolean;
  showActuals: boolean;
  year: string; // 'all' | '2026' | '2027' | '2028'
}
