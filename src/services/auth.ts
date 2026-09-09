import { createAuthClient } from 'better-auth/react';
import { emailOTPClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [emailOTPClient()]
});

export interface AuthConfig {
  /** False means codes are only written to the server log, not emailed. */
  mailConfigured: boolean;
  staffDomain: string | null;
}

/** What sign-in methods this deployment actually has wired. */
export async function fetchAuthConfig(): Promise<AuthConfig> {
  const res = await fetch('/api/auth-config');
  if (!res.ok) throw new Error('auth config unavailable');
  return (await res.json()).data;
}

export interface Me {
  id: string;
  email: string;
  name: string;
  isGuest: boolean;
  isOwner: boolean;
  role: 'admin' | 'editor' | 'viewer';
  /** Israeli mobile, or null. Only ever this person's own. */
  phone: string | null;
  /** Resolved on the server — the client never infers capability from the role. */
  permissions: string[];
}

/** Null means signed out — not an error. */
export async function fetchMe(): Promise<Me | null> {
  const res = await fetch('/api/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('identity unavailable');
  return (await res.json()).data;
}
