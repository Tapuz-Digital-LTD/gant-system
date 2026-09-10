import { z } from 'zod';

/**
 * Every mutation body is parsed through one of these.
 * A field that is not listed here cannot reach the database — which is what
 * closes the mass-assignment hole where `req.body` was spread into a row.
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'כתוב את התאריך כך: YYYY-MM-DD')
  .refine((v) => {
    const [y, m, d] = v.split('-').map(Number);
    const probe = new Date(Date.UTC(y, m - 1, d));
    return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
  }, 'התאריך שבחרת לא קיים. בדוק אותו');

const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const eventCategory = z.enum(['holiday', 'campaign', 'b2b', 'social', 'operational', 'other']);
export const taskStatus = z.enum(['todo', 'in_progress', 'ready_kickoff', 'done']);
export const eventStatus = z.enum(['todo', 'in_progress', 'ready_kickoff', 'done']);
export const taskPriority = z.enum(['low', 'medium', 'high', 'urgent']);
export const datePrecision = z.enum(['day', 'month']);

export const boardCreate = z.object({
  name: trimmed(120),
  description: z.string().trim().max(1000).optional()
});

export const boardUpdate = boardCreate.partial().extend({
  archived: z.boolean().optional()
});

/**
 * The optional milestones. Each is a day or nothing — never derived from a
 * sibling, never required. Order between them is a warning shown to the person,
 * not a rule enforced here: the business rules for it are not settled, and a
 * server that rejects a legitimate plan is worse than one that lets it through.
 */
const milestones = {
  kickoffMeetingDate: isoDate.nullish(),
  workStartDate: isoDate.nullish(),
  reviewDate: isoDate.nullish(),
  freezeDate: isoDate.nullish(),
  announceDate: isoDate.nullish(),
  campaignEndDate: isoDate.nullish()
};

export const eventCreate = z
  .object({
    title: trimmed(200),
    category: eventCategory.default('campaign'),
    status: eventStatus.default('todo'),
    kickoffDate: isoDate.nullish(),
    actualDate: isoDate,
    actualPrecision: datePrecision.default('day'),
    prepMonths: z.number().int().min(0).max(12).default(0),
    ...milestones,
    note: z.string().trim().max(500).nullish(),
    description: z.string().trim().max(5000).nullish()
  })
  .refine((v) => kickoffFitsEvent(v.kickoffDate, v.actualDate, v.actualPrecision), {
    message:
      'תאריך העלייה לאוויר מאוחר מתאריך האירוע. אפשר להקדים את העלייה לאוויר, או לדחות את תאריך האירוע.',
    path: ['kickoffDate']
  });

/*
 * "During September" ends on the thirtieth, not on the first.
 *
 * A month-precision event is stored as the first of the month because a date
 * column needs a day. Comparing a go-live against that day rejected every
 * campaign going live after the 1st of its own month — which is most of them,
 * and which is a legitimate plan the server was calling an error.
 *
 * So the comparison is against the last day the event could still happen. With
 * a real day chosen, that is the day itself and the rule is unchanged.
 */
export function kickoffFitsEvent(
  kickoffDate: string | null | undefined,
  actualDate: string,
  precision: 'day' | 'month' = 'day'
): boolean {
  if (!kickoffDate) return true;
  return kickoffDate <= lastPossibleDay(actualDate, precision);
}

function lastPossibleDay(date: string, precision: 'day' | 'month'): string {
  if (precision !== 'month') return date;
  const [y, m] = date.split('-').map(Number);
  // Day 0 of the next month is the last day of this one, leap years included.
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export const eventUpdate = z.object({
  title: trimmed(200).optional(),
  category: eventCategory.optional(),
  status: eventStatus.optional(),
  kickoffDate: isoDate.nullish(),
  actualDate: isoDate.optional(),
  actualPrecision: datePrecision.optional(),
  prepMonths: z.number().int().min(0).max(12).optional(),
  ...milestones,
  note: z.string().trim().max(500).nullish(),
  description: z.string().trim().max(5000).nullish(),
  /** Required for optimistic locking; a stale value gets 409. */
  version: z.number().int().positive()
}).refine(
  // Only when the request actually carries both. A patch that touches neither
  // date has nothing to disagree about.
  (v) => v.actualDate === undefined || kickoffFitsEvent(v.kickoffDate, v.actualDate, v.actualPrecision),
  {
    message:
      'תאריך העלייה לאוויר מאוחר מתאריך האירוע. אפשר להקדים את העלייה לאוויר, או לדחות את תאריך האירוע.',
    path: ['kickoffDate']
  }
);

export const taskCreate = z.object({
  title: trimmed(200),
  description: z.string().trim().max(5000).nullish(),
  status: taskStatus.default('todo'),
  priority: taskPriority.default('medium'),
  assigneeId: z.string().uuid().nullish(),
  startDate: isoDate.nullish(),
  endDate: isoDate.nullish(),
  dueDate: isoDate.nullish()
});

export const taskUpdate = taskCreate.partial().extend({
  version: z.number().int().positive()
});

export const commentCreate = z.object({
  body: trimmed(4000),
  taskId: z.string().uuid().nullish()
});

/** Windowed timeline read — the client asks for a range, never the whole board. */
export const timelineQuery = z.object({
  from: isoDate,
  to: isoDate
}).refine((v) => v.from <= v.to, { message: 'תאריך הסיום צריך להיות אחרי תאריך ההתחלה', path: ['from'] });

export const uuidParam = z.string().uuid('משהו בפרטים לא הסתדר. רענן את הדף ונסה שוב');

export const memberRole = z.enum(['admin', 'editor', 'viewer']);
export const boardRole = z.enum(['editor', 'viewer']);

export const personCreate = z.object({
  email: z.string().trim().toLowerCase().email('נראה שחסר משהו בכתובת. בדוק שיש @').max(200),
  name: z.string().trim().max(120).optional(),
  role: memberRole.default('editor'),
  /** A guest sees only the boards granted to them; staff see the workspace. */
  isGuest: z.boolean().default(false)
});

export const personUpdate = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: memberRole.optional()
});

