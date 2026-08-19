import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import { boards, boardMembers, events, tasks, checklistItems, comments, users, activity, rolePermissions } from './schema.js';
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
              kickoffDate: ev.kickoffDate,
              actualDate: ev.actualDate,
              actualPrecision: ev.actualPrecision,
              prepMonths: ev.prepMonths,
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
     * An event is in the window when its work window overlaps it — the bar spans
     * `actual_date - prep_months` to `actual_date`, so a long prep period must
     * still appear in months where no date literally falls.
     */
    async listEvents(boardId: string, from: string, to: string) {
      const rows = await db
        .select()
        .from(events)
        .where(
          and(
            eq(events.boardId, boardId),
            isNull(events.archivedAt),
            lte(sql`${events.actualDate} - make_interval(months => ${events.prepMonths})`, to),
            gte(events.actualDate, from)
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

    async createTask(eventId: string, input: Omit<NewTask, 'eventId'>, actorId: string | null) {
      const [event] = await db.select({ id: events.id }).from(events).where(eq(events.id, eventId));
      if (!event) throw new NotFoundError('לא מצאנו את האירוע. רענן את הדף ונסה שוב');

      const [{ next }] = await db
        .select({ next: sql<number>`coalesce(max(${tasks.position}), -1) + 1` })
        .from(tasks)
        .where(eq(tasks.eventId, eventId));

      const [row] = await db
        .insert(tasks)
        .values({ ...input, eventId, position: next })
        .returning();
      await log(db, actorId, 'task', row.id, 'created', null, row);
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

      const [row] = await db
        .update(tasks)
        .set({ ...changes, completedAt, version: before.version + 1, updatedAt: new Date() })
        .where(and(eq(tasks.id, id), eq(tasks.version, version)))
        .returning();

      if (!row) throw new ConflictError(before.version);

      await log(db, actorId, 'task', id, 'updated', before, row);
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
