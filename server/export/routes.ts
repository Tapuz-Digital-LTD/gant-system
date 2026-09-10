/**
 * The download endpoint.
 *
 * Mounted inside the main API router, like the assistant and the reports, so
 * the repository, the session and the error contract are already attached and
 * nothing here formats an error response of its own:
 *
 *   api.use('/export', createExportRouter());   // → POST /api/export/xlsx
 *
 * The rule this file exists to keep is the one in server/access.ts: **scope
 * comes from the session, never from the body.** A body may narrow what is
 * exported and can never widen it — a guest who asks for `all` gets the boards
 * they were invited to, and a board id they were never invited to is reported
 * as absent rather than refused.
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { assertBoardRead, requirePermission } from '../access.js';
import { israelNow } from '../notifications/prefs.js';
import { timelineQuery } from '../validation.js';
import { buildWorkbook, type ExportData, type ExportScope } from './xlsx.js';

const uuid = z.string().uuid('משהו בפרטים לא הסתדר. רענן את הדף ונסה שוב');

/**
 * The calendar's own date rule, borrowed rather than re-written: it refuses
 * 31.09.2027 as well as 2026-13-01. An unreal date that reaches a `where`
 * clause is an error the database raises, and a database error is not something
 * a person can read or act on.
 */
const isoDate = timelineQuery.shape.from;

const exportRequest = z.strictObject({
  scope: z.enum(['board', 'boards', 'events', 'tasks', 'all']),
  /** A narrowing, not a grant: every id here is still checked against the session. */
  boardIds: z.array(uuid).min(1).max(50).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  categories: z
    .array(z.enum(['holiday', 'campaign', 'b2b', 'social', 'operational', 'other']))
    .max(6)
    .optional(),
  statuses: z.array(z.enum(['todo', 'in_progress', 'ready_kickoff', 'done'])).max(4).optional(),
  assigneeIds: z.array(uuid).max(100).optional(),
  includeTasks: z.boolean().optional(),
  fileName: z.string().trim().max(80).optional()
});

type ExportRequest = z.infer<typeof exportRequest>;

/** Which sheets a scope asks for. `includeTasks` may add one; nothing removes one. */
const SHEETS: Record<ExportScope, ('boards' | 'events' | 'tasks')[]> = {
  board: ['boards', 'events'],
  boards: ['boards'],
  events: ['events'],
  tasks: ['tasks'],
  all: ['boards', 'events', 'tasks']
};

/**
 * A name Windows, macOS and a URL will all accept.
 *
 * Only the shape is fixed here — the Hebrew survives because the header is
 * written in the RFC 5987 form. A bare `filename=` is latin-1 by definition, so
 * a Hebrew name in one arrives as mojibake or gets the download rejected
 * outright.
 */
function fileNameFor(asked: string | undefined): string {
  const base = (asked ?? '').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').trim();
  return `${base || `תכנון-${israelNow().date}`}.xlsx`;
}

export function createExportRouter(): Router {
  const router = Router();

  /*
   * Wrapped, for the reason server/ai.ts spells out: Express 4 does not catch a
   * rejected promise from an async handler, so a throw would leave the request
   * hanging until the browser gave up rather than becoming a reply.
   */
  router.post('/xlsx', (req: Request, res: Response, next: NextFunction) => {
    exportXlsx(req, res).catch(next);
  });

  return router;
}

async function exportXlsx(req: Request, res: Response): Promise<void> {
  const actor = await requirePermission(req.repo, req.actor, 'export.run', 'הורדה לאקסל');
  const body: ExportRequest = exportRequest.parse(req.body ?? {});

  /*
   * The scope, decided twice over.
   *
   * `visibleBoardIds` is the session's answer and is null only for staff, who
   * see every board. `assertBoardRead` then runs per named id, so a guest
   * naming somebody else's board gets "לא מצאנו" — the same answer they would
   * get for a board that does not exist, because the existence of a board they
   * were not invited to is not information they are owed.
   */
  const visible = await req.repo.visibleBoardIds(actor);
  const named = body.boardIds ?? null;
  if (named) {
    for (const boardId of named) await assertBoardRead(req.repo, actor, boardId);
  }
  const boardRows = await req.repo.exportBoards(named ?? visible, named !== null);
  const boardIds = boardRows.map((b) => b.id);

  const wanted = new Set(SHEETS[body.scope]);
  if (body.includeTasks) wanted.add('tasks');

  const period = { from: body.from, to: body.to };
  const events = wanted.has('events')
    ? await req.repo.exportEvents(boardIds, {
        ...period,
        categories: body.categories,
        statuses: body.statuses
      })
    : [];
  const tasks = wanted.has('tasks')
    ? await req.repo.exportTasks(boardIds, {
        ...period,
        statuses: body.statuses,
        assigneeIds: body.assigneeIds
      })
    : [];
  const boards = wanted.has('boards')
    ? boardRows.map((b) => ({
        name: b.name,
        description: b.description,
        eventCount: b.eventCount,
        archived: b.archivedAt !== null,
        createdAt: b.createdAt
      }))
    : [];

  /*
   * Nothing matched, so say so instead of sending a file.
   *
   * A workbook with no sheets is a file Excel refuses to open, and a download
   * that fails to open reads as a broken system rather than as an empty filter.
   */
  if (boards.length === 0 && events.length === 0 && tasks.length === 0) {
    res.status(400).json({
      error: { code: 'NOTHING_TO_EXPORT', message: 'אין נתונים שמתאימים לסינון שבחרת' }
    });
    return;
  }

  const data: ExportData = {
    boards,
    events,
    tasks,
    meta: {
      scope: body.scope,
      boardNames: boardRows.map((b) => b.name),
      from: body.from ?? null,
      to: body.to ?? null,
      categories: body.categories ?? [],
      statuses: body.statuses ?? [],
      // Names rather than ids, because the file's description is read by a
      // person — and they come off the rows already fetched, so narrowing by
      // assignee costs no extra query.
      assignees: body.assigneeIds?.length
        ? [...new Set(tasks.map((t) => t.assigneeName).filter((n): n is string => Boolean(n)))]
        : [],
      generatedAt: new Date(),
      generatedBy: actor.name
    }
  };

  let file: Buffer;
  try {
    file = await buildWorkbook(data);
  } catch (err) {
    // The house contract: a code goes out, the detail goes to the log. What
    // exceljs throws can carry a path or a cell reference and is not an answer.
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'export_build_failed',
        scope: body.scope,
        boards: boardIds.length,
        events: events.length,
        tasks: tasks.length,
        error: String(err)
      })
    );
    res.status(500).json({
      error: { code: 'EXPORT_FAILED', message: 'לא הצלחנו להכין את הקובץ. נסה שוב' }
    });
    return;
  }

  const fileName = fileNameFor(body.fileName);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.setHeader('Content-Length', String(file.length));
  // The file holds exactly what one person was allowed to see. Nothing between
  // here and them should keep a copy for the next person.
  res.setHeader('Cache-Control', 'no-store');
  res.send(file);
}
