import { Router, type Request, type Response, type NextFunction } from 'express';
import { ZodError } from 'zod';
import { getDb, isDatabaseReady } from './db/client.js';
import { createRepo, ConflictError, ConflictExistsError, NotFoundError, type Repo } from './db/repo.js';
import * as v from './validation.js';
import { createAiRouter } from './ai.js';
import { PERMISSIONS, ROLE_LABELS, type Role } from './permissions.js';
import { holidaysBetween } from './holidays.js';
import {
  type Actor,
  ForbiddenError,
  HiddenError,
  UnauthenticatedError,
  assertBoardRead,
  assertBoardWrite,
  requireActor,
  requirePermission,
  requireOwnerSafe
} from './access.js';

/**
 * One router for the whole API.
 *
 * Two rules hold everywhere:
 *  · nothing reaches the database that did not come out of a Zod schema
 *  · no internal error text reaches the client — a code goes out, the detail goes to the log
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      repo: Repo;
      /** Resolved from the session cookie. Null when nobody is signed in. */
      actor: Actor | null;
    }
  }
}

const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

function id(value: string): string {
  return v.uuidParam.parse(value);
}

/**
 * `getRepo` is injectable so the whole surface can be exercised over real HTTP
 * against an in-process Postgres, with no external database.
 */
