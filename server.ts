import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

import { boardsRouter } from './server/routes/boards.js';
import { eventsRouter } from './server/routes/events.js';
import { tasksRouter } from './server/routes/tasks.js';
import { usersRouter } from './server/routes/users.js';
import { exportRouter } from './server/routes/export.js';
import { aiRouter } from './server/routes/ai.js';

// Load environment variables
dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // API Health Endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'XTRA Gantt & Task Management Server',
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || 'development'
    });
  });

  // Mount API Routers
  app.use('/api/boards', boardsRouter);
  app.use('/api/boards/:boardId/events', eventsRouter);
  app.use('/api/boards/:boardId/events/:eventId/tasks', tasksRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/export', exportRouter);
  app.use('/api/ai', aiRouter);

  // Global API 404 handler for unmatched /api routes
  app.all('/api/*', (req, res) => {
    res.status(404).json({ success: false, message: `API route ${req.method} ${req.path} not found` });
  });

  // Vite middleware for development vs Static serving for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 XTRA Backend Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
