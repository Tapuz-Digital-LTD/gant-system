import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  date,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  pgEnum
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

/* ------------------------------------------------------------------
   Date model, stated once so it cannot drift again:

   · Civil dates (kickoff, actual, task start/end, due) are DATE.
     "Rosh Hashana on 11 September" is not an instant in time, so it
     carries no zone and no clock.
   · Timestamps (created, updated, completed) are TIMESTAMPTZ in UTC.
   · A month-precision event stores the 1st of the month in actual_date
     and records date_precision = 'month'. There is no isFloating flag
     to contradict it.
   ------------------------------------------------------------------ */

export const memberRole = pgEnum('member_role', ['admin', 'editor', 'viewer']);
export const boardRole = pgEnum('board_role', ['editor', 'viewer']);
export const eventCategory = pgEnum('event_category', [
  'holiday',
  'campaign',
  'b2b',
  'social',
  'operational',
  'other'
]);
export const datePrecision = pgEnum('date_precision', ['day', 'month']);
export const taskStatus = pgEnum('task_status', ['todo', 'in_progress', 'ready_kickoff', 'done']);
export const eventStatus = pgEnum('event_status', ['todo', 'in_progress', 'ready_kickoff', 'done']);
export const taskPriority = pgEnum('task_priority', ['low', 'medium', 'high', 'urgent']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    /** Staff sign in with SSO; guests arrive through an invite and have no domain. */
    isGuest: boolean('is_guest').notNull().default(false),
    role: memberRole('role').notNull().default('editor'),
    /**
     * The account that owns the workspace. Cannot be removed or demoted by
     * anyone, including itself — otherwise a single mis-click can lock the
     * whole organisation out of user management permanently.
     */
    isOwner: boolean('is_owner').notNull().default(false),
    /* --- fields Better Auth manages --- */
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true })
  },
  (t) => [uniqueIndex('users_email_lower_idx').on(sql`lower(${t.email})`)]
);

export const boards = pgTable(
  'boards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    position: integer('position').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true })
  },
  (t) => [index('boards_position_idx').on(t.position)]
);

/** Guest access. Staff see every board and get no row here. */
export const boardMembers = pgTable(
  'board_members',
  {
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: boardRole('role').notNull().default('viewer'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    uniqueIndex('board_members_pk').on(t.boardId, t.userId),
    index('board_members_user_idx').on(t.userId)
  ]
);

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    category: eventCategory('category').notNull().default('campaign'),

    /**
     * The event's own state, set by a person — not derived from its tasks.
     * A derived value cannot be dragged, which is why the kanban was read-only.
     */
    status: eventStatus('status').notNull().default('todo'),

    /** Optional milestone inside the work window, not its start. */
    kickoffDate: date('kickoff_date'),
    /** When the event itself happens. Resolved from hebrewRule when one exists. */
    actualDate: date('actual_date').notNull(),
    actualPrecision: datePrecision('actual_precision').notNull().default('day'),

    /** Months of preparation before actualDate. Defines the work window. */
    prepMonths: integer('prep_months').notNull().default(0),

    /**
     * Hebrew-calendar anchor, e.g. {"hd":1,"hm":"Tishrei"} or {"holiday":"Rosh Hashana"}.
     * Present only for events that are inherently tied to the Hebrew calendar;
     * everything else uses civil dates alone.
     */
    hebrewRule: jsonb('hebrew_rule'),

    note: text('note'),
    description: text('description'),

    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),

    /** Optimistic lock. A stale write gets 409 instead of silently winning. */
    version: integer('version').notNull().default(1)
  },
  (t) => [
    // The windowed timeline query: one board, one date range.
    index('events_board_actual_idx').on(t.boardId, t.actualDate),
    index('events_board_status_idx').on(t.boardId, t.status),
    index('events_board_kickoff_idx').on(t.boardId, t.kickoffDate),
    index('events_title_search_idx').using('gin', sql`to_tsvector('simple', ${t.title})`)
  ]
);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    status: taskStatus('status').notNull().default('todo'),
    priority: taskPriority('priority').notNull().default('medium'),
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),

    /** Day-resolution range. Always civil, even when the parent event is Hebrew-anchored. */
    startDate: date('start_date'),
    endDate: date('end_date'),
    dueDate: date('due_date'),

    position: integer('position').notNull().default(0),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    version: integer('version').notNull().default(1)
  },
  (t) => [
    index('tasks_event_idx').on(t.eventId, t.position),
    index('tasks_assignee_due_idx').on(t.assigneeId, t.dueDate),
    index('tasks_range_idx').on(t.startDate, t.endDate)
  ]
);

export const checklistItems = pgTable(
  'checklist_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    done: boolean('done').notNull().default(false),
    position: integer('position').notNull().default(0)
  },
  (t) => [index('checklist_task_idx').on(t.taskId, t.position)]
);

/** Comments belong to an event; task_id is optional. No more smuggling them into tasks[0]. */
export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index('comments_event_idx').on(t.eventId, t.createdAt)]
);

export const activity = pgTable(
  'activity',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    entity: text('entity').notNull(),
    entityId: uuid('entity_id').notNull(),
    action: text('action').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index('activity_entity_idx').on(t.entity, t.entityId, t.createdAt)]
);

/* --- relations --- */

export const boardsRelations = relations(boards, ({ many }) => ({
  events: many(events),
  members: many(boardMembers)
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  board: one(boards, { fields: [events.boardId], references: [boards.id] }),
  tasks: many(tasks),
  comments: many(comments)
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  event: one(events, { fields: [tasks.eventId], references: [events.id] }),
  assignee: one(users, { fields: [tasks.assigneeId], references: [users.id] }),
  checklist: many(checklistItems)
}));


/* ==================================================================
   Auth tables. Better Auth owns these rows; the app only reads them
   through the session, never writes them directly.
   ================================================================== */

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex('sessions_token_idx').on(t.token), index('sessions_user_idx').on(t.userId)]
);

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    issuer: text('issuer'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    idToken: text('id_token'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex('accounts_provider_idx').on(t.providerId, t.accountId)]
);

export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index('verifications_identifier_idx').on(t.identifier)]
);

/**
 * What each role is allowed to do.
 *
 * Kept in the database rather than in code so the workspace owner can change it
 * without a deploy. The owner always bypasses this table entirely.
 */
export const rolePermissions = pgTable(
  'role_permissions',
  {
    role: memberRole('role').notNull(),
    permission: text('permission').notNull(),
    allowed: boolean('allowed').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex('role_permissions_pk').on(t.role, t.permission)]
);

/** An invite is what turns an outside email into a guest on exactly one board. */
export const invites = pgTable(
  'invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    role: boardRole('role').notNull().default('viewer'),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index('invites_email_idx').on(sql`lower(${t.email})`),
    index('invites_board_idx').on(t.boardId)
  ]
);
