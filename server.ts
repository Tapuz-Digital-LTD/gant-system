import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { createApiRouter } from './server/api.js';
import { initDb } from './server/db/client.js';
import { authHandler, describeAuthHandler, resolveActorFromSession } from './server/mount-auth.js';

dotenv.config({ path: ['.env.local', '.env'] });

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT ?? 3000);

  await initDb();

  // Better Auth reads the raw body itself, so it must mount before express.json.
  app.all('/api/auth/*', authHandler());
  app.get('/api/auth-config', describeAuthHandler());

  app.use(express.json({ limit: '1mb' }));
  app.use('/api', createApiRouter(undefined, resolveActorFromSession));

  if (process.env.NODE_ENV === 'production') {
    const dist = path.join(process.cwd(), 'dist');
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    const db = process.env.DATABASE_URL ? 'Postgres מרוחק' : 'PGlite מקומי (.data/pg)';
    console.log(`▲ http://localhost:${port}  ·  בסיס נתונים: ${db}`);
  });
}

startServer().catch((err) => {
  console.error('failed to start:', err);
  process.exit(1);
});
