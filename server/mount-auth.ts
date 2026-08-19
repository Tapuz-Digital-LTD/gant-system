import { toNodeHandler, fromNodeHeaders } from 'better-auth/node';
import type { Request, RequestHandler } from 'express';
import { getAuth, describeAuth } from './auth.js';
import { getDb } from './db/client.js';
import { loadActor, type Actor } from './access.js';

/** Better Auth owns /api/auth/*; everything else only reads the resulting session. */
export function authHandler(): RequestHandler {
  return toNodeHandler(getAuth());
}

export function describeAuthHandler(): RequestHandler {
  return (_req, res) => {
    res.json({ data: describeAuth() });
  };
}

/**
 * Session cookie → Actor. Returns null rather than throwing, so public routes
 * (health, auth, the sign-in page) keep working for signed-out visitors.
 */
export async function resolveActorFromSession(req: Request): Promise<Actor | null> {
  try {
    const session = await getAuth().api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session?.user?.id) return null;
    return await loadActor(getDb(), session.user.id);
  } catch (err) {
    console.error(JSON.stringify({ level: 'warn', msg: 'session_resolve_failed', error: String(err) }));
    return null;
  }
}
