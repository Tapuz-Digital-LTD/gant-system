import { GanttBoard, UserAccess, EventItem, TaskItem } from '../types';

const API_BASE = '/api';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errMsg = `HTTP Error ${res.status}: ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (errJson?.message) errMsg = errJson.message;
    } catch {}
    throw new Error(errMsg);
  }
  const json = await res.json();
  return (json.data !== undefined ? json.data : json) as T;
}

export const api = {
  // Boards API
  boards: {
    async getAll(): Promise<GanttBoard[]> {
      const res = await fetch(`${API_BASE}/boards`);
      return handleResponse<GanttBoard[]>(res);
    },

    async getById(id: string): Promise<GanttBoard> {
      const res = await fetch(`${API_BASE}/boards/${id}`);
      return handleResponse<GanttBoard>(res);
    },

    async create(data: Partial<GanttBoard>): Promise<GanttBoard> {
      const res = await fetch(`${API_BASE}/boards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return handleResponse<GanttBoard>(res);
    },

    async update(id: string, updates: Partial<GanttBoard>): Promise<GanttBoard> {
      const res = await fetch(`${API_BASE}/boards/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      return handleResponse<GanttBoard>(res);
    },

    async delete(id: string): Promise<boolean> {
      const res = await fetch(`${API_BASE}/boards/${id}`, {
        method: 'DELETE'
      });
      await handleResponse<{ success: boolean }>(res);
      return true;
    },

    async duplicate(id: string, customName?: string): Promise<GanttBoard> {
      const res = await fetch(`${API_BASE}/boards/${id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customName })
      });
      return handleResponse<GanttBoard>(res);
    }
  },

  // Events API
  events: {
    async add(boardId: string, event: Partial<EventItem>): Promise<EventItem> {
      const res = await fetch(`${API_BASE}/boards/${boardId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
      });
      return handleResponse<EventItem>(res);
    },

    async update(boardId: string, eventId: string, updates: Partial<EventItem>): Promise<EventItem> {
      const res = await fetch(`${API_BASE}/boards/${boardId}/events/${eventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      return handleResponse<EventItem>(res);
    },

    async delete(boardId: string, eventId: string): Promise<boolean> {
      const res = await fetch(`${API_BASE}/boards/${boardId}/events/${eventId}`, {
        method: 'DELETE'
      });
      await handleResponse<{ success: boolean }>(res);
      return true;
    }
  },

  // Tasks API
  tasks: {
    async add(boardId: string, eventId: string, task: Partial<TaskItem>): Promise<TaskItem> {
      const res = await fetch(`${API_BASE}/boards/${boardId}/events/${eventId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task)
      });
      return handleResponse<TaskItem>(res);
    },

    async update(boardId: string, eventId: string, taskId: string, updates: Partial<TaskItem>): Promise<TaskItem> {
      const res = await fetch(`${API_BASE}/boards/${boardId}/events/${eventId}/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      return handleResponse<TaskItem>(res);
    },

    async delete(boardId: string, eventId: string, taskId: string): Promise<boolean> {
      const res = await fetch(`${API_BASE}/boards/${boardId}/events/${eventId}/tasks/${taskId}`, {
        method: 'DELETE'
      });
      await handleResponse<{ success: boolean }>(res);
      return true;
    },

    async addComment(boardId: string, eventId: string, taskId: string, comment: { text: string; userEmail: string; userName: string }): Promise<TaskItem> {
      const res = await fetch(`${API_BASE}/boards/${boardId}/events/${eventId}/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(comment)
      });
      return handleResponse<TaskItem>(res);
    }
  },

  // Users API
  users: {
    async getAll(): Promise<UserAccess[]> {
      const res = await fetch(`${API_BASE}/users`);
      return handleResponse<UserAccess[]>(res);
    },

    async add(userData: Partial<UserAccess>): Promise<UserAccess> {
      const res = await fetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });
      return handleResponse<UserAccess>(res);
    },

    async update(id: string, updates: Partial<UserAccess>): Promise<UserAccess> {
      const res = await fetch(`${API_BASE}/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      return handleResponse<UserAccess>(res);
    },

    async delete(id: string): Promise<boolean> {
      const res = await fetch(`${API_BASE}/users/${id}`, {
        method: 'DELETE'
      });
      await handleResponse<{ success: boolean }>(res);
      return true;
    }
  },

  // AI Assistant API
  ai: {
    async suggestTasks(params: {
      eventTitle: string;
      category?: string;
      kickoffDate?: string;
      actualDate?: string;
      prepMonths?: number;
    }): Promise<{
      recommendedTasks: Array<{
        title: string;
        description: string;
        priority: string;
        suggestedRole: string;
        daysBeforeKickoff: number;
        checklist: string[];
      }>;
      strategicTips: string[];
    }> {
      const res = await fetch(`${API_BASE}/ai/suggest-tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      return handleResponse<any>(res);
    },

    async getInsights(params: {
      boardName: string;
      eventCount: number;
      upcomingEvents: any[];
    }): Promise<{
      summary: string;
      criticalMilestones: string[];
      workloadAssessment: string;
    }> {
      const res = await fetch(`${API_BASE}/ai/campaign-insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      return handleResponse<any>(res);
    }
  },

  // Export URLs
  export: {
    getCsvUrl(boardId: string): string {
      return `${API_BASE}/export/csv/${boardId}`;
    },
    getJsonUrl(boardId: string): string {
      return `${API_BASE}/export/json/${boardId}`;
    }
  }
};
