/**
 * Inforu — the same provider XTRA Sign uses, on this system's own credentials.
 *
 * Shape taken from the working client in XTRA Sign
 * (`src/server/notifications/inforu.ts`): same host, same single `Authorization`
 * header, same `StatusId === 1` success contract on both endpoints.
 *
 * TWO DELIBERATE DIVERGENCES:
 *
 *  1. Its own environment variables (`GANTT_INFORU_*`). Sharing an account is
 *     fine; sharing a variable name is not. The day somebody rotates a key or
 *     changes a sender for XTRA Sign, this system must not silently change with
 *     it — and must never be able to change XTRA Sign either.
 *
 *  2. Sending is opt-in, not opt-out. XTRA Sign sends unless told to log;
 *     this logs unless told to send. An accidental deploy of a half-finished
 *     reminder rule should cost a log line, not a text message to the whole
 *     marketing department at six in the morning.
 */

const SMS_PATH = '/v2/SMS/SendSms';
const EMAIL_PATH = '/Umail/Message/Send';

const TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [500, 2000];

export interface SendResult {
  ok: boolean;
  /** Inforu's RequestId, when it gave one — the handle for chasing a delivery. */
  providerMessageId: string | null;
  error?: string;
}

export type DeliveryMode = 'send' | 'log' | 'unconfigured';

/**
 * Why this message is going out — and therefore which switch governs it.
 *
 * A sign-in code was asked for thirty seconds ago by somebody staring at a
 * login screen. A reminder at eight in the morning was not. They carry
 * different risk, so they get different switches, and this is the parameter
 * that keeps one from silently answering for the other.
 */
export type SendPurpose = 'auth' | 'notification';

const SWITCH: Record<SendPurpose, string> = {
  auth: 'GANTT_AUTH_SEND',
  notification: 'GANTT_NOTIFICATIONS_SEND'
};

/**
 * Which of the three worlds this process is in.
 *
 * It matters because real credentials leak between them by accident: a
 * developer pulls production environment variables to debug something, and from
 * then on every local run of the test suite can text real employees. The
 * environment decides, and the safe answer is the default.
 */
function environment(): 'production' | 'development' | 'test' {
  if (process.env.NODE_ENV === 'test' || process.env.GANTT_TEST === 'true') return 'test';

  /*
   * An explicit answer wins, and the local server gives one.
   *
   * This is not belt and braces, it is the fix for a real trap: `vercel env
   * pull` writes VERCEL_ENV="production" into .env.local, so a laptop that has
   * ever pulled production variables then identifies itself as production. The
   * dev script says what it is, and nothing in a downloaded file can contradict
   * it.
   */
  if (process.env.GANTT_ENV === 'development') return 'development';
  if (process.env.GANTT_ENV === 'production') return 'production';

  /*
   * Otherwise: really on Vercel, in the production environment.
   *
   * VERCEL=1 is set by the runtime and not by the env file, so the pair is only
   * true where the code is genuinely deployed.
   */
  if (process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production') return 'production';
  if (process.env.NODE_ENV === 'production' && !process.env.VERCEL_ENV) return 'production';

  return 'development';
}

function credentials() {
  return {
    baseUrl: process.env.GANTT_INFORU_API_URL?.replace(/\/+$/, '') ?? '',
    auth: process.env.GANTT_INFORU_AUTH ?? ''
  };
}

/**
 * What would actually happen if something were sent right now.
 *
 * Three states, not a boolean, because "nothing was sent" has two very
 * different causes and the settings screen has to be able to say which.
 */
export function deliveryMode(purpose: SendPurpose): DeliveryMode {
  const { baseUrl, auth } = credentials();
  if (!baseUrl || !auth) return 'unconfigured';

  /*
   * A test never sends. Not configurable, not overridable.
   *
   * There is no legitimate reason for a suite run to text somebody, and the
   * point of a rule like this is that it holds on the day a real key happens to
   * be in the environment for some other reason.
   *
   * Checked after the credentials so the three states stay honest: the settings
   * screen distinguishes "no provider" from "provider, sending off", and a test
   * that flattened them would be testing a different function.
   */
  if (environment() === 'test') return 'log';

  /*
   * Outside production, sending takes a second, deliberate key.
   *
   * `GANTT_AUTH_SEND` is set in production and travels in a pulled .env file,
   * so on its own it would quietly re-enable real messages on a laptop. Sending
   * for real from a development machine is a rare, considered act — it should
   * cost one more variable, named so nobody sets it by accident.
   */
  if (environment() !== 'production' && process.env.GANTT_ALLOW_REAL_SEND !== 'yes-really') {
    return 'log';
  }

  return process.env[SWITCH[purpose]] === 'true' ? 'send' : 'log';
}

/** True where a code may be shown on screen instead of being delivered. */
export function showsCodesOnScreen(): boolean {
  return environment() !== 'production' && deliveryMode('auth') !== 'send';
}

/**
 * Israeli mobile as Inforu wants it: `0501234567`.
 *
 * Null rather than a best guess. The same number arrives spelled `050-123-4567`,
 * `+972501234567` and `0501234567`; anything keyed on the raw string quietly
 * splits into separate people.
 */
export function israeliMobile(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null;

  const trimmed = input.trim();
  const hadPlus = trimmed.startsWith('+');
  // Strips spaces, hyphens, parentheses — and the RTL marks a Hebrew form
  // quietly injects into anything typed next to Hebrew text.
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('00972')) digits = digits.slice(5);
  else if (hadPlus && digits.startsWith('972')) digits = digits.slice(3);
  else if (digits.startsWith('972') && digits.length >= 12) digits = digits.slice(3);
  else if (digits.startsWith('0')) digits = digits.slice(1);

  if (digits.length !== 9) return null;
  if (!/^5[0-9]/.test(digits)) return null;
  return `0${digits}`;
}

