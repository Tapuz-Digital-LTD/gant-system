import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { toCsvDocument } from '../../src/utils/csv.js';

export const exportRouter = Router();

// GET export board to CSV
exportRouter.get('/csv/:boardId', (req: Request, res: Response) => {
  try {
    const { boardId } = req.params;
    const board = storage.getBoardById(boardId);
    if (!board) {
      return res.status(404).json({ success: false, message: 'Board not found' });
    }

    const headers = [
      'שם האירוע',
      'קטגוריה',
      'תאריך התנעה (עולים לאוויר)',
      'תאריך אמת (מועד האירוע)',
      'חודשי הכנה',
      'חודש יעד',
      'סך משימות',
      'משימות שהושלמו',
      'אחוז ביצוע',
      'הערה'
    ];

    const rows = board.events.map((ev) => {
      const total = ev.tasks?.length || 0;
      const done = ev.tasks?.filter((t) => t.status === 'done').length || 0;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;

      return [
        ev.title || '',
        ev.category || '',
        ev.kickoffDate || '',
        ev.actualDate || '',
        ev.prepMonths,
        ev.monthKey,
        total,
        done,
        `${pct}%`,
        ev.note || ''
      ];
    });

    const csvContent = toCsvDocument(headers, rows);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(board.name)}_export.csv"`);
    res.send(csvContent);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
});

// GET export board to JSON
exportRouter.get('/json/:boardId', (req: Request, res: Response) => {
  try {
    const { boardId } = req.params;
    const board = storage.getBoardById(boardId);
    if (!board) {
      return res.status(404).json({ success: false, message: 'Board not found' });
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(board.name)}_backup.json"`);
    res.json(board);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
});
