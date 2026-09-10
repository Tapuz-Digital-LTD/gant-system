import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import { israelNow } from '../notifications/prefs.js';
import { sendEmail } from '../notifications/inforu.js';
import { boards, boardMembers, events, tasks, checklistItems, taskAttachments, comments, users, activity, notifications, notificationPrefs, workspaceSettings, rolePermissions, aiUsage } from './schema.js';
import { DEFAULT_PREFS, readPrefs, type NotificationPrefs } from '../notifications/prefs.js';
import { MILESTONE_LABELS } from '../notifications/milestone-labels.js';
import { readChannels, type ChannelSwitches } from '../notifications/channels.js';
import { PERMISSIONS, DEFAULTS, type PermissionKey, type Role } from '../permissions.js';

/** Thrown when a write carries a stale `version`. Routes turn this into 409. */
/*
 * The day boundary is Israel's, not UTC's.
 *
 * A daily cap that rolls over at 2am local is a cap somebody hits twice in one
 * working day and then finds mysteriously reset in the middle of the next.
 */
const israelDay = () => israelNow().date;

/**
 * Where this deployment lives, for links inside emails.
 *
 * A relative path in an email is a dead link — there is no page it is relative
 * to. Falls back to the production address rather than to nothing, because a
 * link to the right place beats a link to nowhere.
 */
const appUrl = () => (process.env.APP_URL || 'https://xtra-gantt.vercel.app').replace(/\/+$/, '');

/** What an assignment email needs to know. Spelled out rather than inferred
 *  from the repository's own type, which would make `Repo` reference itself. */
interface TaskContext {
  taskTitle: string;
  eventTitle: string;
  eventId: string;
  eventDate: string;
  boardId: string;
  dueDate: string | null;
}

/**
 * Anything a person typed, made safe to put in HTML.
 *
 * Task titles, campaign names and people's names all reach this template, and
 * all three are free text. A task called `<img src=x onerror=…>` would
 * otherwise arrive as markup in somebody's inbox — mail clients strip most of
 * it, but "most" is not a security boundary, and a crafted title can still
 * forge a link that looks like ours.
 */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The assignment email. Plain, and about one thing. Exported so a test can read it. */