interface InforuResponse {
  StatusId?: number;
  StatusDescription?: string;
  DetailedDescription?: string;
  RequestId?: string;
}

/**
 * POSTs to Inforu and turns every outcome into a SendResult.
 *
 * Never throws. A reminder that failed to go out must not take down the request
 * that produced it — the caller decides what a failed delivery means, and for a
 * reminder the answer is "note it and carry on".
 */
async function post(path: string, body: unknown): Promise<SendResult> {
  const { baseUrl, auth } = credentials();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: auth },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });

      // 4xx is our own bug or a rejected recipient. Sending the same bad
      // request twice more only spends the quota faster.
      if (!response.ok && response.status < 500) {
        return { ok: false, error: `Inforu ${response.status} ${response.statusText}`, providerMessageId: null };
      }

      if (response.ok) {
        const data = (await response.json()) as InforuResponse;
        if (data.StatusId === 1) {
          /*
           * A send that worked leaves a line too.
           *
           * Without it the only evidence of delivery is the absence of an
           * error, and "nothing in the log" is equally consistent with the
           * code never having run. The RequestId is the handle Inforu support
           * asks for when a message did not arrive.
           */
          console.log(
            JSON.stringify({ level: 'info', msg: 'inforu_sent', path, requestId: data.RequestId ?? null })
          );
          return { ok: true, providerMessageId: data.RequestId ?? null };
        }
        return {
          ok: false,
          error: `Inforu StatusId=${data.StatusId} ${data.StatusDescription ?? ''}`.trim(),
          providerMessageId: data.RequestId ?? null
        };
      }
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Inforu request failed',
          providerMessageId: null
        };
      }
    }

    if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 1]));
  }

  return { ok: false, error: 'Inforu unreachable', providerMessageId: null };
}

/**
 * Not sending, and saying so.
 *
 * `ok: false` is the point. Logging and returning success makes a log-only
 * deployment look exactly like a working one, and then a screen says "נשלח"
 * about a message that never left the process.
 */
function logInstead(channel: 'sms' | 'email', purpose: SendPurpose, to: string, text: string): SendResult {
  const reason =
    deliveryMode(purpose) === 'unconfigured' ? 'inforu_not_configured' : `${SWITCH[purpose]}!=true`;
  console.log(JSON.stringify({ level: 'info', msg: 'notification_not_sent', channel, to, reason, text }));
  return { ok: false, error: `not_sent:${reason}`, providerMessageId: null };
}

export async function sendSms(to: string, text: string, purpose: SendPurpose): Promise<SendResult> {
  const phone = israeliMobile(to);
  if (!phone) return { ok: false, error: 'invalid_phone', providerMessageId: null };

  if (deliveryMode(purpose) !== 'send') return logInstead('sms', purpose, phone, text);

  return post(SMS_PATH, {
    Data: {
      Message: text,
      Recipients: [{ Phone: phone }],
      Settings: { Sender: process.env.GANTT_SMS_SENDER ?? 'Xtra' }
    }
  });
}

export async function sendEmail(opts: {
  to: string;
  name?: string;
  subject: string;
  html: string;
  text: string;
  purpose: SendPurpose;
}): Promise<SendResult> {
  if (deliveryMode(opts.purpose) !== 'send') return logInstead('email', opts.purpose, opts.to, opts.text);

  // Inforu derives CampaignRefId from CampaignName, and rejects a repeat.
  const campaign = `gantt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return post(EMAIL_PATH, {
    CampaignName: campaign,
    CampaignRefId: campaign.replace(/-/g, ' '),
    FromAddress: process.env.GANTT_EMAIL_SENDER ?? 'services@xtra.co.il',
    FromName: process.env.GANTT_EMAIL_SENDER_NAME ?? 'XTRA',
    Subject: opts.subject,
    Body: opts.html,
    IncludeContacts: [{ Email: opts.to, FirstName: opts.name ?? '' }]
  });
}