/** Empty string clears it — a person taking their number back out is a save, not a delete. */
export const phoneInput = z.object({ phone: z.string().trim().max(30).nullable() });

/* Partial on purpose: the screen sends the one switch that was just moved. */
export const channelSwitches = z
  .object({ assignment: z.boolean(), digest: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'לא נשלח שום שינוי');

export const checklistCreate = z.object({ text: trimmed(200) });
export const checklistUpdate = z.object({
  text: trimmed(200).optional(),
  done: z.boolean().optional()
});

/**
 * A link, and only over http.
 *
 * `javascript:` and `data:` URLs in an href are a script somebody else runs in
 * your session — the scheme check is the whole defence and it belongs here,
 * where every other input is already cleaned.
 */
export const attachmentCreate = z.object({
  title: z.string().trim().max(120).optional(),
  url: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .refine((u) => /^https?:\/\//i.test(u), 'הקישור צריך להתחיל ב-http או https')
});

export const boardGrant = z.object({
  userId: z.string().uuid(),
  role: boardRole.default('viewer')
});

export const boardDuplicate = z.object({ name: z.string().trim().min(1).max(120).optional() });

export const permissionUpdate = z.object({
  role: memberRole,
  permission: z.string().trim().min(1).max(64),
  allowed: z.boolean()
});

/**
 * An uploaded workbook, and what to do with what is in it.
 *
 * The file rides along on both calls on purpose: nothing is stored between the
 * preview and the commit, so there is no half-finished import sitting in a
 * table, no expiry to get wrong, and nothing for a second browser tab to
 * corrupt. The plan is derived from the file on the server both times — the
 * client sends decisions, never data.
 */
const importFile = {
  fileName: z.string().trim().min(1).max(260),
  /** base64. 25MB of body is roughly an 18MB workbook. */
  fileBase64: z.string().min(1).max(25_000_000)
};

/**
 * The sheet-to-board mapping, as the person on the screen left it.
 *
 * A workbook is a set of sheets and each sheet is a board. Sending the mapping
 * on both calls is what makes it impossible to import a whole workbook into one
 * board without having seen that happen first.
 */
const sheetChoice = z.object({
  sheet: z.string().trim().min(1).max(120),
  boardName: z.string().trim().min(1).max(120).optional(),
  /** An existing board to add to, instead of creating one. */
  boardId: z.string().uuid().nullish(),
  include: z.boolean().optional()
});

/** Decisions a person has made so far. The preview is recomputed with them. */
const importDecisions = {
  sheets: z.array(sheetChoice).max(50).default([]),
  /** `${planKey}:${field}` for rule-based suggestions the person ticked. */
  accepted: z.array(z.string().max(400)).max(4000).default([]),
  /** The same, for file-supplied repairs they un-ticked. */
  rejected: z.array(z.string().max(400)).max(4000).default([]),
  /** Plan keys of events they chose to leave out. */
  excluded: z.array(z.string().max(400)).max(4000).default([])
};

export const importPreview = z.object({
  ...importFile,
  ...importDecisions
});

export const importCommit = z.object({
  ...importFile,
  ...importDecisions,
  /**
   * What the screen said would happen. The server re-derives the plan and
   * refuses if the counts moved — a file swapped between the preview and the
   * button is an import nobody actually approved. `boards` is in there because
   * importing three sheets into three boards and importing them into one are
   * different acts, and the number is what tells them apart.
   */
  expect: z.object({
    boards: z.number().int().min(0),
    create: z.number().int().min(0),
    update: z.number().int().min(0)
  })
});

export const searchQuery = z.object({ q: z.string().trim().min(2, 'צריך לפחות 2 תווים').max(100) });

/** Marking one as read, or all of them when no id is given. */
export const notificationRead = z.object({
  id: z.string().uuid().nullish()
});

/** Notification preferences, as a screen sends them. Values are clamped on read. */
export const notificationPrefsInput = z.object({
  email: z.enum(['digest', 'off']).optional(),
  sms: z.enum(['off', 'urgent']).optional(),
  digestHour: z.number().int().min(0).max(23).optional(),
  digestDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  stalledAfterDays: z.number().int().min(0).max(30).optional(),
  dueBeforeDays: z.number().int().min(0).max(14).optional(),
  overdue: z.boolean().optional(),
  milestoneBeforeDays: z.number().int().min(0).max(30).optional(),
  managerScope: z.enum(['none', 'team', 'all']).optional()
});
