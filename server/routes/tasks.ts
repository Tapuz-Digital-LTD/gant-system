import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { TaskItem, TaskStatus, TaskPriority, TaskChecklistItem, TaskComment } from '../../src/types.js';

export const tasksRouter = Router({ mergeParams: true });

// POST add task to an event
tasksRouter.post('/', (req: Request, res: Response) => {
  try {
    const { boardId, eventId } = req.params;
    const {
      title,
      description,
      status,
      priority,
      assigneeEmail,
      assigneeName,
      dueDate,
      checklist,
      comments
    } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: 'Task title is required' });
    }

    const newTask: TaskItem = {
      id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: title.trim(),
      description: description?.trim() || '',
      status: (status as TaskStatus) || 'todo',
      priority: (priority as TaskPriority) || 'medium',
      assigneeEmail: assigneeEmail || 'admin@xtra.co.il',
      assigneeName: assigneeName || 'חבר צוות',
      dueDate: dueDate || undefined,
      checklist: Array.isArray(checklist) ? checklist : [],
      comments: Array.isArray(comments) ? comments : []
    };

    const created = storage.addTask(boardId, eventId, newTask);
    if (!created) {
      return res.status(404).json({ success: false, message: 'Board or Event not found' });
    }

    res.status(201).json({ success: true, data: created });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
});

// PUT update task
tasksRouter.put('/:taskId', (req: Request, res: Response) => {
  try {
    const { boardId, eventId, taskId } = req.params;
    const updates = req.body;

    if (updates.status === 'done' && !updates.completedAt) {
      updates.completedAt = new Date().toISOString();
    } else if (updates.status && updates.status !== 'done') {
      updates.completedAt = undefined;
    }

    const updated = storage.updateTask(boardId, eventId, taskId, updates);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Task, event, or board not found' });
    }

    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
});

// DELETE task
tasksRouter.delete('/:taskId', (req: Request, res: Response) => {
  try {
    const { boardId, eventId, taskId } = req.params;
    const deleted = storage.deleteTask(boardId, eventId, taskId);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Task, event, or board not found' });
    }

    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
});

// POST add comment to task
tasksRouter.post('/:taskId/comments', (req: Request, res: Response) => {
  try {
    const { boardId, eventId, taskId } = req.params;
    const { text, userEmail, userName } = req.body;

    if (!text) {
      return res.status(400).json({ success: false, message: 'Comment text is required' });
    }

    const board = storage.getBoardById(boardId);
    const event = board?.events.find((e) => e.id === eventId);
    const task = event?.tasks.find((t) => t.id === taskId);

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const newComment: TaskComment = {
      id: `com-${Date.now()}`,
      text: text.trim(),
      userEmail: userEmail || 'user@xtra.co.il',
      userName: userName || 'משתמש',
      date: new Date().toLocaleDateString('he-IL')
    };

    const updatedComments = [...(task.comments || []), newComment];
    const updated = storage.updateTask(boardId, eventId, taskId, { comments: updatedComments });

    res.status(201).json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
});
