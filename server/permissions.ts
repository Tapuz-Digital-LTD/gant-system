/**
 * The capability list.
 *
 * Roles are not hard-coded into route handlers any more — each handler asks for
 * a named capability, and the answer comes from `role_permissions`, which the
 * workspace owner can edit. Adding a capability here and using it in a route is
 * all it takes for it to appear in the settings screen.
 */

export const PERMISSIONS = [
  { key: 'event.create', label: 'צור אירועים', group: 'אירועים' },
  { key: 'event.edit', label: 'עריכת אירועים', group: 'אירועים' },
  { key: 'event.delete', label: 'מחיקת אירועים', group: 'אירועים' },
  { key: 'event.restore', label: 'שחזור מהארכיון', group: 'אירועים' },
  { key: 'event.purge', label: 'מחיקה סופית מהארכיון (אין שחזור)', group: 'אירועים' },

  { key: 'task.create', label: 'הוספת משימות', group: 'משימות' },
  { key: 'task.edit', label: 'עריכת משימות ושינוי סטטוס', group: 'משימות' },
  { key: 'task.delete', label: 'מחיקת משימות', group: 'משימות' },

  { key: 'comment.create', label: 'כתיבת תגובות', group: 'תקשורת' },

  { key: 'board.create', label: 'יצירת לוח', group: 'לוחות' },
  { key: 'board.edit', label: 'שנה שם ותיאור של לוח', group: 'לוחות' },
  { key: 'board.duplicate', label: 'שכפול לוח', group: 'לוחות' },
  { key: 'board.delete', label: 'העברת לוח לארכיון והחזרה ממנו', group: 'לוחות' },
  { key: 'board.purge', label: 'מחיקת לוח לצמיתות מהארכיון (אין שחזור)', group: 'לוחות' },

  { key: 'export.run', label: 'הורדה והדפסה לאקסל וגיבוי', group: 'נתונים' },
  { key: 'activity.view', label: 'צפייה בלבד ביומן הפעילות', group: 'נתונים' },

  { key: 'people.manage', label: 'הוספה והסרה של אנשים', group: 'ניהול' },
  { key: 'permissions.manage', label: 'שינוי ההרשאות עצמן', group: 'ניהול' }
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];
export type Role = 'admin' | 'editor' | 'viewer';

/** Applied on a fresh database, and to any capability added later. */
export const DEFAULTS: Record<Role, PermissionKey[]> = {
  admin: PERMISSIONS.map((p) => p.key),
  editor: [
    'event.create',
    'event.edit',
    'event.delete',
    'event.restore',
    // 'event.purge' is deliberately absent: an editor may archive, and an
    // archive that anyone can empty is not an archive. An admin can grant it.

    'task.create',
    'task.edit',
    'task.delete',
    'comment.create',
    'board.create',
    'board.edit',
    'board.duplicate',
    // 'board.delete' and 'board.purge' are absent for the same reason
    // 'event.purge' is: finishing somebody else's project, or emptying the
    // archive, is an admin's call. An admin can grant either.
    'export.run',
    'activity.view'
  ],
  viewer: ['export.run', 'activity.view']
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'מנהל',
  editor: 'עורך',
  viewer: 'צופה'
};
