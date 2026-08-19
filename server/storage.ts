import fs from 'fs';
import path from 'path';
import { GanttBoard, UserAccess, EventItem, TaskItem } from '../src/types.js';
import { INITIAL_BOARDS, INITIAL_USERS } from '../src/data/initialData.js';

export interface DatabaseSchema {
  boards: GanttBoard[];
  users: UserAccess[];
  lastUpdated: string;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'app-db.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create data directory:', err);
  }
}

// In-memory cache
let dbCache: DatabaseSchema | null = null;

function loadDatabase(): DatabaseSchema {
  if (dbCache) return dbCache;

  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      dbCache = JSON.parse(content);
      if (dbCache && Array.isArray(dbCache.boards) && Array.isArray(dbCache.users)) {
        return dbCache;
      }
    } catch (err) {
      console.error('Error reading database file, resetting to initial data:', err);
    }
  }

  // Initialize with initial data
  dbCache = {
    boards: INITIAL_BOARDS,
    users: INITIAL_USERS,
    lastUpdated: new Date().toISOString()
  };
  saveDatabase();
  return dbCache;
}

function saveDatabase(): boolean {
  if (!dbCache) return false;
  try {
    dbCache.lastUpdated = new Date().toISOString();
    fs.writeFileSync(DB_FILE, JSON.stringify(dbCache, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error saving database file:', err);
    return false;
  }
}

export const storage = {
  // Boards
  getBoards(): GanttBoard[] {
    const db = loadDatabase();
    return db.boards;
  },

  getBoardById(id: string): GanttBoard | undefined {
    const db = loadDatabase();
    return db.boards.find((b) => b.id === id);
  },

  createBoard(newBoard: GanttBoard): GanttBoard {
    const db = loadDatabase();
    db.boards.push(newBoard);
    saveDatabase();
    return newBoard;
  },

  updateBoard(id: string, updates: Partial<GanttBoard>): GanttBoard | null {
    const db = loadDatabase();
    const index = db.boards.findIndex((b) => b.id === id);
    if (index === -1) return null;

    db.boards[index] = {
      ...db.boards[index],
      ...updates
    };
    saveDatabase();
    return db.boards[index];
  },

  deleteBoard(id: string): boolean {
    const db = loadDatabase();
    const initialLen = db.boards.length;
    db.boards = db.boards.filter((b) => b.id !== id);
    if (db.boards.length !== initialLen) {
      saveDatabase();
      return true;
    }
    return false;
  },

  duplicateBoard(sourceId: string, customName?: string): GanttBoard | null {
    const db = loadDatabase();
    const sourceBoard = db.boards.find((b) => b.id === sourceId);
    if (!sourceBoard) return null;

    const newId = `board-${Date.now()}`;
    const duplicated: GanttBoard = {
      ...sourceBoard,
      id: newId,
      name: customName || `${sourceBoard.name} (עותק משוכפל)`,
      isDefault: false,
      createdAt: new Date().toISOString().slice(0, 10),
      events: sourceBoard.events.map((ev) => ({
        ...ev,
        id: `ev-${Math.random().toString(36).substring(2, 9)}`,
        tasks: (ev.tasks || []).map((t) => ({
          ...t,
          id: `task-${Math.random().toString(36).substring(2, 9)}`
        }))
      }))
    };

    db.boards.push(duplicated);
    saveDatabase();
    return duplicated;
  },

  // Events within a board
  getEvents(boardId: string): EventItem[] {
    const board = this.getBoardById(boardId);
    return board ? board.events : [];
  },

  addEvent(boardId: string, event: EventItem): EventItem | null {
    const db = loadDatabase();
    const board = db.boards.find((b) => b.id === boardId);
    if (!board) return null;

    board.events = [event, ...(board.events || [])];
    saveDatabase();
    return event;
  },

  updateEvent(boardId: string, eventId: string, updates: Partial<EventItem>): EventItem | null {
    const db = loadDatabase();
    const board = db.boards.find((b) => b.id === boardId);
    if (!board) return null;

    const evIndex = board.events.findIndex((e) => e.id === eventId);
    if (evIndex === -1) return null;

    board.events[evIndex] = {
      ...board.events[evIndex],
      ...updates
    };
    saveDatabase();
    return board.events[evIndex];
  },

  deleteEvent(boardId: string, eventId: string): boolean {
    const db = loadDatabase();
    const board = db.boards.find((b) => b.id === boardId);
    if (!board) return null as any;

    const initialLen = board.events.length;
    board.events = board.events.filter((e) => e.id !== eventId);
    if (board.events.length !== initialLen) {
      saveDatabase();
      return true;
    }
    return false;
  },

  // Tasks
  addTask(boardId: string, eventId: string, task: TaskItem): TaskItem | null {
    const db = loadDatabase();
    const board = db.boards.find((b) => b.id === boardId);
    if (!board) return null;

    const ev = board.events.find((e) => e.id === eventId);
    if (!ev) return null;

    ev.tasks = [...(ev.tasks || []), task];
    saveDatabase();
    return task;
  },

  updateTask(boardId: string, eventId: string, taskId: string, updates: Partial<TaskItem>): TaskItem | null {
    const db = loadDatabase();
    const board = db.boards.find((b) => b.id === boardId);
    if (!board) return null;

    const ev = board.events.find((e) => e.id === eventId);
    if (!ev || !ev.tasks) return null;

    const taskIndex = ev.tasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) return null;

    ev.tasks[taskIndex] = {
      ...ev.tasks[taskIndex],
      ...updates
    };
    saveDatabase();
    return ev.tasks[taskIndex];
  },

  deleteTask(boardId: string, eventId: string, taskId: string): boolean {
    const db = loadDatabase();
    const board = db.boards.find((b) => b.id === boardId);
    if (!board) return false;

    const ev = board.events.find((e) => e.id === eventId);
    if (!ev || !ev.tasks) return false;

    const initialLen = ev.tasks.length;
    ev.tasks = ev.tasks.filter((t) => t.id !== taskId);
    if (ev.tasks.length !== initialLen) {
      saveDatabase();
      return true;
    }
    return false;
  },

  // Users
  getUsers(): UserAccess[] {
    const db = loadDatabase();
    return db.users;
  },

  addUser(user: UserAccess): UserAccess {
    const db = loadDatabase();
    db.users.push(user);
    saveDatabase();
    return user;
  },

  updateUser(id: string, updates: Partial<UserAccess>): UserAccess | null {
    const db = loadDatabase();
    const index = db.users.findIndex((u) => u.id === id);
    if (index === -1) return null;

    db.users[index] = {
      ...db.users[index],
      ...updates
    };
    saveDatabase();
    return db.users[index];
  },

  deleteUser(id: string): boolean {
    const db = loadDatabase();
    const initialLen = db.users.length;
    db.users = db.users.filter((u) => u.id !== id);
    if (db.users.length !== initialLen) {
      saveDatabase();
      return true;
    }
    return false;
  }
};
