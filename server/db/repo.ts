import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import { boards, boardMembers, events, tasks, checklistItems, comments, users, activity, notifications, notificationPrefs, workspaceSettings, rolePermissions } from './schema.js';
import { DEFAULT_PREFS, readPrefs, type NotificationPrefs } from '../notifications/prefs.js';
import { MILESTONE_LABELS } from '../notifications/milestone-labels.js';
import { PERMISSIONS, DEFAULTS, type PermissionKey, type Role } from '../permissions.js';

/** Thrown when a write carries a stale `version`. Routes turn this into 409. */
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
    async listBoards(onlyIds?: string[] | null) {
      if (onlyIds !== null && onlyIds !== undefined && onlyIds.length === 0) return [];
      return db
        .select({
          id: boards.id,
          name: boards.name,
          description: boards.description,
          position: boards.position,
          eventCount: sql<number>`count(${events.id})::int`
        })
        .from(boards)
        .leftJoin(events, and(eq(events.boardId, boards.id), isNull(events.archivedAt)))
        .where(
          onlyIds && onlyIds.length
            ? and(isNull(boards.archivedAt), inArray(boards.id, onlyIds))
            : isNull(boards.archivedAt)
        )
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

    /** Soft delete — a board is too expensive to lose to a mis-click. */
    async archiveBoard(id: string, actorId: string | null) {
      const [row] = await db
        .update(boards)
        .set({ archivedAt: new Date() })
        .where(and(eq(boards.id, id), isNull(boards.archivedAt)))
        .returning();
      if (!row) throw new NotFoundError('לא מצאנו את הלוח. רענן את הדף ונסה שוב');
      await log(db, actorId, 'board', id, 'archived');
      return row;
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
        .select({ id: users.id, name: users.name, email: users.email, role: users.role, isGuest: users.isGuest })
        .from(users);
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
        .where(
          and(
            isNull(events.archivedAt),
            boardIds ? inArray(events.boardId, boardIds) : undefined,
            sql`least(${events.reviewDate}, ${events.freezeDate}, ${events.kickoffDate},
                      ${events.announceDate}, ${events.campaignEndDate}) <= ${to}`,
            sql`greatest(${events.reviewDate}, ${events.freezeDate}, ${events.kickoffDate},
                         ${events.announceDate}, ${events.campaignEndDate}) >= ${from}`
          )
        );

      return rows.flatMap((event) =>
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
      return this.notify({
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
          assignedAt: input.assigneeId ? new Date() : null
        })
        .returning();
      await log(db, actorId, 'task', row.id, 'created', null, row);

      if (row.assigneeId) await this.notifyAssignment(row.id, row.assigneeId, actorId);
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
