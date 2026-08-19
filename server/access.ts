import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from './db/client.js';
import type { Repo } from './db/repo.js';
import type { PermissionKey } from './permissions.js';
import { users } from './db/schema.js';

/**
 * Authorisation, in one file.
 *
 * The rule that closes the whole IDOR family: scope always comes from the
 * session, never from the request body or query. A caller can name any board id
 * they like — `assertBoardAccess` decides whether it exists *for them*.
 */

export type Role = 'admin' | 'editor' | 'viewer';
export type BoardRole = 'editor' | 'viewer';

export interface Actor {
  id: string;
  email: string;
  name: string;
  /** Staff see every board. Guests see only what `board_members` grants. */
  isGuest: boolean;
  /** The workspace owner bypasses every permission check and cannot be removed. */
  isOwner: boolean;
  role: Role;
}

export class UnauthenticatedError extends Error {
  constructor() {
    super('צריך להתחבר כדי להמשיך');
    this.name = 'UnauthenticatedError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'אין לך גישה לפעולה הזו') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/** A board a guest was never invited to must look absent, not protected. */
export class HiddenError extends Error {
  constructor(message = 'לא מצאנו את מה שחיפשת') {
    super(message);
    this.name = 'HiddenError';
  }
}

export function requireActor(actor: Actor | null): Actor {
  if (!actor) throw new UnauthenticatedError();
  return actor;
}

/**
 * The single gate every route uses.
 * The owner is exempt: they must always be able to repair a permission set
 * that has been switched off by mistake.
 */
export async function requirePermission(
  repo: Repo,
  actor: Actor | null,
  permission: PermissionKey,
  what: string
): Promise<Actor> {
  const a = requireActor(actor);
  if (a.isOwner) return a;
  if (!(await repo.can(a.role, permission))) {
    throw new ForbiddenError(`אין לך הרשאה ל${what}`);
  }
  return a;
}

export function requireOwnerSafe(actor: Actor, targetIsOwner: boolean, action: string): void {
  if (targetIsOwner) throw new ForbiddenError(`אי אפשר ${action} את המנהל הראשי`);
}

export async function loadActor(db: Database, userId: string): Promise<Actor | null> {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      isGuest: users.isGuest,
      isOwner: users.isOwner,
      role: users.role
    })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)));

  return row ?? null;
}

/** Throws `HiddenError` — a 404 — when a guest asks about a board they cannot see. */
export async function assertBoardRead(repo: Repo, actor: Actor, boardId: string): Promise<void> {
  if ((await repo.boardRoleFor(actor, boardId)) === 'none') throw new HiddenError('לא מצאנו את הלוח. רענן את הדף ונסה שוב');
}

export async function assertBoardWrite(repo: Repo, actor: Actor, boardId: string): Promise<void> {
  const role = await repo.boardRoleFor(actor, boardId);
  if (role === 'none') throw new HiddenError('לא מצאנו את הלוח. רענן את הדף ונסה שוב');
  if (role === 'viewer') throw new ForbiddenError('אפשר לצפות בלוח הזה, אבל לא לערוך');
}