export function createApiRouter(
  getRepo?: () => Repo,
  resolveActor?: (req: Request) => Promise<Actor | null>
): Router {
  const api = Router();

  // Without a database the API says so plainly instead of pretending to work.
  api.use((req, res, next) => {
    if (req.path === '/health' || req.path.startsWith('/ai/')) return next();
    if (!getRepo && !isDatabaseReady()) {
      return res.status(503).json({
        error: { code: 'DATABASE_NOT_CONFIGURED', message: 'משהו לא עובד כרגע. נסה שוב בעוד רגע' }
      });
    }
    req.repo = getRepo ? getRepo() : createRepo(getDb());
    req.actor = null;
    next();
  });

  // Identity, then every handler decides what that identity may do.
  api.use((req, _res, next) => {
    if (!resolveActor) return next();
    resolveActor(req)
      .then((actor) => {
        req.actor = actor;
        next();
      })
      .catch(next);
  });

  // AI is optional and never gated on the database.
  api.use('/ai', createAiRouter());

  api.get('/health', (_req, res) => {
    res.json({ status: 'ok', database: isDatabaseReady(), timestamp: new Date().toISOString() });
  });

  // ---------------- boards ----------------

  api.get('/me', asyncRoute(async (req, res) => {
    if (!req.actor) return res.json({ data: null });
    res.json({
      data: {
        ...req.actor,
        permissions: await req.repo.effectivePermissions(req.actor)
      }
    });
  }));

  api.get('/boards', asyncRoute(async (req, res) => {
    const actor = requireActor(req.actor);
    res.json({ data: await req.repo.listBoards(await req.repo.visibleBoardIds(actor)) });
  }));

  api.post('/boards', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'board.create', 'יצירת בחר לוח');
    if (actor.isGuest) throw new ForbiddenError('אורח יכול לצפות בבחר לוח ששיתפו איתו, אבל לא ליצור לוח');
    const input = v.boardCreate.parse(req.body);
    res.status(201).json({ data: await req.repo.createBoard(input, actor.id) });
  }));

  api.patch('/boards/:id', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'board.edit', 'עריכת בחר לוח');
    const boardId = id(req.params.id);
    await assertBoardWrite(req.repo, actor, boardId);
    const input = v.boardUpdate.parse(req.body);
    res.json({ data: await req.repo.updateBoard(boardId, input, actor.id) });
  }));

  api.post('/boards/:id/duplicate', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'board.duplicate', 'שכפול בחר לוח');
    if (actor.isGuest) throw new ForbiddenError('אורח יכול לצפות בבחר לוח ששיתפו איתו, אבל לא לשכפל לוח');
    const boardId = id(req.params.id);
    await assertBoardRead(req.repo, actor, boardId);
    const { name } = v.boardDuplicate.parse(req.body ?? {});
    res.status(201).json({ data: await req.repo.duplicateBoard(boardId, name, actor.id) });
  }));

  api.delete('/boards/:id', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'board.delete', 'מחיקת בחר לוח');
    if (actor.isGuest) throw new ForbiddenError('אורח יכול לצפות בבחר לוח ששיתפו איתו, אבל לא למחוק לוח');
    const boardId = id(req.params.id);
    await assertBoardWrite(req.repo, actor, boardId);
    await req.repo.archiveBoard(boardId, actor.id);
    res.status(204).end();
  }));

  /**
   * The real Hebrew calendar for a window. Computed, cacheable, and identical
   * for everyone — so it needs only a session, not a board.
   */
  api.get('/holidays', asyncRoute(async (req, res) => {
    requireActor(req.actor);
    const { from, to } = v.timelineQuery.parse(req.query);
    res.set('Cache-Control', 'private, max-age=86400');
    res.json({ data: holidaysBetween(from, to) });
  }));

  // ---------------- events ----------------

  /** The windowed read. `from`/`to` are required — the client never asks for everything. */
  api.get('/boards/:id/events', asyncRoute(async (req, res) => {
    const actor = requireActor(req.actor);
    const boardId = id(req.params.id);
    await assertBoardRead(req.repo, actor, boardId);
    const { from, to } = v.timelineQuery.parse(req.query);
    res.json({ data: await req.repo.listEvents(boardId, from, to) });
  }));

  api.get('/boards/:id/search', asyncRoute(async (req, res) => {
    const actor = requireActor(req.actor);
    const boardId = id(req.params.id);
    await assertBoardRead(req.repo, actor, boardId);
    const { q } = v.searchQuery.parse(req.query);
    res.json({ data: await req.repo.searchBoard(boardId, q) });
  }));

  api.post('/boards/:id/events', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'event.create', 'צור אירועים');
    const boardId = id(req.params.id);
    await assertBoardWrite(req.repo, actor, boardId);
    const input = v.eventCreate.parse(req.body);
    res.status(201).json({ data: await req.repo.createEvent(boardId, input, actor.id) });
  }));

  api.get('/events/:id', asyncRoute(async (req, res) => {
    const actor = requireActor(req.actor);
    const eventId = id(req.params.id);
    await assertBoardRead(req.repo, actor, await req.repo.boardIdForEvent(eventId));
    res.json({ data: await req.repo.getEvent(eventId) });
  }));

  api.patch('/events/:id', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'event.edit', 'עריכת אירועים');
    const eventId = id(req.params.id);
    await assertBoardWrite(req.repo, actor, await req.repo.boardIdForEvent(eventId));
    const { version, ...changes } = v.eventUpdate.parse(req.body);
    res.json({ data: await req.repo.updateEvent(eventId, version, changes, actor.id) });
  }));

  api.delete('/events/:id', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'event.delete', 'מחיקת אירועים');
    const eventId = id(req.params.id);
    await assertBoardWrite(req.repo, actor, await req.repo.boardIdForEvent(eventId));
    await req.repo.archiveEvent(eventId, actor.id);
    res.status(204).end();
  }));

  api.get('/boards/:id/archive', asyncRoute(async (req, res) => {
    const actor = requireActor(req.actor);
    const boardId = id(req.params.id);
    await assertBoardRead(req.repo, actor, boardId);
    res.json({ data: await req.repo.listArchivedEvents(boardId) });
  }));

  api.post('/events/:id/restore', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'event.restore', 'שחזור מהארכיון');
    const eventId = id(req.params.id);
    await assertBoardWrite(req.repo, actor, await req.repo.boardIdForEvent(eventId));
    res.json({ data: await req.repo.restoreEvent(eventId, actor.id) });
  }));

  // ---------------- tasks ----------------

  api.post('/events/:id/tasks', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'task.create', 'הוספת משימות');
    const eventId = id(req.params.id);
    await assertBoardWrite(req.repo, actor, await req.repo.boardIdForEvent(eventId));
    const input = v.taskCreate.parse(req.body);
    res.status(201).json({ data: await req.repo.createTask(eventId, input, actor.id) });
  }));

  api.patch('/tasks/:id', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'task.edit', 'עריכת משימות');
    const taskId = id(req.params.id);
    await assertBoardWrite(req.repo, actor, await req.repo.boardIdForTask(taskId));
    const { version, ...changes } = v.taskUpdate.parse(req.body);
    res.json({ data: await req.repo.updateTask(taskId, version, changes, actor.id) });
  }));

  api.delete('/tasks/:id', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'task.delete', 'מחיקת משימות');
    const taskId = id(req.params.id);
    await assertBoardWrite(req.repo, actor, await req.repo.boardIdForTask(taskId));
    await req.repo.deleteTask(taskId, actor.id);
    res.status(204).end();
  }));

  // ---------------- comments ----------------

  api.get('/events/:id/comments', asyncRoute(async (req, res) => {
    const actor = requireActor(req.actor);
    const eventId = id(req.params.id);
    await assertBoardRead(req.repo, actor, await req.repo.boardIdForEvent(eventId));
    res.json({ data: await req.repo.listComments(eventId) });
  }));

  api.post('/events/:id/comments', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'comment.create', 'כתיבת תגובות');
    const eventId = id(req.params.id);
    await assertBoardWrite(req.repo, actor, await req.repo.boardIdForEvent(eventId));
    const input = v.commentCreate.parse(req.body);
    res.status(201).json({ data: await req.repo.createComment(eventId, input, actor.id) });
  }));

  // ---------------- users & activity ----------------

  api.get('/users', asyncRoute(async (req, res) => {
    requireActor(req.actor);
    res.json({ data: await req.repo.listUsers() });
  }));

  /** The management view: who exists, and which boards each guest can reach. */
  api.get('/people', asyncRoute(async (req, res) => {
    await requirePermission(req.repo, req.actor, 'people.manage', 'ניהול אנשים');
    res.json({ data: await req.repo.listPeople() });
  }));

  api.post('/people', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'people.manage', 'ניהול אנשים');
    const input = v.personCreate.parse(req.body);
    res.status(201).json({ data: await req.repo.addPerson(input, actor.id) });
  }));

  api.patch('/people/:id', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'people.manage', 'ניהול אנשים');
    const userId = id(req.params.id);
    const input = v.personUpdate.parse(req.body);

    // The owner's role is fixed. Everything else can lock a workspace out.
    if (input.role) requireOwnerSafe(actor, await req.repo.isOwner(userId), 'לשנות את התפקיד של');

    if (input.role && input.role !== 'admin' && userId === actor.id) {
      if ((await req.repo.countAdmins()) <= 1) {
        throw new ForbiddenError('צריך להשאיר לפחות מנהל אחד');
      }
    }

    res.json({ data: await req.repo.updatePerson(userId, input, actor.id) });
  }));

  api.delete('/people/:id', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'people.manage', 'ניהול אנשים');
    const userId = id(req.params.id);
    requireOwnerSafe(actor, await req.repo.isOwner(userId), 'להסיר');
    if (userId === actor.id) throw new ForbiddenError('אי אפשר להסיר את הגישה של עצמך');
    await req.repo.removePerson(userId, actor.id);
    res.status(204).end();
  }));

  // ---------------- permissions ----------------

  api.get('/permissions', asyncRoute(async (req, res) => {
    await requirePermission(req.repo, req.actor, 'permissions.manage', 'צפייה בלבד בהרשאות');
    res.json({
      data: {
        catalog: PERMISSIONS,
        roles: (['admin', 'editor', 'viewer'] as Role[]).map((r) => ({ key: r, label: ROLE_LABELS[r] })),
        matrix: await req.repo.listPermissions()
      }
    });
  }));

  api.patch('/permissions', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'permissions.manage', 'שינוי הרשאות');
    const input = v.permissionUpdate.parse(req.body);

    // Without this, one unticked box could remove the ability to tick it back.
    if (input.role === 'admin' && input.permission === 'permissions.manage' && !input.allowed && !actor.isOwner) {
      throw new ForbiddenError('אי אפשר לבטל למנהלים את ההרשאה לנהל הרשאות');
    }

    await req.repo.setPermission(input.role, input.permission, input.allowed, actor.id);
    res.json({ data: await req.repo.listPermissions() });
  }));

  /** Guest access to one board. Staff never need a row here. */
  api.post('/boards/:id/members', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'people.manage', 'ניהול אנשים');
    const boardId = id(req.params.id);
    await assertBoardWrite(req.repo, actor, boardId);
    const input = v.boardGrant.parse(req.body);
    await req.repo.grantBoardAccess(boardId, input.userId, input.role);
    res.status(204).end();
  }));

  api.delete('/boards/:id/members/:userId', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'people.manage', 'ניהול אנשים');
    const boardId = id(req.params.id);
    await assertBoardWrite(req.repo, actor, boardId);
    await req.repo.revokeBoardAccess(boardId, id(req.params.userId));
    res.status(204).end();
  }));

  api.get('/events/:id/activity', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'activity.view', 'צפייה בלבד ביומן');
    const eventId = id(req.params.id);
    await assertBoardRead(req.repo, actor, await req.repo.boardIdForEvent(eventId));
    res.json({ data: await req.repo.listActivity('event', eventId) });
  }));

  api.all('*', (req, res) => {
    res.status(404).json({
      error: { code: 'ROUTE_NOT_FOUND', message: `לא מצאנו את מה שביקשת` }
    });
  });

  // ---------------- errors ----------------

  api.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'יש שדה שצריך לתקן',
          details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
        }
      });
    }

    if (err instanceof UnauthenticatedError) {
      return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: err.message } });
    }

    if (err instanceof ForbiddenError) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: err.message } });
    }

    // A board a guest was never invited to is reported as absent, so its
    // existence is not leaked by the difference between 403 and 404.
    if (err instanceof HiddenError) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: err.message } });
    }

    if (err instanceof NotFoundError) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: err.message } });
    }

    if (err instanceof ConflictExistsError) {
      return res.status(409).json({ error: { code: 'ALREADY_EXISTS', message: err.message } });
    }

    if (err instanceof ConflictError) {
      return res.status(409).json({
        error: {
          code: 'STALE_VERSION',
          message: err.message,
          currentVersion: err.current
        }
      });
    }

    // Anything unrecognised: log the detail, return a code. No stack, no file paths.
    console.error(JSON.stringify({
      level: 'error',
      msg: 'unhandled_api_error',
      method: req.method,
      path: req.path,
      error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err)
    }));

    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'משהו השתבש. נסה שוב' } });
  });

  return api;
}
