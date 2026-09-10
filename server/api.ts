import { Router, type Request, type Response, type NextFunction } from 'express';
import { ZodError } from 'zod';
import { getDb, isDatabaseReady } from './db/client.js';
import { createRepo, ConflictError, ConflictExistsError, NotFoundError, type Repo } from './db/repo.js';
import * as v from './validation.js';
import { createAiRouter } from './ai.js';
import { PERMISSIONS, ROLE_LABELS, type Role } from './permissions.js';
import { holidaysBetween } from './holidays.js';
import { codeForScreen } from './email.js';
import { digestFor, digestText, hasAnything } from './notifications/digest.js';
import { cronAuthorised, cronConfigured, runDigestJob } from './notifications/cron.js';
import { deliveryMode } from './notifications/inforu.js';
import { israeliMobile } from './notifications/inforu.js';
import { israelNow } from './notifications/prefs.js';
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

/** True until this warm instance has answered something. */
let firstRequest = true;

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
    /*
     * `/ai` used to be exempt here, on the grounds that suggestions are
     * optional and should not need a database. That stopped being true the day
     * the endpoint started checking who is asking and what they have already
     * spent — and because the exemption skipped this middleware entirely,
     * `req.repo` was never attached and the route threw on every call.
     */
    /*
     * Attach what we can, and only refuse where it matters.
     *
     * `/health` used to skip this middleware entirely, which meant it had no
     * repository — so the database timing it was added to report could never
     * work, and said "null" instead of saying why. Skipping a middleware is a
     * blunt way to express "this route tolerates a missing database"; the route
     * itself can say that, and still use the repository when there is one.
     */
    const ready = Boolean(getRepo) || isDatabaseReady();
    if (ready) req.repo = getRepo ? getRepo() : createRepo(getDb());
    req.actor = null;

    if (!ready && req.path !== '/health') {
      return res.status(503).json({
        error: { code: 'DATABASE_NOT_CONFIGURED', message: 'משהו לא עובד כרגע. נסה שוב בעוד רגע' }
      });
    }
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

  api.use('/ai', createAiRouter());

  /*
   * Health, and enough to answer "why is it slow" without guessing.
   *
   * The three numbers that decide perceived speed on serverless are: where the
   * function is, how far the database is from there, and whether this instance
   * had to start up. All three are invisible from the outside and each can cost
   * more than every query on the page put together.
   */
  api.get('/health', asyncRoute(async (req, res) => {
    const startedAt = Date.now();
    let dbMs: number | null = null;
    /** Whether the ping failed. Why it failed is in the log. */
    let dbError = false;
    try {
      const t0 = Date.now();
      await req.repo?.ping();
      dbMs = req.repo ? Date.now() - t0 : null;
    } catch (err) {
      /*
       * The detail goes to the log, never to the caller.
       *
       * /health is public and unauthenticated. A database error message can
       * carry a host, a role name or a query, and this file's whole contract is
       * that a code goes out and the detail goes to the log. Naming the failure
       * was right; publishing it was not.
       */
      console.error(JSON.stringify({ level: 'error', msg: 'health_db_ping_failed', error: String(err) }));
      dbError = true;
    }

    res.json({
      status: 'ok',
      database: isDatabaseReady(),
      region: process.env.VERCEL_REGION ?? 'local',
      dbRoundTripMs: dbMs,
      dbError,
      coldStart: firstRequest,
      handlerMs: Date.now() - startedAt,
      timestamp: new Date().toISOString()
    });
    firstRequest = false;
  }));

  // ---------------- boards ----------------

  /**
   * The code that was just generated, where it may be shown.
   *
   * Refuses in production regardless of anything else, and refuses whenever a
   * message actually went out — a code on screen for a code that was also
   * texted is a second copy of a secret, for nothing.
   *
   * It exists so the whole sign-in flow can be walked on a laptop without a
   * real phone, which is what stops somebody testing a button by messaging a
   * colleague.
   */
  api.get('/dev/sign-in-code', asyncRoute(async (req, res) => {
    const to = String(req.query.to ?? '');
    const code = to ? codeForScreen(to) : null;
    if (!code) {
      res.status(404).json({ error: { code: 'NOT_AVAILABLE', message: 'לא זמין' } });
      return;
    }
    res.json({ data: { code } });
  }));

  api.get('/me', asyncRoute(async (req, res) => {
    if (!req.actor) return res.json({ data: null });
    const permissions = await req.repo.effectivePermissions(req.actor);
    res.json({ data: { ...req.actor, permissions } });
  }));

  /**
   * Your own number, and only your own — there is no user id in the path.
   *
   * Rejected rather than guessed at: a number stored wrong sends somebody
   * else's work to a stranger, and the person who typed it would never find
   * out why nothing arrives.
   */
  api.put('/my/phone', asyncRoute(async (req, res) => {
    const actor = requireActor(req.actor);
    const { phone } = v.phoneInput.parse(req.body);

    if (phone === null || phone === '') {
      res.json({ data: await req.repo.saveOwnPhone(actor.id, null) });
      return;
    }

    const normalised = israeliMobile(phone);
    if (!normalised) {
      res.status(400).json({
        error: { code: 'INVALID_PHONE', message: 'מספר הנייד לא נראה תקין. לדוגמה: 050-1234567' }
      });
      return;
    }
    res.json({ data: await req.repo.saveOwnPhone(actor.id, normalised) });
  }));

  api.get('/boards', asyncRoute(async (req, res) => {
    const actor = requireActor(req.actor);
    // `?archived=1` is the finished shelf. Same permissions, same scoping —
    // an archived project is one somebody could already see, not a new secret.
    const archived = req.query.archived === '1';
    res.json({ data: await req.repo.listBoards(await req.repo.visibleBoardIds(actor), archived) });
  }));

  api.post('/boards', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'board.create', 'יצירת לוח');
    if (actor.isGuest) throw new ForbiddenError('אורח יכול לצפות בלוח ששיתפו איתו, אבל לא ליצור לוח');
    const input = v.boardCreate.parse(req.body);
    res.status(201).json({ data: await req.repo.createBoard(input, actor.id) });
  }));

  api.patch('/boards/:id', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'board.edit', 'עריכת לוח');
    const boardId = id(req.params.id);
    await assertBoardWrite(req.repo, actor, boardId);
    const input = v.boardUpdate.parse(req.body);
    res.json({ data: await req.repo.updateBoard(boardId, input, actor.id) });
  }));

  api.post('/boards/:id/duplicate', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'board.duplicate', 'שכפול לוח');
    if (actor.isGuest) throw new ForbiddenError('אורח יכול לצפות בלוח ששיתפו איתו, אבל לא לשכפל לוח');
    const boardId = id(req.params.id);
    await assertBoardRead(req.repo, actor, boardId);
    const { name } = v.boardDuplicate.parse(req.body ?? {});
    res.status(201).json({ data: await req.repo.duplicateBoard(boardId, name, actor.id) });
  }));

  api.delete('/boards/:id', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'board.delete', 'מחיקת לוח');
    if (actor.isGuest) throw new ForbiddenError('אורח יכול לצפות בלוח ששיתפו איתו, אבל לא למחוק לוח');
    const boardId = id(req.params.id);
    await assertBoardWrite(req.repo, actor, boardId);
    await req.repo.archiveBoard(boardId, actor.id);
    res.status(204).end();
  }));

  /**
   * Back to work.
   *
   * Restoring is the same right as archiving — somebody who can finish a
   * project can un-finish it, and making that a separate permission only
   * produces people who can put work away and not get it back.
   */
  api.post('/boards/:id/restore', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'board.delete', 'החזרת לוח מהארכיון');
    const boardId = id(req.params.id);
    await assertBoardWrite(req.repo, actor, boardId);
    res.json({ data: await req.repo.restoreBoard(boardId, actor.id) });
  }));

  /**
   * Gone for good, and only from the archive.
   *
   * Its own permission, not `board.delete`: that one means "finish a project"
   * and is reversible. This one is not, and everything under the board goes
   * with it. An archive anyone can empty is not an archive.
   */
  api.delete('/boards/:id/permanent', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'board.purge', 'מחיקת לוח לצמיתות');
    const boardId = id(req.params.id);
    await assertBoardWrite(req.repo, actor, boardId);
    res.json({ data: await req.repo.purgeBoard(boardId, actor.id) });
  }));

  /**
   * The real Hebrew calendar for a window. Computed, cacheable, and identical
   * for everyone — so it needs only a session, not a board.
   */
  api.get('/holidays', asyncRoute(async (req, res) => {
    requireActor(req.actor);
    const { from, to } = v.timelineQuery.parse(req.query);
    res.set('Cache-Control', 'private, max-age=86400');
    res.json({ data: await holidaysBetween(from, to) });
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

  /**
   * The one irreversible route in the API. Its own capability, off for editors
   * by default, and it refuses anything that is not already in the archive.
   */
  api.delete('/events/:id/permanent', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'event.purge', 'מחיקה סופית');
    const eventId = id(req.params.id);
    await assertBoardWrite(req.repo, actor, await req.repo.boardIdForEvent(eventId));
    res.json({ data: await req.repo.purgeEvent(eventId, actor.id) });
  }));

  api.post('/events/:id/restore', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'event.restore', 'שחזור מהארכיון');
    const eventId = id(req.params.id);
    await assertBoardWrite(req.repo, actor, await req.repo.boardIdForEvent(eventId));
    res.json({ data: await req.repo.restoreEvent(eventId, actor.id) });
  }));

  /**
   * The signed-in person's own work. No id in the path: you can only ask for
   * yours, so there is no parameter for anyone to tamper with.
   */
  api.get('/my/tasks', asyncRoute(async (req, res) => {
    const actor = requireActor(req.actor);
    const boardIds = await req.repo.visibleBoardIds(actor);
    res.json({ data: await req.repo.listTasksForAssignee(actor.id, boardIds) });
  }));

  // ---------------- notification settings ----------------

  api.get('/my/notification-prefs', asyncRoute(async (req, res) => {
    const actor = requireActor(req.actor);
    res.json({ data: await req.repo.notificationPrefsFor(actor.id) });
  }));

  api.put('/my/notification-prefs', asyncRoute(async (req, res) => {
    const actor = requireActor(req.actor);
    const input = v.notificationPrefsInput.parse(req.body);

    // Reaching past your own work is a permission, not a preference. Somebody
    // who cannot see the activity log does not get a digest about other people
    // by ticking a box.
    if (input.managerScope && input.managerScope !== 'none') {
      const allowed = actor.isOwner || (await req.repo.can(actor.role, 'activity.view'));
      if (!allowed) throw new ForbiddenError('רק מי שמורשה לראות נתוני צוות יכול לקבל סיכום על אחרים');
    }

    res.json({ data: await req.repo.saveNotificationPrefs(actor.id, input) });
  }));

  /**
   * What today's digest would say, for this person, right now.
   *
   * The whole point of it is that nothing has to be switched on to find out.
   * It reads; it never writes and never sends.
   */
  api.get('/my/digest-preview', asyncRoute(async (req, res) => {
    const actor = requireActor(req.actor);
    const prefs = await req.repo.notificationPrefsFor(actor.id);
    const digest = await digestFor(req.repo, actor, prefs);
    res.json({
      data: {
        date: israelNow().date,
        hasAnything: hasAnything(digest),
        sections: digest.sections,
        team: digest.team,
        text: digestText(digest, `בוקר טוב ${actor.name} — מה דורש טיפול היום`),
        /*
         * What would actually happen, rather than what a hardcoded sentence
         * says would happen. The screen used to carry a fixed warning that mail
         * "is not connected yet", which stayed on the screen after it was — a
         * settings page that describes a state nobody has checked since it was
         * written is worse than no warning at all.
         */
        delivery: deliveryMode('notification')
      }
    });
  }));

  api.get('/settings/notification-defaults', asyncRoute(async (req, res) => {
    await requirePermission(req.repo, req.actor, 'permissions.manage', 'הגדרות התראות');
    res.json({ data: await req.repo.workspaceNotificationDefaults() });
  }));

  api.put('/settings/notification-defaults', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'permissions.manage', 'הגדרות התראות');
    const input = v.notificationPrefsInput.parse(req.body);
    res.json({ data: await req.repo.saveWorkspaceNotificationDefaults(input, actor.id) });
  }));

  /*
   * The scheduler's own door.
   *
   * No session, so it is guarded by a shared secret instead — and with no
   * secret configured it refuses outright rather than running open. It writes
   * nothing and sends nothing today: every digest goes to the log, to be read
   * for a week before anybody's phone is involved.
   */
  api.all('/cron/digest', asyncRoute(async (req, res) => {
    if (!cronConfigured()) {
      res.status(503).json({ error: { code: 'CRON_NOT_CONFIGURED', message: 'CRON_SECRET לא מוגדר' } });
      return;
    }
    if (!cronAuthorised(req.get('authorization'))) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'לא מורשה' } });
      return;
    }

    const run = await runDigestJob(req.repo);
    console.log(JSON.stringify({ level: 'info', msg: 'digest_run', ...run, outcomes: undefined }));

    // The bodies stay in the log; the response is a receipt, not a mailbox.
    res.json({
      data: {
        at: run.at,
        mode: run.mode,
        considered: run.considered,
        due: run.due,
        logged: run.logged,
        sent: run.sent,
        toBell: run.toBell
      }
    });
  }));

  // ---------------- notifications ----------------

  /**
   * Always the caller's own. There is no user id in any of these paths, so
   * there is nothing for anyone to change to somebody else's.
   */
  api.get('/notifications', asyncRoute(async (req, res) => {
    const actor = requireActor(req.actor);
    res.json({ data: await req.repo.listNotifications(actor.id) });
  }));

  api.post('/notifications/read', asyncRoute(async (req, res) => {
    const actor = requireActor(req.actor);
    const input = v.notificationRead.parse(req.body ?? {});
    await req.repo.markNotificationsRead(actor.id, input.id ?? undefined);
    res.status(204).end();
  }));

  api.delete('/notifications/:id', asyncRoute(async (req, res) => {
    const actor = requireActor(req.actor);
    await req.repo.deleteNotification(actor.id, id(req.params.id));
    res.status(204).end();
  }));

  // ---------------- tasks ----------------

  /** Every task in a project — the "what does the team owe" view. */
  api.get('/boards/:id/tasks', asyncRoute(async (req, res) => {
    const actor = requireActor(req.actor);
    const boardId = id(req.params.id);
    await assertBoardRead(req.repo, actor, boardId);
    res.json({ data: await req.repo.tasksForBoard(boardId) });
  }));

  /** One task, with its history. */
  api.get('/tasks/:id', asyncRoute(async (req, res) => {
    const actor = requireActor(req.actor);
    const taskId = id(req.params.id);
    await assertBoardRead(req.repo, actor, await req.repo.boardIdForTask(taskId));
    res.json({ data: await req.repo.taskDetail(taskId) });
  }));

  api.post('/events/:id/tasks', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'task.create', 'הוספת משימות');
    const eventId = id(req.params.id);
    await assertBoardWrite(req.repo, actor, await req.repo.boardIdForEvent(eventId));
    const input = v.taskCreate.parse(req.body);
    res.status(201).json({ data: await req.repo.createTask(eventId, input, actor.id) });
  }));

  /* ----------------------------- what hangs off a task ---------------------
     All of these gate on the task's board, so a person who may write there may
     write here — the board is where permission lives, not the task. */

  api.get('/tasks/:id/checklist', asyncRoute(async (req, res) => {
    const actor = requireActor(req.actor);
    const taskId = id(req.params.id);
    await assertBoardRead(req.repo, actor, await req.repo.boardIdForTask(taskId));
    res.json({ data: await req.repo.listChecklist(taskId) });
  }));

  api.post('/tasks/:id/checklist', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'task.edit', 'עריכת משימות');
    const taskId = id(req.params.id);
    await assertBoardWrite(req.repo, actor, await req.repo.boardIdForTask(taskId));
    const input = v.checklistCreate.parse(req.body);
    res.status(201).json({ data: await req.repo.addChecklistItem(taskId, input.text) });
  }));

  api.patch('/tasks/:taskId/checklist/:id', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'task.edit', 'עריכת משימות');
    await assertBoardWrite(req.repo, actor, await req.repo.boardIdForTask(id(req.params.taskId)));
    const input = v.checklistUpdate.parse(req.body);
    res.json({ data: await req.repo.setChecklistItem(id(req.params.id), input) });
  }));

  api.delete('/tasks/:taskId/checklist/:id', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'task.edit', 'עריכת משימות');
    await assertBoardWrite(req.repo, actor, await req.repo.boardIdForTask(id(req.params.taskId)));
    await req.repo.deleteChecklistItem(id(req.params.id));
    res.status(204).end();
  }));

  api.get('/tasks/:id/attachments', asyncRoute(async (req, res) => {
    const actor = requireActor(req.actor);
    const taskId = id(req.params.id);
    await assertBoardRead(req.repo, actor, await req.repo.boardIdForTask(taskId));
    res.json({ data: await req.repo.listAttachments(taskId) });
  }));

  api.post('/tasks/:id/attachments', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'task.edit', 'עריכת משימות');
    const taskId = id(req.params.id);
    await assertBoardWrite(req.repo, actor, await req.repo.boardIdForTask(taskId));
    const input = v.attachmentCreate.parse(req.body);
    res.status(201).json({ data: await req.repo.addAttachment(taskId, input, actor.id) });
  }));

  api.delete('/tasks/:taskId/attachments/:id', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'task.edit', 'עריכת משימות');
    await assertBoardWrite(req.repo, actor, await req.repo.boardIdForTask(id(req.params.taskId)));
    await req.repo.deleteAttachment(id(req.params.id), actor.id);
    res.status(204).end();
  }));

  api.get('/tasks/:id/comments', asyncRoute(async (req, res) => {
    const actor = requireActor(req.actor);
    const taskId = id(req.params.id);
    await assertBoardRead(req.repo, actor, await req.repo.boardIdForTask(taskId));
    res.json({ data: await req.repo.listTaskComments(taskId) });
  }));

  api.post('/tasks/:id/comments', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'comment.create', 'כתיבת תגובות');
    const taskId = id(req.params.id);
    await assertBoardWrite(req.repo, actor, await req.repo.boardIdForTask(taskId));
    const input = v.commentCreate.parse(req.body);
    res.status(201).json({ data: await req.repo.addTaskComment(taskId, input.body, actor.id) });
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
