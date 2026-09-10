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
  primaryKey,
  bigint,
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
    /**
     * Israeli mobile, stored as `05XXXXXXXX`.
     *
     * Optional for good: most people here never want a text message, and a
     * required field only teaches them to invent a number.
     */
    phone: text('phone'),
    /** Set once somebody has entered a code sent to that number. */
    phoneVerified: boolean('phone_verified').notNull().default(false),
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

    /** When the event itself happens. Resolved from hebrewRule when one exists. */
    actualDate: date('actual_date').notNull(),
    actualPrecision: datePrecision('actual_precision').notNull().default('day'),

    /** Months of preparation before actualDate. Defines the work window's start
     *  unless workStartDate says otherwise. */
    prepMonths: integer('prep_months').notNull().default(0),

    /*
     * Milestones. Every one is optional and day-precision, and none of them is
     * ever invented from another: a null here means nobody knows the date, not
     * that it can be derived. src/data/milestones.ts is the single description
     * of what each one means and how it is drawn.
     */

    /**
     * ישיבת התנעה — the meeting that starts the work and hands it out.
     * Never derived from workStartDate or kickoffDate; see ADR 0003.
     */
    kickoffMeetingDate: date('kickoff_meeting_date'),
    /** Overrides `actualDate - prepMonths` when the exact day is known. */
    workStartDate: date('work_start_date'),
    /** Checkpoint meeting: surface risks while there is still time. */
    reviewDate: date('review_date'),
    /** No more change requests from here on. Planning only — nothing is blocked. */
    freezeDate: date('freeze_date'),
    /** The campaign starts reaching customers. */
    kickoffDate: date('kickoff_date'),
    /** Internal announcement to the company. Not the same day as kickoff by rule. */
    announceDate: date('announce_date'),
    /** The campaign, and the calls about it, are over. Falls after actualDate. */
    campaignEndDate: date('campaign_end_date'),

    /**
     * Hebrew-calendar anchor, e.g. {"hd":1,"hm":"Tishrei"} or {"holiday":"Rosh Hashana"}.
     * Present only for events that are inherently tied to the Hebrew calendar;
     * everything else uses civil dates alone.
     */
    hebrewRule: jsonb('hebrew_rule'),

    /**
     * Where this row came from, when it came from outside.
     *
     * Null for anything a person typed. The importer sets it to a key derived
     * from the source file's identity for the row, so re-importing the same
     * file updates what it created rather than doubling it — see
     * 0017_kickoff_meeting.sql.
     */
    sourceKey: text('source_key'),

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
    index('events_title_search_idx').using('gin', sql`to_tsvector('simple', ${t.title})`),
    // Re-importing a file updates its own rows instead of doubling them.
    uniqueIndex('events_source_key_idx')
      .on(t.boardId, t.sourceKey)
      .where(sql`${t.sourceKey} is not null`)
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
    /** When it last changed hands. The clock a "not started yet" reminder uses. */
    assignedAt: timestamp('assigned_at', { withTimezone: true }),

    /** Day-resolution range. Always civil, even when the parent event is Hebrew-anchored. */
    startDate: date('start_date'),
    endDate: date('end_date'),
    dueDate: date('due_date'),

    position: integer('position').notNull().default(0),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** Who handed this out. Null for everything created before it was recorded. */
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
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

/**
 * Things hanging off a task — a brief, a folder, a spec.
 *
 * `kind` is here so an uploaded file can join later without a second table and
 * a second set of routes. Every row is a link today, which needs no storage
 * service and works the moment somebody pastes one.
 */
export const taskAttachments = pgTable(
  'task_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default('link'),
    title: text('title').notNull(),
    url: text('url').notNull(),
    addedBy: uuid('added_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index('task_attachments_task_idx').on(t.taskId, t.createdAt)]
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

/**
 * What a person is told, inside the system.
 *
 * `dedupeKey` is the whole design. Every writer states what it is saying and
 * about what — "this task is yours", "this one is late today" — and the unique
 * index makes saying it twice impossible. A notification system does not become
 * noise because it says too much; it becomes noise because it repeats.
 *
 * Recurring news puts a date in the key, so it can be said once a day and never
 * more. One-off news leaves the date out, so it is said exactly once, ever.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    /** Where clicking goes. A full in-app path, built when the row is written. */
    link: text('link'),
    entity: text('entity'),
    entityId: uuid('entity_id'),
    dedupeKey: text('dedupe_key').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    uniqueIndex('notifications_dedupe_idx').on(t.userId, t.dedupeKey),
    index('notifications_inbox_idx').on(t.userId, t.readAt, t.createdAt)
  ]
);

/**
 * What one person wants to hear about, and how.
 *
 * Held as JSON rather than columns because these are preferences, not facts:
 * they are read as a whole, written as a whole, and gain a key whenever a new
 * kind of news is invented. `server/notifications/prefs.ts` is the shape, and
 * reads it leniently — somebody who has never opened the settings screen has
 * every default and nothing stored.
 */
export const notificationPrefs = pgTable('notification_prefs', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  prefs: jsonb('prefs').notNull().default({}),
  /** The last day a digest actually went out, so one is never sent twice. */
  lastDigestOn: date('last_digest_on'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

/**
 * The organisation's own defaults, edited by an admin.
 *
 * Exactly one row: the primary key is a boolean that may only be true, so a
 * second row is a constraint violation rather than a bug nobody notices.
 */
export const workspaceSettings = pgTable('workspace_settings', {
  id: boolean('id').primaryKey().default(true),
  notificationDefaults: jsonb('notification_defaults').notNull().default({}),
  /** Master switches per channel. See 0016_channel_switches.sql. */
  channels: jsonb('channels').notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

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
/**
 * What the assistant has cost today, per person.
 *
 * Replaces an in-memory counter that reset on every cold start and was kept
 * separately by every warm instance — which on serverless is not a limit.
 */
export const aiUsage = pgTable(
  'ai_usage',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    calls: integer('calls').notNull().default(0),
    inputTokens: bigint('input_tokens', { mode: 'number' }).notNull().default(0),
    outputTokens: bigint('output_tokens', { mode: 'number' }).notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })]
);

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
