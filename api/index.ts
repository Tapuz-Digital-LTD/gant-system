import express from 'express';

import { boardsRouter } from '../server/routes/boards.js';
import { eventsRouter } from '../server/routes/events.js';
import { tasksRouter } from '../server/routes/tasks.js';
import { usersRouter } from '../server/routes/users.js';
import { exportRouter } from '../server/routes/export.js';
import { aiRouter } from '../server/routes/ai.js';

// ponytail: Vercel serves dist/ statically, so this function only handles /api/*
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'XTRA Gantt & Task Management Server',
    timestamp: new Date().toISOString(),
    env: process.env.VERCEL_ENV || 'production'
  });
});

app.use('/api/boards', boardsRouter);
app.use('/api/boards/:boardId/events', eventsRouter);
app.use('/api/boards/:boardId/events/:eventId/tasks', tasksRouter);
app.use('/api/users', usersRouter);
app.use('/api/export', exportRouter);
app.use('/api/ai', aiRouter);

app.all('/api/*', (req, res) => {
  res.status(404).json({ success: false, message: `API route ${req.method} ${req.path} not found` });
});

export default app;
