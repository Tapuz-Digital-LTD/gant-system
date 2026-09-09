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
export function deliveryMode(): DeliveryMode {
  const { baseUrl, auth } = credentials();
  if (!baseUrl || !auth) return 'unconfigured';
  return process.env.GANTT_NOTIFICATIONS_SEND === 'true' ? 'send' : 'log';
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
        if (data.StatusId === 1) return { ok: true, providerMessageId: data.RequestId ?? null };
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
function logInstead(channel: 'sms' | 'email', to: string, text: string): SendResult {
  const reason = deliveryMode() === 'unconfigured' ? 'inforu_not_configured' : 'GANTT_NOTIFICATIONS_SEND!=true';
  console.log(JSON.stringify({ level: 'info', msg: 'notification_not_sent', channel, to, reason, text }));
  return { ok: false, error: `not_sent:${reason}`, providerMessageId: null };
}

export async function sendSms(to: string, text: string): Promise<SendResult> {
  const phone = israeliMobile(to);
  if (!phone) return { ok: false, error: 'invalid_phone', providerMessageId: null };

  if (deliveryMode() !== 'send') return logInstead('sms', phone, text);

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
}): Promise<SendResult> {
  if (deliveryMode() !== 'send') return logInstead('email', opts.to, opts.text);

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
