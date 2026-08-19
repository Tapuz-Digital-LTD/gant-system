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

export const eventCreate = z
  .object({
    title: trimmed(200),
    category: eventCategory.default('campaign'),
    status: eventStatus.default('todo'),
    kickoffDate: isoDate.nullish(),
    actualDate: isoDate,
    actualPrecision: datePrecision.default('day'),
    prepMonths: z.number().int().min(0).max(12).default(0),
    note: z.string().trim().max(500).nullish(),
    description: z.string().trim().max(5000).nullish()
  })
  .refine((v) => !v.kickoffDate || v.kickoffDate <= v.actualDate, {
    message: 'תאריך תאריך התנעה לא יכול להיות אחרי תאריך אמת',
    path: ['kickoffDate']
  });

export const eventUpdate = z.object({
  title: trimmed(200).optional(),
  category: eventCategory.optional(),
  status: eventStatus.optional(),
  kickoffDate: isoDate.nullish(),
  actualDate: isoDate.optional(),
  actualPrecision: datePrecision.optional(),
  prepMonths: z.number().int().min(0).max(12).optional(),
  note: z.string().trim().max(500).nullish(),
  description: z.string().trim().max(5000).nullish(),
  /** Required for optimistic locking; a stale value gets 409. */
  version: z.number().int().positive()
});

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

export const searchQuery = z.object({ q: z.string().trim().min(2, 'צריך לפחות 2 תווים').max(100) });
