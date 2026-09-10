import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { getDb, type Database } from '../db/client.js';
import { createReportsRepo } from '../db/repo.js';
import { ForbiddenError, requireActor, requirePermission, type Actor } from '../access.js';
import * as v from '../validation.js';
import { chartKind, reportCell, reportDefinition, reportModel } from './model.js';
import { drillRows, runReport, type ReportScope } from './run.js';

/**
 * The reports API.
 *
 * Mounted inside the main API router, whose error middleware turns the errors
 * thrown here into the same contract every other route uses — a ZodError into
 * 400, `ForbiddenError` into 403, `NotFoundError` into 404. Nothing in this
 * file formats an error response of its own, so there is one place where that
 * shape is decided.
 *
 * The rule that closes the reporting equivalent of an IDOR: board scope is
 * resolved from the session with `visibleBoardIds`, on every single route. A
 * definition may name boards, but naming them can only ever narrow what the
 * session already allows — `runReport` ANDs the two.
 */

const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

const savedReportCreate = z.strictObject({
  name: z.string().trim().min(1, 'צריך שם לדוח').max(120),
  definition: reportDefinition,
  chart: chartKind.default('bar')
});

const savedReportUpdate = z.strictObject({
  name: z.string().trim().min(1, 'צריך שם לדוח').max(120).optional(),
  definition: reportDefinition.optional(),
  chart: chartKind.optional(),
  pinned: z.boolean().optional(),
  position: z.number().int().min(0).max(9999).optional()
});

const exportInput = z.strictObject({
  definition: reportDefinition,
  /** What the person called the report. Becomes the tab name and the filename. */
  name: z.string().trim().min(1).max(120).default('דוח')
});

const drillInput = z.strictObject({
  definition: reportDefinition,
  cell: reportCell
});

/** An ordered list of reports on somebody's screen, and how wide each one sits. */
const dashboardInput = z.strictObject({
  layout: z
    .array(
      z.strictObject({
        savedReportId: v.uuidParam,
        size: z.enum(['small', 'medium', 'large'])
      })
    )
    .max(50, 'לוח מחוונים עם יותר מ-50 דוחות הוא רשימה, לא מסך')
});

/** Board scope, always from the session and never from the body. */
async function scopeOf(req: Request, actor: Actor): Promise<ReportScope> {
  return { boardIds: await req.repo.visibleBoardIds(actor) };
}

/**
 * Whose report this is.
 *
 * A saved report is workspace-wide to read, and its owner's to change. An admin
 * — anybody who may edit the permission matrix itself — can also change it,
 * because otherwise a report somebody left behind is unfixable and undeletable
 * for good.
 */
async function assertMayChange(
  req: Request,
  actor: Actor,
  report: { ownerId: string | null }
): Promise<void> {
  if (report.ownerId === actor.id) return;
  if (actor.isOwner) return;
  if (await req.repo.can(actor.role, 'permissions.manage')) return;
  throw new ForbiddenError('אפשר לשנות או למחוק רק דוח שיצרת. בקש ממנהל');
}

/**
 * `getDatabase` is injectable for the same reason `createApiRouter`'s repository
 * is: the whole surface can then be driven over real HTTP against an in-process
 * Postgres, with no external database and no stubs pretending to be one.
 */
