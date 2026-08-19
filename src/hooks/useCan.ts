import { UserAccess, Capability } from '../types';

/**
 * The one question the UI asks before showing an action.
 *
 * Answers come from the server's resolved list, not from the role — so a
 * capability switched off in the permissions screen disappears from the
 * interface immediately, and a button never appears that would only 403.
 */
export function makeCan(user: UserAccess | null) {
  const granted = new Set(user?.permissions ?? []);
  return (capability: Capability): boolean => granted.has(capability);
}

export type Can = ReturnType<typeof makeCan>;
