// One message, to one recipient you name on the command line.
//
//   npx tsx server/notifications/send-test.ts 0525770223 "בדיקה"
//   npx tsx server/notifications/send-test.ts tomer@xtra.co.il "בדיקה"
//
// There is no "send to everybody" here and there is no default recipient. The
// address has to be typed every time, because the whole risk of this file is
// somebody running it once without reading it.
import { deliveryMode, sendEmail, sendSms } from './inforu.ts';

const [to, ...rest] = process.argv.slice(2);
const text = rest.join(' ') || 'בדיקת חיבור מהמערכת. אפשר להתעלם.';

if (!to) {
  console.error('שימוש: npx tsx server/notifications/send-test.ts <טלפון או מייל> [טקסט]');
  process.exit(1);
}

const mode = deliveryMode('notification');
console.log(`מצב שליחה: ${mode}`);
if (mode !== 'send') {
  console.log('שום דבר לא ייצא החוצה — ההודעה תיכתב ללוג בלבד.');
  console.log('להפעלה אמיתית צריך GANTT_INFORU_API_URL, GANTT_INFORU_AUTH ו-GANTT_NOTIFICATIONS_SEND=true.');
}

const isEmail = to.includes('@');
const result = isEmail
  ? await sendEmail({
      to,
      subject: 'בדיקת חיבור — מערכת תכנון האירועים',
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px">${text}</div>`,
      text,
      purpose: 'notification'
    })
  : await sendSms(to, text, 'notification');

console.log(JSON.stringify({ channel: isEmail ? 'email' : 'sms', to, ...result }, null, 2));
process.exit(result.ok ? 0 : 1);
