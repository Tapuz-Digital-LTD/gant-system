import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { EventItem } from '../../src/types.js';

export const eventsRouter = Router({ mergeParams: true });

// GET all events for a board
eventsRouter.get('/', (req: Request, res: Response) => {
  try {
    const { boardId } = req.params;
    const events = storage.getEvents(boardId);
    res.json({ success: true, count: events.length, data: events });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
});

// POST add new event
eventsRouter.post('/', (req: Request, res: Response) => {
  try {
    const { boardId } = req.params;
    const {
      title,
      category,
      kickoffDate,
      actualDate,
      prepMonths,
      isFloating,
      monthKey,
      note,
      description,
      tasks,
      createdBy,
      budgetEstimate,
      targetAudience
    } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: 'Event title is required' });
    }

    const newEvent: EventItem = {
      id: `ev-${Date.now()}`,
      title: title.trim(),
      category: category || 'campaign',
      kickoffDate: kickoffDate || undefined,
      actualDate: actualDate || undefined,
      prepMonths: Number(prepMonths) || 0,
      isFloating: Boolean(isFloating),
      monthKey: monthKey || (actualDate ? actualDate.slice(0, 7) : '2026-08'),
      note: note?.trim() || undefined,
      description: description?.trim() || undefined,
      tasks: Array.isArray(tasks) ? tasks : [],
      budgetEstimate: budgetEstimate || undefined,
      targetAudience: targetAudience || undefined,
      createdAt: new Date().toISOString().slice(0, 10),
      createdBy: createdBy || 'admin'
    };

    const created = storage.addEvent(boardId, newEvent);
    if (!created) {
      return res.status(404).json({ success: false, message: 'Board not found' });
    }

    res.status(201).json({ success: true, data: created });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
});

// PUT update event
eventsRouter.put('/:eventId', (req: Request, res: Response) => {
  try {
    const { boardId, eventId } = req.params;
    const updated = storage.updateEvent(boardId, eventId, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Event or board not found' });
    }
    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
});

// DELETE event
eventsRouter.delete('/:eventId', (req: Request, res: Response) => {
  try {
    const { boardId, eventId } = req.params;
    const deleted = storage.deleteEvent(boardId, eventId);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Event or board not found' });
    }
    res.json({ success: true, message: 'Event deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
});
