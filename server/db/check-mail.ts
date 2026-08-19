/**
 * Proves the configured mail transport actually works, before people depend on it.
 * Usage: npx tsx server/db/check-mail.ts [recipient]
 */
import dotenv from 'dotenv';
import { verifyMailTransport, sendSignInCode, isMailConfigured } from '../email.js';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });

if (!isMailConfigured()) {
  console.error('לא הוגדרה שליחת מייל. הגדר SMTP_USER + SMTP_PASS, או RESEND_API_KEY.');
  process.exit(1);
}

const result = await verifyMailTransport();
console.log(`ערוץ: ${result.transport}  ·  ${result.ok ? 'חיבור תקין' : 'חיבור נכשל'}`);
if (!result.ok) {
  console.error(result.error);
  process.exit(1);
}

const to = process.argv[2];
if (to) {
  await sendSignInCode(to, '123456');
  console.log(`נשלח מייל בדיקה אל ${to} (קוד דמה 123456).`);
} else {
  console.log('להוספת שליחת בדיקה: npx tsx server/db/check-mail.ts someone@example.com');
}
process.exit(0);