export function createReportsRouter(getDatabase: () => Database = getDb): Router {
  const reports = Router();
  const savedRepo = () => createReportsRepo(getDatabase());

  /**
   * The whole picker vocabulary. Cached privately: it changes on deploy, not on
   * data, and every screen that draws a report builder asks for it first.
   */
  reports.get('/model', asyncRoute(async (req, res) => {
    await requirePermission(req.repo, req.actor, 'activity.view', 'צפייה בדוחות');
    res.set('Cache-Control', 'private, max-age=3600');
    res.json({ data: reportModel() });
  }));

  reports.post('/run', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'activity.view', 'צפייה בדוחות');
    const definition = reportDefinition.parse(req.body);
    res.json({ data: await runReport(getDatabase(), definition, await scopeOf(req, actor)) });
  }));

  reports.post('/drill', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'activity.view', 'צפייה בדוחות');
    const { definition, cell } = drillInput.parse(req.body);
    res.json({ data: await drillRows(getDatabase(), definition, cell, await scopeOf(req, actor)) });
  }));

  /**
   * The same numbers, in a file.
   *
   * The definition is re-run rather than the rows being posted back up: an
   * export that trusts the browser's copy of the grid is an export somebody can
   * edit before downloading, and it would also drift from the board scope the
   * session allows. Same query, same filters, same grouping — the file cannot
   * disagree with the screen.
   */
  reports.post('/export', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'export.run', 'הורדה לאקסל');
    await requirePermission(req.repo, req.actor, 'activity.view', 'צפייה בדוחות');
    const { definition, name } = exportInput.parse(req.body);

    const result = await runReport(getDatabase(), definition, await scopeOf(req, actor));
    const { buildGridWorkbook } = await import('../export/xlsx.js');

    const dataset = definition.dataset === 'events' ? 'אירועים' : 'משימות';
    const range =
      definition.filters.from || definition.filters.to
        ? `${definition.filters.from ?? 'ההתחלה'} עד ${definition.filters.to ?? 'הסוף'}`
        : 'כל התקופות';

    const file = await buildGridWorkbook({
      sheetName: name,
      title: name,
      subtitle: `${dataset} · ${range}`,
      columns: result.columns,
      rows: result.rows,
      generatedBy: actor.name
    });

    const fileName = `${name} ${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    // Hebrew in a bare `filename=` is mangled by every browser; RFC 5987 is the
    // form that survives it.
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(file);
  }));

  // ---------------- saved reports ----------------

  reports.get('/saved', asyncRoute(async (req, res) => {
    await requirePermission(req.repo, req.actor, 'activity.view', 'צפייה בדוחות');
    res.json({ data: await savedRepo().listSavedReports() });
  }));

  reports.post('/saved', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'activity.view', 'שמירת דוחות');
    const input = savedReportCreate.parse(req.body);
    /*
     * Spelled out rather than spread. Zod marks a refined field optional in the
     * inferred type, and spreading that into a row would let a missing
     * definition through the compiler into a NOT NULL column.
     */
    const saved = await savedRepo().createSavedReport(
      { name: input.name, definition: input.definition, chart: input.chart },
      actor.id
    );
    res.status(201).json({ data: saved });
  }));

  reports.patch('/saved/:id', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'activity.view', 'שמירת דוחות');
    const repo = savedRepo();
    const id = v.uuidParam.parse(req.params.id);
    await assertMayChange(req, actor, await repo.getSavedReport(id));
    const changes = savedReportUpdate.parse(req.body);
    res.json({ data: await repo.updateSavedReport(id, changes, actor.id) });
  }));

  reports.delete('/saved/:id', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'activity.view', 'שמירת דוחות');
    const repo = savedRepo();
    const id = v.uuidParam.parse(req.params.id);
    await assertMayChange(req, actor, await repo.getSavedReport(id));
    await repo.deleteSavedReport(id, actor.id);
    res.status(204).end();
  }));

  /** Anyone who can save a report can copy one — the copy is theirs, not the original's. */
  reports.post('/saved/:id/duplicate', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'activity.view', 'שמירת דוחות');
    const id = v.uuidParam.parse(req.params.id);
    res.status(201).json({ data: await savedRepo().duplicateSavedReport(id, actor.id) });
  }));

  // ---------------- dashboard ----------------

  /** Your own, and only your own — there is no user id in the path. */
  reports.get('/dashboard', asyncRoute(async (req, res) => {
    const actor = await requirePermission(req.repo, req.actor, 'activity.view', 'צפייה בדוחות');
    res.json({ data: await savedRepo().getDashboard(actor.id) });
  }));

  reports.put('/dashboard', asyncRoute(async (req, res) => {
    const actor = requireActor(req.actor);
    await requirePermission(req.repo, actor, 'activity.view', 'שמירת דוחות');
    const { layout } = dashboardInput.parse(req.body);
    res.json({ data: await savedRepo().saveDashboard(actor.id, layout) });
  }));

  return reports;
}
