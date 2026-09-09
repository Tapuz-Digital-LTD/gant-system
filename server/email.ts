import { sendEmail, deliveryMode } from './notifications/inforu.js';

/**
 * Sending a sign-in code.
 *
 * One provider, Inforu, for every message this system sends. There is no SMTP
 * fallback and no second mail service: a fallback nobody tests is a path that
 * fails on the day the first one does, and two providers means two sender
 * reputations, two quotas and two places to look when a code does not arrive.
 *
 * A sign-in code has its own switch, separate from the reminders one, because
 * the two carry different risk. Somebody staring at the login screen asked for
 * this message thirty seconds ago; a reminder at eight in the morning did not.
 * Turning on login mail must not turn on everything else, and vice versa.
 *
 * With the switch off the code is written to the log and the sign-in screen
 * says so plainly. It never claims a mail went out that did not.
 */

/** True when a real sign-in email would actually leave the building. */
export function isMailConfigured(): boolean {
  return deliveryMode() !== 'unconfigured' && process.env.GANTT_AUTH_SEND === 'true';
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

export async function sendSignInCode(email: string, code: string): Promise<void> {
  if (!isMailConfigured()) {
    /*
     * Not sent, and said so.
     *
     * Printed at `warn` and unmissably, because a developer who misses this
     * line spends the next twenty minutes looking in a mailbox.
     */
    console.warn(
      JSON.stringify({
        level: 'warn',
        msg: 'signin_code_not_sent',
        reason: deliveryMode() === 'unconfigured' ? 'inforu_not_configured' : 'GANTT_AUTH_SEND!=true',
        email,
        code
      })
    );
    return;
  }

  const result = await sendEmail({
    to: email,
    subject: `${code} — קוד הכניסה שלך`,
    html: codeEmail(code),
    text: `קוד הכניסה שלך לתכנון האירועים: ${code}. תקף ל-10 דקות.`
  });

  // Thrown, not swallowed: better-auth turns this into "we could not send the
  // code", which is true, than into a screen that says to check an inbox that
  // will stay empty.
  if (!result.ok) throw new Error(`sign-in code not sent: ${result.error ?? 'unknown'}`);
}
