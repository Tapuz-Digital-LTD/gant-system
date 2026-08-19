import nodemailer from 'nodemailer';

/**
 * Sending a sign-in code.
 *
 * Two supported transports, checked in this order:
 *
 *  1. SMTP (SMTP_USER + SMTP_PASS) — sends from a mailbox you already own, so
 *     it needs no DNS changes. With Gmail this means an App Password.
 *  2. Resend (RESEND_API_KEY) — needs a verified domain, but scales properly.
 *
 * With neither configured the code is logged and the sign-in screen says so.
 * It never claims a mail went out that didn't.
 */

type Transport = 'smtp' | 'resend' | 'none';

function activeTransport(): Transport {
  if (process.env.SMTP_USER && process.env.SMTP_PASS) return 'smtp';
  if (process.env.RESEND_API_KEY) return 'resend';
  return 'none';
}

export function isMailConfigured(): boolean {
  return activeTransport() !== 'none';
}

function codeEmail(code: string): string {
  // Deliberately plain: one sentence, one big number, nothing to click.
  return `<!doctype html>
<html lang="he" dir="rtl"><body style="margin:0;background:#f3f5f9;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:420px;background:#fff;border-radius:12px;padding:32px;text-align:right">
        <tr><td>
          <p style="margin:0 0 8px;font-size:15px;color:#576078">קוד הכניסה שלך לתכנון האירועים</p>
          <p style="margin:0 0 24px;font-size:40px;font-weight:700;letter-spacing:8px;color:#1a1f33;direction:ltr;text-align:center">${code}</p>
          <p style="margin:0;font-size:14px;color:#848da5">הקוד תקף ל-10 דקות. אם לא ביקשת אותו, אפשר להתעלם מהמייל.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

let smtp: nodemailer.Transporter | undefined;

function smtpTransport(): nodemailer.Transporter {
  if (smtp) return smtp;
  const port = Number(process.env.SMTP_PORT ?? 465);
  smtp = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
    // Reuse one connection: opening a fresh session per message is what makes
    // Gmail drop the handshake ("Greeting never received") under quick bursts.
    pool: true,
    maxConnections: 1,
    maxMessages: 50,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000
  });
  return smtp;
}

/**
 * A dropped SMTP handshake is transient and common. Retrying once — on a fresh
 * connection — is the difference between a person getting their code and being
 * locked out for no reason.
 */
async function sendWithRetry(message: nodemailer.SendMailOptions): Promise<void> {
  try {
    await smtpTransport().sendMail(message);
  } catch (first) {
    console.warn(JSON.stringify({ level: 'warn', msg: 'smtp_retry', error: String(first) }));
    smtp?.close();
    smtp = undefined;
    await new Promise((r) => setTimeout(r, 700));
    await smtpTransport().sendMail(message);
  }
}

function fromAddress(): string {
  if (process.env.MAIL_FROM) return process.env.MAIL_FROM;
  if (process.env.SMTP_USER) return `XTRA <${process.env.SMTP_USER}>`;
  return 'XTRA <onboarding@resend.dev>';
}

export async function sendSignInCode(email: string, code: string): Promise<void> {
  const subject = `${code} — קוד הכניסה שלך`;
  const html = codeEmail(code);

  switch (activeTransport()) {
    case 'smtp':
      await sendWithRetry({ from: fromAddress(), to: email, subject, html });
      return;

    case 'resend': {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ from: fromAddress(), to: [email], subject, html })
      });
      if (!res.ok) {
        const detail = await res.text();
        console.error(JSON.stringify({ level: 'error', msg: 'otp_email_failed', status: res.status, detail }));
        throw new Error('failed to send sign-in code');
      }
      return;
    }

    default:
      console.log(JSON.stringify({ level: 'warn', msg: 'otp_not_emailed', email, code }));
  }
}

/** Proves the configured transport can actually send, before people depend on it. */
export async function verifyMailTransport(): Promise<{ transport: Transport; ok: boolean; error?: string }> {
  const transport = activeTransport();
  if (transport === 'none') return { transport, ok: false, error: 'no transport configured' };
  if (transport === 'resend') return { transport, ok: true };
  try {
    await smtpTransport().verify();
    return { transport, ok: true };
  } catch (err) {
    return { transport, ok: false, error: String(err) };
  }
}
