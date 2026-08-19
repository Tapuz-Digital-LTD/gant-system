import express from 'express';
import { createApiRouter } from '../server/api.js';
import { initDb } from '../server/db/client.js';
import { authHandler, describeAuthHandler, resolveActorFromSession } from '../server/mount-auth.js';

// Vercel serves dist/ statically; this function only handles /api/*.
const app = express();


// One init per warm instance; requests queue behind it on a cold start.
const ready = initDb().catch((err) => {
  console.error(JSON.stringify({ level: 'fatal', msg: 'db_init_failed', error: String(err) }));
});

app.use(async (_req, _res, next) => {
  await ready;
  next();
});

// Better Auth reads the raw body itself, so it must mount before express.json.
app.all('/api/auth/*', authHandler());
app.get('/api/auth-config', describeAuthHandler());

app.use(express.json({ limit: '1mb' }));
app.use('/api', createApiRouter(undefined, resolveActorFromSession));

export default app;
