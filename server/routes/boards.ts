import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { GanttBoard } from '../../src/types.js';

export const boardsRouter = Router();

// GET all boards
boardsRouter.get('/', (req: Request, res: Response) => {
  try {
    const boards = storage.getBoards();
    res.json({ success: true, count: boards.length, data: boards });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
});

// GET single board by ID
boardsRouter.get('/:id', (req: Request, res: Response) => {
  try {
    const board = storage.getBoardById(req.params.id);
    if (!board) {
      return res.status(404).json({ success: false, message: 'Board not found' });
    }
    res.json({ success: true, data: board });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
});

// POST create new board
boardsRouter.post('/', (req: Request, res: Response) => {
  try {
    const { name, description, category, color, icon, events, users, isDefault } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Board name is required' });
    }

    const newBoard: GanttBoard = {
      id: `board-${Date.now()}`,
      name: name.trim(),
      description: description?.trim() || '',
      category: category || 'events',
      color: color || '#F7414B',
      icon: icon || 'Calendar',
      events: Array.isArray(events) ? events : [],
      users: Array.isArray(users) ? users : [],
      createdAt: new Date().toISOString().slice(0, 10),
      isDefault: Boolean(isDefault)
    };

    const created = storage.createBoard(newBoard);
    res.status(201).json({ success: true, data: created });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
});

// PUT update board
boardsRouter.put('/:id', (req: Request, res: Response) => {
  try {
    const updated = storage.updateBoard(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Board not found' });
    }
    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
});

// DELETE board
boardsRouter.delete('/:id', (req: Request, res: Response) => {
  try {
    const success = storage.deleteBoard(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, message: 'Board not found or could not be deleted' });
    }
    res.json({ success: true, message: 'Board deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
});

// POST duplicate board
boardsRouter.post('/:id/duplicate', (req: Request, res: Response) => {
  try {
    const { customName } = req.body;
    const duplicated = storage.duplicateBoard(req.params.id, customName);
    if (!duplicated) {
      return res.status(404).json({ success: false, message: 'Source board not found' });
    }
    res.status(201).json({ success: true, data: duplicated });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
});