export function assignmentEmail(o: { name: string; task: string; event: string; due: string | null; link: string }) {
  return `<!doctype html>
<html lang="he" dir="rtl"><body style="margin:0;background:#faf8f7;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:480px;background:#fff;border-radius:12px;padding:28px;text-align:right">
        <tr><td>
          <p style="margin:0 0 4px;font-size:15px;color:#5c524e">שלום ${esc(o.name)},</p>
          <p style="margin:0 0 18px;font-size:15px;color:#5c524e">משימה חדשה נרשמה על שמך.</p>

          <p style="margin:0 0 6px;font-size:20px;font-weight:700;color:#2a2422">${esc(o.task)}</p>
          <p style="margin:0 0 4px;font-size:15px;color:#5c524e">${esc(o.event)}</p>
          ${o.due ? `<p style="margin:0 0 20px;font-size:15px;color:#5c524e">עד ${esc(o.due)}</p>` : '<div style="height:20px"></div>'}

          <a href="${esc(o.link)}"
             style="display:inline-block;background:#2f4bd0;color:#fff;text-decoration:none;
                    padding:11px 22px;border-radius:8px;font-size:15px;font-weight:700">
            פתיחת המשימה
          </a>

          <p style="margin:22px 0 0;font-size:12px;color:#8b807b">
            אפשר לשנות מה נשלח ומתי, במסך ההגדרות במערכת.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** The host of a URL, or null when it is not one. Used to name a bare link. */
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * What actually changed, in the words a person uses.
 *
 * The activity log stores whole rows either side of a change, which answers
 * every question and reads as none of them. Somebody opening a task wants
 * "שינה אחראי" and "העביר לבתהליך", not a diff of nineteen columns — so only
 * the fields worth narrating are compared, and anything else is silence rather
 * than noise.
 */
const TASK_FIELD_LABELS: Record<string, string> = {
  title: 'שם המשימה',
  description: 'התיאור',
  status: 'המצב',
  priority: 'העדיפות',
  assigneeId: 'האחראי',
  dueDate: 'תאריך היעד'
};

function describeTaskChange(before: unknown, after: unknown): string[] {
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return [];
  const a = before as Record<string, unknown>;
  const b = after as Record<string, unknown>;

  return Object.entries(TASK_FIELD_LABELS)
    .filter(([field]) => String(a[field] ?? '') !== String(b[field] ?? ''))
    .map(([, label]) => label);
}

export class ConflictError extends Error {
  constructor(public readonly current: number) {
    super('מישהו אחר שינה את זה בינתיים. רענן את הדף');
    this.name = 'ConflictError';
  }
}

/** A uniqueness clash the caller can fix, unlike a version conflict. */
export class ConflictExistsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictExistsError';
  }
}

export class NotFoundError extends Error {
  constructor(message = 'לא מצאנו את מה שחיפשת') {
    super(message);
    this.name = 'NotFoundError';
  }
}

type NewEvent = typeof events.$inferInsert;
type NewTask = typeof tasks.$inferInsert;

export function createRepo(db: Database) {
  /** Records who changed what. Never blocks the write it describes. */
  async function log(
    tx: Database,
    actorId: string | null,
    entity: string,
    entityId: string,
    action: string,
    before?: unknown,
    after?: unknown
  ) {
    await tx.insert(activity).values({
      actorId,
      entity,
      entityId,
      action,
      before: before ?? null,
      after: after ?? null
    });
  }

  return {
    // ---------------- boards ----------------

    /**
     * Join + group rather than a correlated subquery: inside a `sql` template
     * Drizzle emits bare column names, so `boards.id` would silently bind to the
     * inner table and every count would come back 0.
     */
    /** One round trip, doing nothing, to time the distance to the database. */
    async ping() {
      await db.execute(sql`select 1`);
    },

    async listBoards(onlyIds?: string[] | null, archived = false) {
      if (onlyIds !== null && onlyIds !== undefined && onlyIds.length === 0) return [];
      const state = archived ? isNotNull(boards.archivedAt) : isNull(boards.archivedAt);
      return db
        .select({
          id: boards.id,
          name: boards.name,
          description: boards.description,
          position: boards.position,
          archivedAt: boards.archivedAt,
          eventCount: sql<number>`count(${events.id})::int`
        })
        .from(boards)
        .leftJoin(events, and(eq(events.boardId, boards.id), isNull(events.archivedAt)))
        .where(onlyIds && onlyIds.length ? and(state, inArray(boards.id, onlyIds)) : state)
        .groupBy(boards.id)
        .orderBy(asc(boards.position), asc(boards.createdAt));
    },

    async createBoard(input: { name: string; description?: string }, actorId: string | null) {
      const [row] = await db
        .insert(boards)
        .values({ name: input.name, description: input.description ?? '', createdBy: actorId })
        .returning();
      await log(db, actorId, 'board', row.id, 'created', null, row);
      return row;
    },

    async updateBoard(
      id: string,
      input: { name?: string; description?: string; archived?: boolean },
      actorId: string | null
    ) {
      const [before] = await db.select().from(boards).where(eq(boards.id, id));
      if (!before) throw new NotFoundError('לא מצאנו את הלוח. רענן את הדף ונסה שוב');

      const [row] = await db
        .update(boards)
        .set({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.archived !== undefined && { archivedAt: input.archived ? new Date() : null }),
          updatedAt: new Date()
        })
        .where(eq(boards.id, id))
        .returning();

      await log(db, actorId, 'board', id, 'updated', before, row);
      return row;
    },

    /** Copies a board with its events. Tasks come along; history does not. */
    async duplicateBoard(sourceId: string, name: string | undefined, actorId: string | null) {
      const [source] = await db.select().from(boards).where(eq(boards.id, sourceId));
      if (!source) throw new NotFoundError('לא מצאנו את הלוח. רענן את הדף ונסה שוב');

      return db.transaction(async (tx) => {
        const [copy] = await tx
          .insert(boards)
          .values({
            name: name?.trim() || `${source.name} (עותק)`,
            description: source.description,
            createdBy: actorId
          })
          .returning();

        const sourceEvents = await tx
          .select()
          .from(events)
          .where(and(eq(events.boardId, sourceId), isNull(events.archivedAt)));

        for (const ev of sourceEvents) {
          const [newEvent] = await tx
            .insert(events)
            .values({
              boardId: copy.id,
              title: ev.title,
              category: ev.category,
              status: ev.status,
              actualDate: ev.actualDate,
              actualPrecision: ev.actualPrecision,
              prepMonths: ev.prepMonths,
              workStartDate: ev.workStartDate,
              reviewDate: ev.reviewDate,
              freezeDate: ev.freezeDate,
              kickoffDate: ev.kickoffDate,
              announceDate: ev.announceDate,
              campaignEndDate: ev.campaignEndDate,
              hebrewRule: ev.hebrewRule,
              note: ev.note,
              description: ev.description,
              createdBy: actorId
            })
            .returning();

          const sourceTasks = await tx.select().from(tasks).where(eq(tasks.eventId, ev.id));
          for (const t of sourceTasks) {
            await tx.insert(tasks).values({
              eventId: newEvent.id,
              title: t.title,
              description: t.description,
              status: t.status,
              priority: t.priority,
              assigneeId: t.assigneeId,
              startDate: t.startDate,
              endDate: t.endDate,
              dueDate: t.dueDate,
              position: t.position
            });
          }
        }

        await log(tx as unknown as Database, actorId, 'board', copy.id, 'duplicated', { from: sourceId }, null);
        return copy;
      });
    },

    /**
     * Finishing a project, not destroying one.
     *
     * Everything stays: the events, the tasks, the dates, the comments and the
     * trail. The board simply stops appearing in the places people look for
     * work, and stops asking for attention.
     *
     * Its outstanding notifications go with it. Leaving them means the bell
     * still points at a project nobody is working on — and, worse, that
     * restoring the board a month later dumps a month of stale news on
     * somebody all at once.
     */
    async archiveBoard(id: string, actorId: string | null) {
      const [row] = await db
        .update(boards)
        .set({ archivedAt: new Date() })
        .where(and(eq(boards.id, id), isNull(boards.archivedAt)))
        .returning();
      if (!row) throw new NotFoundError('לא מצאנו את הלוח. רענן את הדף ונסה שוב');

      await db.delete(notifications).where(
        sql`${notifications.link} like ${'/b/' + id + '/%'}`
      );

      await log(db, actorId, 'board', id, 'archived');
      return row;
    },

    /**
     * Back to work.
     *
     * Nothing is replayed. The reminders that matter are recomputed from the
     * dates tomorrow morning; the ones that were true a month ago are not news
     * and are not resurrected.
     */
    async restoreBoard(id: string, actorId: string | null) {
      const [row] = await db
        .update(boards)
        .set({ archivedAt: null })
        .where(and(eq(boards.id, id), isNotNull(boards.archivedAt)))
        .returning();
      if (!row) throw new NotFoundError('לא מצאנו את הלוח בארכיון. רענן את הדף ונסה שוב');
      await log(db, actorId, 'board', id, 'restored');
      return row;
    },

    /**
     * Gone for good.
     *
     * Only for a project opened by mistake. Everything under it goes — events,
     * tasks, comments — and the trail says who did it, which is the one record
     * that has to outlive the thing it describes.
     */
    async purgeBoard(id: string, actorId: string | null) {
      const [board] = await db.select().from(boards).where(eq(boards.id, id));
      if (!board) throw new NotFoundError('לא מצאנו את הלוח');
      if (!board.archivedAt) throw new ConflictExistsError('אפשר למחוק לצמיתות רק פרויקט שנמצא בארכיון');

      // Written before the rows go, so the record survives what it describes.
      await log(db, actorId, 'board', id, 'purged', board, null);
      await db.delete(boards).where(eq(boards.id, id));
      return { id };
    },

    // ---------------- events ----------------

    /**
     * The windowed read the whole product depends on: one board, one date range.
     *
     * An event belongs to the window when *anything about it* overlaps: the work
     * window, any milestone, or the campaign tail that runs past the event date.
     * Filtering on `actual_date` alone used to drop an event whose go-live day
     * was on screen but whose event date was not — it vanished with no message,
     * which reads as data loss rather than as a filter.
     *
     * LEAST and GREATEST ignore NULLs, so an unset milestone simply does not
     * widen the span.
     */
    async listEvents(boardId: string, from: string, to: string) {
      const spanStart = sql`least(
        coalesce(${events.workStartDate},
                 (${events.actualDate} - make_interval(months => ${events.prepMonths}))::date),
        ${events.reviewDate}, ${events.freezeDate},
        ${events.kickoffDate}, ${events.announceDate}
      )`;
      const spanEnd = sql`greatest(${events.actualDate}, ${events.campaignEndDate})`;

      const rows = await db
        .select()
        .from(events)
        .where(
          and(
            eq(events.boardId, boardId),
            isNull(events.archivedAt),
            lte(spanStart, to),
            gte(spanEnd, from)
          )
        )
        .orderBy(asc(events.actualDate));

      if (rows.length === 0) return [];

      const ids = rows.map((r) => r.id);
      const taskRows = await db
        .select()
        .from(tasks)
        .where(sql`${tasks.eventId} = any(${sql.raw(`array[${ids.map((i) => `'${i}'`).join(',')}]::uuid[]`)})`)
        .orderBy(asc(tasks.position));

      const byEvent = new Map<string, typeof taskRows>();
      for (const t of taskRows) {
        const list = byEvent.get(t.eventId) ?? [];
        list.push(t);
        byEvent.set(t.eventId, list);
      }

      return rows.map((e) => ({ ...e, tasks: byEvent.get(e.id) ?? [] }));
    },

    /**
     * Searches the whole board, not the visible window.
     * The old client-side filter could only match what was already loaded, so
     * an event three months away was invisible no matter what you typed.
     */
    async searchBoard(boardId: string, query: string, limit = 20) {
      const q = `%${query.trim().toLowerCase()}%`;

      const eventHits = await db
        .select({
          id: events.id,
          title: events.title,
          category: events.category,
          actualDate: events.actualDate,
          actualPrecision: events.actualPrecision,
          note: events.note,
          description: events.description
        })
        .from(events)
        .where(
          and(
            eq(events.boardId, boardId),
            isNull(events.archivedAt),
            sql`(lower(${events.title}) like ${q}
              or lower(coalesce(${events.note}, '')) like ${q}
              or lower(coalesce(${events.description}, '')) like ${q})`
          )
        )
        .orderBy(asc(events.actualDate))
        .limit(limit);

      const taskHits = await db
        .select({
          taskId: tasks.id,
          taskTitle: tasks.title,
          status: tasks.status,
          dueDate: tasks.dueDate,
          eventId: events.id,
          eventTitle: events.title,
          actualDate: events.actualDate
        })
        .from(tasks)
        .innerJoin(events, eq(tasks.eventId, events.id))
        .where(
          and(
            eq(events.boardId, boardId),
            isNull(events.archivedAt),
            sql`lower(${tasks.title}) like ${q}`
          )
        )
        .orderBy(asc(events.actualDate))
        .limit(limit);

      // Say *why* each row matched, so the reader is not left guessing.
      const needle = query.trim().toLowerCase();
      const events_ = eventHits.map((e) => ({
        kind: 'event' as const,
        eventId: e.id,
        title: e.title,
        actualDate: e.actualDate,
        actualPrecision: e.actualPrecision,
        matchedOn: e.title.toLowerCase().includes(needle)
          ? ('title' as const)
          : (e.note ?? '').toLowerCase().includes(needle)
            ? ('note' as const)
            : ('description' as const),
        context: e.title.toLowerCase().includes(needle) ? null : (e.note ?? e.description ?? null)
      }));

      const tasks_ = taskHits.map((t) => ({
        kind: 'task' as const,
        eventId: t.eventId,
        title: t.taskTitle,
        actualDate: t.actualDate,
        actualPrecision: 'day' as const,
        matchedOn: 'task' as const,
        context: t.eventTitle,
        status: t.status,
        dueDate: t.dueDate
      }));

      return [...events_, ...tasks_];
    },

    async getEvent(id: string) {
      const [row] = await db.select().from(events).where(eq(events.id, id));
      if (!row) throw new NotFoundError('לא מצאנו את האירוע. רענן את הדף ונסה שוב');
      const taskRows = await db
        .select()
        .from(tasks)
        .where(eq(tasks.eventId, id))
        .orderBy(asc(tasks.position));
      return { ...row, tasks: taskRows };
    },

    async createEvent(boardId: string, input: Omit<NewEvent, 'boardId'>, actorId: string | null) {
      const [board] = await db.select({ id: boards.id }).from(boards).where(eq(boards.id, boardId));
      if (!board) throw new NotFoundError('לא מצאנו את הלוח. רענן את הדף ונסה שוב');

      const [row] = await db
        .insert(events)
        .values({ ...input, boardId, createdBy: actorId })
        .returning();
      await log(db, actorId, 'event', row.id, 'created', null, row);
      return { ...row, tasks: [] };
    },

    /**
     * Optimistic lock. The UPDATE only matches when the caller's version is still
     * current, so two people editing the same event cannot silently clobber each
     * other — the loser gets a conflict instead of a surprise.
     */
    async updateEvent(
      id: string,
      version: number,
      changes: Partial<NewEvent>,
      actorId: string | null
    ) {
      const [before] = await db.select().from(events).where(eq(events.id, id));
      if (!before) throw new NotFoundError('לא מצאנו את האירוע. רענן את הדף ונסה שוב');

      const [row] = await db
        .update(events)
        .set({ ...changes, version: before.version + 1, updatedAt: new Date() })
        .where(and(eq(events.id, id), eq(events.version, version)))
        .returning();

      if (!row) throw new ConflictError(before.version);

      await log(db, actorId, 'event', id, 'updated', before, row);
      return row;
    },

    /** The archive is not a black hole — what went in must be listable and reversible. */
    async listArchivedEvents(boardId: string) {
      return db
        .select()
        .from(events)
        .where(and(eq(events.boardId, boardId), sql`${events.archivedAt} is not null`))
        .orderBy(sql`${events.archivedAt} desc`)
        .limit(200);
    },

    /**
     * Deletes an event for good, with its tasks, checklists and comments — the
     * schema cascades those. Only from the archive: an event has to be archived
     * first, so nothing can be erased in a single click from the calendar.
     *
     * The activity row survives, because `activity.entity_id` is a plain column
     * and not a foreign key: who removed what, and the whole row as it was, are
     * still in the database afterwards.
     *
     * They are not reachable over the API, though. `GET /events/:id/activity`
     * decides board access by looking the event up, so once the event is gone
     * the route answers 404. Reading a deleted event's history needs either a
     * board-level activity route or a look at the table directly. Nobody has
     * asked for one yet; this note is here so the next person is not surprised.
     */
    async purgeEvent(id: string, actorId: string | null) {
      const [before] = await db.select().from(events).where(eq(events.id, id));
      if (!before) throw new NotFoundError('לא מצאנו את האירוע. ייתכן שכבר נמחק');
      if (!before.archivedAt) {
        throw new ConflictExistsError('אפשר למחוק לצמיתות רק אירוע שנמצא בארכיון');
      }

      const [{ tasks: taskCount }] = await db
        .select({ tasks: sql<number>`count(*)::int` })
        .from(tasks)
        .where(eq(tasks.eventId, id));

      // Logged before the delete: afterwards there is nothing left to describe.
      await log(db, actorId, 'event', id, 'purged', { ...before, taskCount }, null);
      await db.delete(events).where(eq(events.id, id));
      return { id, title: before.title, taskCount };
    },

    async restoreEvent(id: string, actorId: string | null) {
      const [row] = await db
        .update(events)
        .set({ archivedAt: null, updatedAt: new Date() })
        .where(and(eq(events.id, id), sql`${events.archivedAt} is not null`))
        .returning();
      if (!row) throw new NotFoundError('האירוע כבר לא מצאנו את מה שחיפשת בארכיון');
      await log(db, actorId, 'event', id, 'restored');
      return row;
    },

    async archiveEvent(id: string, actorId: string | null) {
      const [row] = await db
        .update(events)
        .set({ archivedAt: new Date() })
        .where(and(eq(events.id, id), isNull(events.archivedAt)))
        .returning();
      if (!row) throw new NotFoundError('לא מצאנו את האירוע. רענן את הדף ונסה שוב');
      await log(db, actorId, 'event', id, 'archived');
      return row;
    },

    /** Which board an event belongs to — the anchor for every event-scoped check. */
    async boardIdForEvent(eventId: string): Promise<string> {
      const [row] = await db.select({ boardId: events.boardId }).from(events).where(eq(events.id, eventId));
      if (!row) throw new NotFoundError('לא מצאנו את האירוע. רענן את הדף ונסה שוב');
      return row.boardId;
    },

    async boardIdForTask(taskId: string): Promise<string> {
      const [row] = await db
        .select({ boardId: events.boardId })
        .from(tasks)
        .innerJoin(events, eq(tasks.eventId, events.id))
        .where(eq(tasks.id, taskId));
      if (!row) throw new NotFoundError('לא מצאנו את המשימה. רענן את הדף ונסה שוב');
      return row.boardId;
    },

    /** Boards a guest may read. `null` means unscoped — staff are not filtered. */
    async visibleBoardIds(actor: { id: string; isGuest: boolean }): Promise<string[] | null> {
      if (!actor.isGuest) return null;
      const rows = await db
        .select({ boardId: boardMembers.boardId })
        .from(boardMembers)
        .where(eq(boardMembers.userId, actor.id));
      return rows.map((r) => r.boardId);
    },

    /**
     * Board *scope*, not capability.
     *
     * Staff can reach every board — what they may do there is decided by the
     * permission matrix, not here. Guests are additionally limited by the grant
     * on the board itself, which can be read-only even for a capable role.
     */
    async boardRoleFor(
      actor: { id: string; isGuest: boolean; role: 'admin' | 'editor' | 'viewer' },
      boardId: string
    ): Promise<'editor' | 'viewer' | 'none'> {
      if (!actor.isGuest) return 'editor';
      const [row] = await db
        .select({ role: boardMembers.role })
        .from(boardMembers)
        .where(and(eq(boardMembers.userId, actor.id), eq(boardMembers.boardId, boardId)));
      return row?.role ?? 'none';
    },

    async grantBoardAccess(boardId: string, userId: string, role: 'editor' | 'viewer') {
      await db
        .insert(boardMembers)
        .values({ boardId, userId, role })
        .onConflictDoUpdate({ target: [boardMembers.boardId, boardMembers.userId], set: { role } });
    },

    // ---------------- tasks ----------------

    /**
     * One person's work, across every board they can reach.
     *
     * A task on its own says little — "עיצוב באנרים" is meaningless without the
     * event it belongs to and when that event happens. So the event and the
     * board come back with it, and the caller never has to fetch them again.
     *
     * `boardIds` is null for staff (every board) and a list for a guest. It is
     * the same scope the board list uses, so nobody sees work on a board they
     * could not open.
     */
    async listTasksForAssignee(assigneeId: string, boardIds: string[] | null) {
      if (boardIds && boardIds.length === 0) return [];

      const rows = await db
        .select({
          id: tasks.id,
          eventId: tasks.eventId,
          title: tasks.title,
          description: tasks.description,
          status: tasks.status,
          priority: tasks.priority,
          assigneeId: tasks.assigneeId,
          assignedAt: tasks.assignedAt,
          startDate: tasks.startDate,
          endDate: tasks.endDate,
          dueDate: tasks.dueDate,
          position: tasks.position,
          completedAt: tasks.completedAt,
          version: tasks.version,
          eventTitle: events.title,
          eventDate: events.actualDate,
          eventPrecision: events.actualPrecision,
          boardId: events.boardId,
          boardName: boards.name
        })
        .from(tasks)
        .innerJoin(events, eq(tasks.eventId, events.id))
        .innerJoin(boards, eq(events.boardId, boards.id))
        .where(
          and(
            eq(tasks.assigneeId, assigneeId),
            // Work on something archived is not work anybody should be chased for.
            isNull(events.archivedAt),
            isNull(boards.archivedAt),
            boardIds ? inArray(events.boardId, boardIds) : undefined
          )
        )
        // Undated work sorts last: a task with a date is the one that can be late.
        .orderBy(sql`${tasks.dueDate} asc nulls last`, asc(tasks.position));

      return rows;
    },

    // ---------------- notification settings ----------------

    /** The organisation's defaults, under which every person's own choices sit. */
    async workspaceNotificationDefaults(): Promise<Partial<NotificationPrefs>> {
      const [row] = await db.select().from(workspaceSettings).limit(1);
      return row ? readPrefs(row.notificationDefaults) : {};
    },

    /** The organisation's master switches, defaults filled in. */
    async channelSwitches(): Promise<ChannelSwitches> {
      const [row] = await db.select().from(workspaceSettings).limit(1);
      return readChannels(row?.channels);
    },

    async saveChannelSwitches(next: Partial<ChannelSwitches>, actorId: string | null) {
      const clean = readChannels({ ...(await this.channelSwitches()), ...next });
      await db
        .insert(workspaceSettings)
        .values({ id: true, channels: clean })
        .onConflictDoUpdate({
          target: workspaceSettings.id,
          set: { channels: clean, updatedAt: new Date() }
        });
      await log(db, actorId, 'settings', actorId ?? 'workspace', 'channels_updated', null, clean);
      return clean;
    },

    async saveWorkspaceNotificationDefaults(prefs: Partial<NotificationPrefs>, actorId: string | null) {
      const clean = readPrefs(prefs);
      await db
        .insert(workspaceSettings)
        .values({ id: true, notificationDefaults: clean })
        .onConflictDoUpdate({
          target: workspaceSettings.id,
          set: { notificationDefaults: clean, updatedAt: new Date() }
        });
      await log(db, actorId, 'settings', actorId ?? 'workspace', 'notifications_updated', null, clean);
      return clean;
    },

    /**
     * One person's settings: the defaults, with the organisation's opinion on
     * top of those, with their own choices on top of that.
     */
    async notificationPrefsFor(userId: string): Promise<NotificationPrefs> {
      const [orgDefaults, [row]] = await Promise.all([
        this.workspaceNotificationDefaults(),
        db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, userId)).limit(1)
      ]);
      return readPrefs(row?.prefs, orgDefaults);
    },

    async saveNotificationPrefs(userId: string, prefs: Partial<NotificationPrefs>) {
      const orgDefaults = await this.workspaceNotificationDefaults();
      const clean = readPrefs(prefs, orgDefaults);
      await db
        .insert(notificationPrefs)
        .values({ userId, prefs: clean })
        .onConflictDoUpdate({
          target: notificationPrefs.userId,
          set: { prefs: clean, updatedAt: new Date() }
        });
      return clean;
    },

    /** Everybody the daily job has to consider. Guests included: they own work too. */
    async peopleForDigest() {
      return db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          isGuest: users.isGuest,
          lastDigestOn: notificationPrefs.lastDigestOn
        })
        .from(users)
        .leftJoin(notificationPrefs, eq(notificationPrefs.userId, users.id));
    },

    /** Records that today's digest went out, so it cannot go out twice. */
    async markDigestSent(userId: string, day: string) {
      await db
        .insert(notificationPrefs)
        .values({ userId, lastDigestOn: day })
        .onConflictDoUpdate({ target: notificationPrefs.userId, set: { lastDigestOn: day } });
    },

    /**
     * Campaign dates coming up on the boards this person can reach.
     *
     * The columns are unpivoted here rather than in SQL: six nullable dates on
     * one row is a shape the database is bad at reshaping and TypeScript is
     * good at.
     */
    async upcomingMilestones(boardIds: string[] | null, from: string, to: string) {
      if (boardIds && boardIds.length === 0) return [];

      const rows = await db
        .select()
        .from(events)
        .innerJoin(boards, eq(events.boardId, boards.id))
        .where(
          and(
            isNull(events.archivedAt),
            // A finished project stops asking for attention. The task queries
            // already knew this; the milestone one did not, so archiving a
            // board silenced its task reminders and left its campaign dates
            // still going out every morning.
            isNull(boards.archivedAt),
            boardIds ? inArray(events.boardId, boardIds) : undefined,
            sql`least(${events.reviewDate}, ${events.freezeDate}, ${events.kickoffDate},
                      ${events.announceDate}, ${events.campaignEndDate}) <= ${to}`,
            sql`greatest(${events.reviewDate}, ${events.freezeDate}, ${events.kickoffDate},
                         ${events.announceDate}, ${events.campaignEndDate}) >= ${from}`
          )
        );

      return rows.flatMap(({ events: event }) =>
        MILESTONE_LABELS.flatMap((meta) => {
          const date = event[meta.field];
          if (!date || date < from || date > to) return [];
          return [
            {
              eventId: event.id,
              eventTitle: event.title,
              eventDate: event.actualDate,
              boardId: event.boardId,
              key: meta.key,
              label: meta.short,
              date
            }
          ];
        })
      );
    },

    /** Every live task on the boards given, with its owner. For the daily job. */
    async liveTasksForDigest(boardIds: string[] | null) {
      if (boardIds && boardIds.length === 0) return [];

      return db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          dueDate: tasks.dueDate,
          assigneeId: tasks.assigneeId,
          assignedAt: tasks.assignedAt,
          eventId: events.id,
          eventTitle: events.title,
          eventDate: events.actualDate,
          boardId: events.boardId
        })
        .from(tasks)
        .innerJoin(events, eq(tasks.eventId, events.id))
        .innerJoin(boards, eq(events.boardId, boards.id))
        .where(
          and(
            sql`${tasks.status} <> 'done'`,
            isNotNull(tasks.assigneeId),
            isNull(events.archivedAt),
            isNull(boards.archivedAt),
            boardIds ? inArray(events.boardId, boardIds) : undefined
          )
        );
    },

    // ---------------- notifications ----------------

    /**
     * Tells one person one thing, once.
     *
     * The unique index on (user, dedupeKey) does the work: a caller states what
     * it is saying and about what, and a second attempt is silently dropped.
     * Callers do not check first and then write — that race is exactly how
     * duplicates appear under load.
     *
     * Never throws. Failing to record the news must not undo the thing that
     * happened.
     */
    async notify(input: {
      userId: string;
      kind: string;
      title: string;
      body?: string | null;
      link?: string | null;
      entity?: string | null;
      entityId?: string | null;
      dedupeKey: string;
    }): Promise<boolean> {
      try {
        const rows = await db
          .insert(notifications)
          .values({
            userId: input.userId,
            kind: input.kind,
            title: input.title,
            body: input.body ?? null,
            link: input.link ?? null,
            entity: input.entity ?? null,
            entityId: input.entityId ?? null,
            dedupeKey: input.dedupeKey
          })
          .onConflictDoNothing()
          .returning({ id: notifications.id });
        return rows.length > 0;
      } catch (err) {
        console.error(JSON.stringify({ level: 'warn', msg: 'notify_failed', kind: input.kind, error: String(err) }));
        return false;
      }
    },

    async listNotifications(userId: string, limit = 40) {
      const rows = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(sql`${notifications.createdAt} desc`)
        .limit(limit);

      const [counted] = await db
        .select({ unread: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));

      return { items: rows, unread: counted?.unread ?? 0 };
    },

    /** One, or all of them. Always scoped to the person asking. */
    async markNotificationsRead(userId: string, id?: string) {
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          id
            ? and(eq(notifications.userId, userId), eq(notifications.id, id))
            : and(eq(notifications.userId, userId), isNull(notifications.readAt))
        );
    },

    /** Notifications are news, not records. A person may throw one away. */
    async deleteNotification(userId: string, id: string) {
      await db
        .delete(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.id, id)));
    },

    /**
     * Where a task lives, in words and as a link — what a notification about it
     * has to say to be worth opening.
     */
    async taskContext(taskId: string) {
      const [row] = await db
        .select({
          taskTitle: tasks.title,
          dueDate: tasks.dueDate,
          eventId: events.id,
          eventTitle: events.title,
          eventDate: events.actualDate,
          boardId: events.boardId,
          boardName: boards.name
        })
        .from(tasks)
        .innerJoin(events, eq(tasks.eventId, events.id))
        .innerJoin(boards, eq(events.boardId, boards.id))
        .where(eq(tasks.id, taskId));
      return row ?? null;
    },

    /**
     * "This task is yours now."
     *
     * Called only where the owner actually changed. Saving a task without
     * touching its owner says nothing, which is the difference between a
     * notification somebody reads and one they learn to ignore.
     *
     * Assigning work to yourself is not news, so it is not sent.
     */
    async notifyAssignment(taskId: string, assigneeId: string, actorId: string | null) {
      if (assigneeId === actorId) return false;

      const ctx = await this.taskContext(taskId);
      if (!ctx) return false;

      // The campaign and the deadline. The board name is org structure, and it
      // was pushing the one actionable part of the line off the end.
      const due = ctx.dueDate ? ` · עד ${ctx.dueDate.split('-').reverse().join('.')}` : '';
      const fresh = await this.notify({
        userId: assigneeId,
        kind: 'task_assigned',
        title: `משימה חדשה: ${ctx.taskTitle}`,
        body: `${ctx.eventTitle}${due}`,
        link: `/b/${ctx.boardId}/calendar?d=${ctx.eventDate}&e=${ctx.eventId}`,
        entity: 'task',
        entityId: taskId,
        // No date in the key: being handed a task is said once, ever. Handing
        // it away and back does not make it news again.
        dedupeKey: `task_assigned:${taskId}:${assigneeId}`
      });

      /*
       * And a mail, now rather than tomorrow morning.
       *
       * Being handed work is the one notification that cannot wait for the
       * daily digest: somebody has just decided this is yours, and until they
       * know you have seen it they will chase you about it. The digest is for
       * things that accumulate; this is an event.
       *
       * Only when the notification was actually new — `notify` returns false
       * for a key that already exists — so re-saving a task does not re-send.
       */
      /*
       * Awaited, not fired and forgotten.
       *
       * A serverless instance is frozen the moment its response is written, so
       * a floating promise here is an email that never leaves — the same way
       * the AI token counter silently recorded zero for a week. Assigning a
       * task waits the extra moment.
       */
      if (fresh) await this.mailAssignment(taskId, assigneeId, ctx);
      return fresh;
    },

    /**
     * The assignment email.
     *
     * Never throws into the caller: a task that was assigned but whose mail
     * failed is still assigned, and rolling that back would be worse than a
     * missing email. The failure goes to the log.
     */
    async mailAssignment(taskId: string, assigneeId: string, ctx: TaskContext) {
      // The organisation's switch, above anybody's own preferences.
      if (!(await this.channelSwitches()).assignment) return;

      const prefs = await this.notificationPrefsFor(assigneeId);
      // Somebody who turned email off meant it, for this too.
      if (prefs.email === 'off') return;

      const [person] = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, assigneeId));
      if (!person?.email) return;

      const due = ctx.dueDate ? ctx.dueDate.split('-').reverse().join('.') : null;
      // Straight to the task, not to the campaign it sits inside.
      const link = `${appUrl()}/b/${ctx.boardId}/calendar?d=${ctx.eventDate}&e=${ctx.eventId}&t=${taskId}`;
      const subject = `משימה חדשה עבורך: ${ctx.taskTitle}`;

      const result = await sendEmail({
        to: person.email,
        name: person.name,
        subject,
        text: `${ctx.taskTitle}\n${ctx.eventTitle}${due ? ` · עד ${due}` : ''}\n${link}`,
        html: assignmentEmail({ name: person.name, task: ctx.taskTitle, event: ctx.eventTitle, due, link }),
        purpose: 'assignment'
      });

      if (!result.ok) {
        console.error(
          JSON.stringify({ level: 'error', msg: 'assignment_mail_failed', assigneeId, error: result.error })
        );
      }
    },

    async createTask(eventId: string, input: Omit<NewTask, 'eventId'>, actorId: string | null) {
      const [event] = await db.select({ id: events.id }).from(events).where(eq(events.id, eventId));
      if (!event) throw new NotFoundError('לא מצאנו את האירוע. רענן את הדף ונסה שוב');

      const [{ next }] = await db
        .select({ next: sql<number>`coalesce(max(${tasks.position}), -1) + 1` })
        .from(tasks)
        .where(eq(tasks.eventId, eventId));

      const [row] = await db
        .insert(tasks)
        .values({
          ...input,
          eventId,
          position: next,
          createdBy: actorId,
          assignedAt: input.assigneeId ? new Date() : null
        })
        .returning();
      await log(db, actorId, 'task', row.id, 'created', null, row);

      if (row.assigneeId) await this.notifyAssignment(row.id, row.assigneeId, actorId);
      return row;
    },

    /**
     * Every task in a project, across all of its campaigns and events.
     *
     * "My tasks" answers what one person owes. This answers what the project
     * owes — which is the question a project manager has all day and had no
     * screen for. Same rows, different axis.
     *
     * Unassigned work comes back too, and deliberately first: a task nobody
     * owns is the one thing on this screen that cannot chase itself.
     */
    async tasksForBoard(boardId: string) {
      return db
        .select({
          id: tasks.id,
          title: tasks.title,
          description: tasks.description,
          status: tasks.status,
          priority: tasks.priority,
          dueDate: tasks.dueDate,
          assigneeId: tasks.assigneeId,
          assigneeName: users.name,
          assignedAt: tasks.assignedAt,
          version: tasks.version,
          eventId: events.id,
          eventTitle: events.title,
          eventDate: events.actualDate,
          eventCategory: events.category
        })
        .from(tasks)
        .innerJoin(events, eq(tasks.eventId, events.id))
        .leftJoin(users, eq(tasks.assigneeId, users.id))
        .where(and(eq(events.boardId, boardId), isNull(events.archivedAt)))
        .orderBy(
          // Unowned first, then by when it is due, with undated work last —
          // a task with a date is the one that can be late.
          sql`${tasks.assigneeId} is not null`,
          sql`${tasks.dueDate} asc nulls last`,
          asc(tasks.position)
        );
    },

    /**
     * One task, with everything a person needs when they open it.
     *
     * The names come back resolved rather than as ids: a panel showing
     * "שינה אחראי" next to a uuid is a panel nobody can read, and joining here
     * costs one query instead of one per row on the client.
     */
    async taskDetail(id: string) {
      const [row] = await db
        .select({
          task: tasks,
          eventId: events.id,
          eventTitle: events.title,
          eventDate: events.actualDate,
          boardId: boards.id,
          boardName: boards.name,
          assigneeName: users.name,
          creatorName: sql<string | null>`creator.name`
        })
        .from(tasks)
        .innerJoin(events, eq(tasks.eventId, events.id))
        .innerJoin(boards, eq(events.boardId, boards.id))
        .leftJoin(users, eq(tasks.assigneeId, users.id))
        .leftJoin(sql`users as creator`, sql`creator.id = ${tasks.createdBy}`)
        .where(eq(tasks.id, id));

      if (!row) throw new NotFoundError('לא מצאנו את המשימה. רענן את הדף ונסה שוב');

      /*
       * The trail, in the words of what changed.
       *
       * The activity log keeps whole rows before and after; a person wants
       * "מי שינה אחראי, ומתי". Turning one into the other belongs here, where
       * both sides of the change are already loaded.
       */
      const trail = await db
        .select({
          id: activity.id,
          action: activity.action,
          at: activity.createdAt,
          before: activity.before,
          after: activity.after,
          byName: users.name
        })
        .from(activity)
        .leftJoin(users, eq(activity.actorId, users.id))
        .where(and(eq(activity.entity, 'task'), eq(activity.entityId, id)))
        .orderBy(asc(activity.createdAt));

      return { ...row.task, event: { id: row.eventId, title: row.eventTitle, date: row.eventDate },
        board: { id: row.boardId, name: row.boardName },
        assigneeName: row.assigneeName, creatorName: row.creatorName,
        history: trail.map((entry) => ({
          id: entry.id,
          action: entry.action,
          at: entry.at,
          by: entry.byName,
          changed: describeTaskChange(entry.before, entry.after)
        }))
      };
    },

    /* ------------------------------------------------ what hangs off a task */

    async listChecklist(taskId: string) {
      return db
        .select()
        .from(checklistItems)
        .where(eq(checklistItems.taskId, taskId))
        .orderBy(asc(checklistItems.position));
    },

    async addChecklistItem(taskId: string, text: string) {
      const [{ next }] = await db
        .select({ next: sql<number>`coalesce(max(${checklistItems.position}), -1) + 1` })
        .from(checklistItems)
        .where(eq(checklistItems.taskId, taskId));
      const [row] = await db.insert(checklistItems).values({ taskId, text, position: next }).returning();
      return row;
    },

    async setChecklistItem(id: string, changes: { text?: string; done?: boolean }) {
      const [row] = await db.update(checklistItems).set(changes).where(eq(checklistItems.id, id)).returning();
      if (!row) throw new NotFoundError('לא מצאנו את הסעיף');
      return row;
    },

    async deleteChecklistItem(id: string) {
      await db.delete(checklistItems).where(eq(checklistItems.id, id));
    },

    async listAttachments(taskId: string) {
      return db
        .select({
          id: taskAttachments.id,
          kind: taskAttachments.kind,
          title: taskAttachments.title,
          url: taskAttachments.url,
          createdAt: taskAttachments.createdAt,
          addedByName: users.name
        })
        .from(taskAttachments)
        .leftJoin(users, eq(taskAttachments.addedBy, users.id))
        .where(eq(taskAttachments.taskId, taskId))
        .orderBy(asc(taskAttachments.createdAt));
    },

    async addAttachment(taskId: string, input: { title?: string; url: string }, actorId: string | null) {
      /*
       * A link with no name is named after where it points.
       *
       * "drive.google.com" tells somebody more than an empty row does, and it
       * saves the person adding it from inventing a title for something whose
       * name they will recognise anyway.
       */
      const title = input.title?.trim() || hostOf(input.url) || 'קישור';
      const [row] = await db
        .insert(taskAttachments)
        .values({ taskId, title, url: input.url.trim(), kind: 'link', addedBy: actorId })
        .returning();
      await log(db, actorId, 'task', taskId, 'attachment_added', null, { title, url: row.url });
      return row;
    },

    async deleteAttachment(id: string, actorId: string | null) {
      const [row] = await db.delete(taskAttachments).where(eq(taskAttachments.id, id)).returning();
      if (!row) throw new NotFoundError('לא מצאנו את הקישור');
      await log(db, actorId, 'task', row.taskId, 'attachment_removed', { title: row.title }, null);
      return row;
    },

    /** The task's own conversation, separate from the event's. */
    async listTaskComments(taskId: string) {
      return db
        .select({
          id: comments.id,
          body: comments.body,
          createdAt: comments.createdAt,
          authorName: users.name
        })
        .from(comments)
        .leftJoin(users, eq(comments.authorId, users.id))
        .where(eq(comments.taskId, taskId))
        .orderBy(asc(comments.createdAt));
    },

    async addTaskComment(taskId: string, body: string, actorId: string | null) {
      const [task] = await db.select({ eventId: tasks.eventId }).from(tasks).where(eq(tasks.id, taskId));
      if (!task) throw new NotFoundError('לא מצאנו את המשימה');
      const [row] = await db
        .insert(comments)
        .values({ eventId: task.eventId, taskId, body, authorId: actorId })
        .returning();
      return row;
    },

    async updateTask(
      id: string,
      version: number,
      changes: Partial<NewTask>,
      actorId: string | null
    ) {
      const [before] = await db.select().from(tasks).where(eq(tasks.id, id));
      if (!before) throw new NotFoundError('לא מצאנו את המשימה. רענן את הדף ונסה שוב');

      // completedAt is derived from status, never trusted from the client.
      const completedAt =
        changes.status === undefined
          ? before.completedAt
          : changes.status === 'done'
            ? (before.completedAt ?? new Date())
            : null;

      // The handover clock restarts only on a real handover, so a task edited
      // ten times still counts its days from when somebody was given it.
      const assignedAt =
        changes.assigneeId === undefined || changes.assigneeId === before.assigneeId
          ? before.assignedAt
          : changes.assigneeId
            ? new Date()
            : null;

      const [row] = await db
        .update(tasks)
        .set({ ...changes, assignedAt, completedAt, version: before.version + 1, updatedAt: new Date() })
        .where(and(eq(tasks.id, id), eq(tasks.version, version)))
        .returning();

      if (!row) throw new ConflictError(before.version);

      await log(db, actorId, 'task', id, 'updated', before, row);

      /*
       * Only a real change of hands.
       *
       * The unique index already stops a second copy while the first still
       * exists — but a person may throw a notification away, and then nothing
       * in the database prevents the same news being written again. Without
       * this check, every later save of the task would put it back in their
       * inbox, which is exactly how an inbox becomes something people ignore.
       */
      if (row.assigneeId && row.assigneeId !== before.assigneeId) {
        await this.notifyAssignment(id, row.assigneeId, actorId);
      }
      return row;
    },

    async deleteTask(id: string, actorId: string | null) {
      const [row] = await db.delete(tasks).where(eq(tasks.id, id)).returning();
      if (!row) throw new NotFoundError('לא מצאנו את המשימה. רענן את הדף ונסה שוב');
      await log(db, actorId, 'task', id, 'deleted', row);
      return row;
    },

    // ---------------- comments ----------------

    async listComments(eventId: string) {
      return db
        .select({
          id: comments.id,
          eventId: comments.eventId,
          taskId: comments.taskId,
          body: comments.body,
          createdAt: comments.createdAt,
          authorId: comments.authorId,
          authorName: users.name,
          authorEmail: users.email
        })
        .from(comments)
        .leftJoin(users, eq(comments.authorId, users.id))
        .where(eq(comments.eventId, eventId))
        .orderBy(asc(comments.createdAt));
    },

    async createComment(
      eventId: string,
      input: { body: string; taskId?: string | null },
      actorId: string | null
    ) {
      const [event] = await db.select({ id: events.id }).from(events).where(eq(events.id, eventId));
      if (!event) throw new NotFoundError('לא מצאנו את האירוע. רענן את הדף ונסה שוב');

      const [row] = await db
        .insert(comments)
        .values({ eventId, taskId: input.taskId ?? null, body: input.body, authorId: actorId })
        .returning();
      return row;
    },

    // ---------------- users ----------------

    async listUsers() {
      return db
        .select({ id: users.id, email: users.email, name: users.name, role: users.role })
        .from(users)
        .where(isNull(users.deletedAt))
        .orderBy(asc(users.name));
    },

    /** Somebody's own number, normalised by the caller or cleared outright. */
    async saveOwnPhone(userId: string, phone: string | null) {
      const [row] = await db
        .update(users)
        .set({ phone, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning({ phone: users.phone });
      return row ?? { phone: null };
    },

    /**
     * Claims one AI call for this person, today.
     *
     * The count is incremented BEFORE the model is called, and the caller is
     * told whether it may proceed. That ordering is the point: counting
     * afterwards means a burst of parallel requests all read the same low
     * number and all pass, which is exactly the shape of the runaway this is
     * supposed to stop.
     *
     * A failed call still counts. It cost the provider time either way, and a
     * limit that forgives failures is a limit somebody can retry past.
     */
    async claimAiCall(userId: string, perPersonPerDay: number, perWorkspacePerDay: number) {
      const today = israelDay();

      const [row] = await db
        .insert(aiUsage)
        .values({ userId, day: today, calls: 1 })
        .onConflictDoUpdate({
          target: [aiUsage.userId, aiUsage.day],
          set: { calls: sql`${aiUsage.calls} + 1`, updatedAt: new Date() }
        })
        .returning({ calls: aiUsage.calls });

      if (row.calls > perPersonPerDay) {
        return { allowed: false as const, reason: 'person' as const, used: row.calls };
      }

      const [total] = await db
        .select({ calls: sql<number>`coalesce(sum(${aiUsage.calls}), 0)::int` })
        .from(aiUsage)
        .where(eq(aiUsage.day, today));

      if (total.calls > perWorkspacePerDay) {
        return { allowed: false as const, reason: 'workspace' as const, used: total.calls };
      }

      return { allowed: true as const, reason: null, used: row.calls };
    },

    /** What the provider actually charged for, once the answer is back. */
    async recordAiTokens(userId: string, input: number, output: number) {
      await db
        .update(aiUsage)
        .set({
          inputTokens: sql`${aiUsage.inputTokens} + ${input}`,
          outputTokens: sql`${aiUsage.outputTokens} + ${output}`
        })
        .where(and(eq(aiUsage.userId, userId), eq(aiUsage.day, israelDay())));
    },

    async findUserByEmail(email: string) {
      const [row] = await db
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`);
      return row ?? null;
    },

    // ---------------- permissions ----------------

    /**
     * The full matrix, filling in defaults for any capability that has no row
     * yet — so adding a new capability to the code never leaves a blank cell.
     */
    async listPermissions(): Promise<Record<Role, Record<string, boolean>>> {
      const rows = await db.select().from(rolePermissions);
      const stored = new Map(rows.map((r) => [`${r.role}:${r.permission}`, r.allowed]));

      const matrix = {} as Record<Role, Record<string, boolean>>;
      for (const role of ['admin', 'editor', 'viewer'] as Role[]) {
        matrix[role] = {};
        for (const p of PERMISSIONS) {
          const key = `${role}:${p.key}`;
          matrix[role][p.key] = stored.has(key)
            ? Boolean(stored.get(key))
            : DEFAULTS[role].includes(p.key);
        }
      }
      return matrix;
    },

    async setPermission(role: Role, permission: string, allowed: boolean, actorId: string | null) {
      await db
        .insert(rolePermissions)
        .values({ role, permission, allowed })
        .onConflictDoUpdate({
          target: [rolePermissions.role, rolePermissions.permission],
          set: { allowed, updatedAt: new Date() }
        });
      await log(db, actorId, 'permission', actorId ?? role, 'updated', null, { role, permission, allowed });
    },

    /**
     * Everything this actor may do, resolved once.
     * The client uses it to hide actions rather than guessing from the role —
     * a button that does nothing is worse than a button that isn't there.
     */
    async effectivePermissions(actor: { role: Role; isOwner: boolean }): Promise<string[]> {
      if (actor.isOwner) return PERMISSIONS.map((p) => p.key);
      const matrix = await this.listPermissions();
      return PERMISSIONS.map((p) => p.key).filter((k) => matrix[actor.role][k]);
    },

    /** One lookup used by every route guard. */
    async can(role: Role, permission: PermissionKey): Promise<boolean> {
      const [row] = await db
        .select({ allowed: rolePermissions.allowed })
        .from(rolePermissions)
        .where(and(eq(rolePermissions.role, role), eq(rolePermissions.permission, permission)));
      return row ? row.allowed : DEFAULTS[role].includes(permission);
    },

    // ---------------- people ----------------

    /** Everyone, with the boards each guest can reach. Staff show as unscoped. */
    async listPeople() {
      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          isGuest: users.isGuest,
          isOwner: users.isOwner,
          createdAt: users.createdAt
        })
        .from(users)
        .where(isNull(users.deletedAt))
        .orderBy(asc(users.name));

      const grants = await db
        .select({ userId: boardMembers.userId, boardId: boardMembers.boardId, role: boardMembers.role })
        .from(boardMembers);

      const byUser = new Map<string, { boardId: string; role: 'editor' | 'viewer' }[]>();
      for (const g of grants) {
        const list = byUser.get(g.userId) ?? [];
        list.push({ boardId: g.boardId, role: g.role });
        byUser.set(g.userId, list);
      }

      return rows.map((u) => ({ ...u, boards: byUser.get(u.id) ?? [] }));
    },

    /**
     * Adds a person by email. Staff get the whole workspace; a guest gets
     * nothing until a board is granted, which is a separate call.
     */
    async addPerson(
      input: { email: string; name?: string; role: 'admin' | 'editor' | 'viewer'; isGuest: boolean },
      actorId: string | null
    ) {
      const email = input.email.trim().toLowerCase();
      const [clash] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`);
      if (clash) throw new ConflictExistsError('המייל הזה כבר נוסף');

      const [row] = await db
        .insert(users)
        .values({
          email,
          name: input.name?.trim() || email.split('@')[0],
          role: input.role,
          isGuest: input.isGuest
        })
        .returning();

      await log(db, actorId, 'user', row.id, 'created', null, { email: row.email, role: row.role });
      return row;
    },

    async updatePerson(
      id: string,
      changes: { name?: string; role?: 'admin' | 'editor' | 'viewer' },
      actorId: string | null
    ) {
      const [before] = await db.select().from(users).where(eq(users.id, id));
      if (!before) throw new NotFoundError('לא מצאנו את האדם הזה');

      const [row] = await db
        .update(users)
        .set({ ...changes, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();

      await log(db, actorId, 'user', id, 'updated', { role: before.role }, { role: row.role });
      return row;
    },

    async isOwner(id: string): Promise<boolean> {
      const [row] = await db.select({ o: users.isOwner }).from(users).where(eq(users.id, id));
      return Boolean(row?.o);
    },

    /** Soft delete: their name stays readable on the events they created. */
    async removePerson(id: string, actorId: string | null) {
      const [row] = await db
        .update(users)
        .set({ deletedAt: new Date() })
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .returning();
      if (!row) throw new NotFoundError('לא מצאנו את האדם הזה');
      await db.delete(boardMembers).where(eq(boardMembers.userId, id));
      await log(db, actorId, 'user', id, 'removed');
      return row;
    },

    async revokeBoardAccess(boardId: string, userId: string) {
      await db
        .delete(boardMembers)
        .where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId)));
    },

    /** How many admins remain — the last one must never be removable. */
    async countAdmins(): Promise<number> {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(users)
        .where(and(eq(users.role, 'admin'), isNull(users.deletedAt)));
      return row?.n ?? 0;
    },

    // ---------------- activity ----------------

    async listActivity(entity: string, entityId: string, limit = 50) {
      return db
        .select()
        .from(activity)
        .where(and(eq(activity.entity, entity), eq(activity.entityId, entityId)))
        .orderBy(sql`${activity.createdAt} desc`)
        .limit(limit);
    },

    checklistItems
  };
}

export type Repo = ReturnType<typeof createRepo>;
