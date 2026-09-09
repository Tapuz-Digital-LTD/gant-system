import { randomUUID } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP, phoneNumber } from 'better-auth/plugins';
import { getDb, schema } from './db/client.js';
import { sendSignInCode, sendSignInSms, isMailConfigured } from './email.js';
import { israeliMobile } from './notifications/inforu.js';

/**
 * Identity only.
 *
 * Better Auth answers "who is this person and is their cookie valid".
 * It does NOT decide which boards they can see — that lives in `board_members`
 * and is enforced in `access.ts`. Keeping the two apart is deliberate: it keeps
 * us off the plugin surface where most of this library's 2026 advisories were,
 * and it makes the authorisation rules readable in one file.
 */

/**
 * Read at call time, never at module scope.
 * ES imports are hoisted above `dotenv.config()`, so a module-level
 * `process.env.X` is evaluated while the environment is still empty — which
 * silently disabled Google sign-in no matter how the keys were set.
 */
const staffDomain = () => process.env.AUTH_STAFF_DOMAIN;

function resolveBaseUrl(): string {
  if (process.env.NODE_ENV === 'production') {
    const url = process.env.APP_URL;
    if (!url) throw new Error('APP_URL is required in production');
    return url;
  }
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

function build() {
  const baseURL = resolveBaseUrl();
  return betterAuth({
    baseURL,
    secret: process.env.AUTH_SECRET ?? 'dev-only-secret-change-me',
    trustedOrigins: [baseURL],

    // usePlural maps Better Auth's singular models onto our plural table names,
    // so the schema keys must match the tables exactly.
    database: drizzleAdapter(getDb(), {
      provider: 'pg',
      usePlural: true,
      schema: {
        users: schema.users,
        sessions: schema.sessions,
        accounts: schema.accounts,
        verifications: schema.verifications
      }
    }),

    user: {
      additionalFields: {
        // Written by us, never by the sign-up payload: a new account is a guest
        // with no board access until someone grants it.
        role: { type: 'string', defaultValue: 'viewer', input: false },
        isGuest: { type: 'boolean', defaultValue: true, input: false }
      }
    },

    session: {
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
      // Avoids a database round-trip per request, which matters on serverless.
      cookieCache: { enabled: true, maxAge: 60 * 5 }
    },

    advanced: {
      database: {
        // users.id is a real uuid column; Better Auth's default nanoid-style id
        // fails the cast. Generating uuids keeps one id format across the schema.
        generateId: () => randomUUID()
      },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production'
      }
    },

    /*
     * One way in: a six-digit code to the address you already have.
     *
     * No social provider. A second route into an account is a second thing to
     * secure, a second thing to explain to somebody who does not know what
     * OAuth is, and a second reason for a login to fail on a morning when
     * nobody has time for it.
     */
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 60 * 10,
        // Three tries, then the code is dead — brute-forcing six digits must not
        // be a matter of patience.
        allowedAttempts: 3,
        // A code that is still valid after it has been used is a code somebody
        // can reuse from a forwarded email.
        disableSignUp: false,
        async sendVerificationOTP({ email, otp }) {
          await sendSignInCode(email, otp);
        }
      }),

      /*
       * The same code, to a phone.
       *
       * A person picks where the code arrives; they do not pick a weaker way
       * in. Length, expiry and the attempt budget match the email route
       * exactly, so neither is the soft option.
       *
       * `signUpOnVerification` is deliberately absent. This system is
       * invite-only: proving you hold a phone number proves you hold that
       * number, not that you belong here. An unknown number fails to sign in,
       * which is the correct outcome.
       */
      phoneNumber({
        otpLength: 6,
        expiresIn: 60 * 10,
        allowedAttempts: 3,
        // One canonical spelling, so 052-577-0223 and +972525770223 are one
        // person rather than two accounts that cannot see each other's work.
        phoneNumberValidator: (input) => israeliMobile(input) !== null,
        async sendOTP({ phoneNumber: to, code }) {
          await sendSignInSms(to, code);
        },
        // The plugin wants `phone_number`; it is pointed at the column that
        // already holds the number. Two columns for one fact is how the next
        // person writes to the wrong one.
        schema: {
          user: {
            fields: {
              phoneNumber: 'phone',
              phoneNumberVerified: 'phoneVerified'
            }
          }
        }
      })
    ]
  });
}

// Inferred from the factory: betterAuth's return type is generic over the exact
// options object, so widening it to ReturnType<typeof betterAuth> loses it.
let instance: ReturnType<typeof build> | undefined;

export function getAuth(): ReturnType<typeof build> {
  instance ??= build();
  return instance;
}

export interface AuthDescription {
  /** False means codes are only written to the server log, not emailed. */
  mailConfigured: boolean;
  staffDomain: string | null;
}

export function describeAuth(): AuthDescription {
  return {
    mailConfigured: isMailConfigured(),
    staffDomain: staffDomain() ?? null
  };
}
