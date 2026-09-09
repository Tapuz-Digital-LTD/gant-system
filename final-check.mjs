import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
const env = readFileSync('.env.local', 'utf8');
const val = (k) => env.split('\n').find((l) => l.startsWith(k + '='))?.slice(k.length + 1).trim().replace(/^["']|["']$/g, '');
const BASE = 'https://xtra-gantt.vercel.app';
const EMAIL = 'tomer@xtra.co.il';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// better-auth rate-limits repeated sends; wait it out rather than fight it.
let status = 0;
for (let i = 0; i < 20 && status !== 200; i++) {
  const r = await fetch(`${BASE}/api/auth/email-otp/send-verification-otp`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, type: 'sign-in' })
  });
  status = r.status;
  if (status !== 200) await wait(20_000);
}
console.log(`שליחת קוד במייל: HTTP ${status}`);
await wait(3000);

const pool = new Pool({ connectionString: val('DATABASE_URL'), max: 1 });
const { rows } = await pool.query(`select value from verifications where identifier like $1 order by created_at desc limit 1`, [`%${EMAIL}%`]);
const signIn = await fetch(`${BASE}/api/auth/sign-in/email-otp`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, otp: String(rows[0].value).split(':')[0] })
});
const cookie = (signIn.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
const me = await fetch(`${BASE}/api/me`, { headers: { cookie } }).then((r) => r.json());
console.log(`כניסה: HTTP ${signIn.status} · מחובר כ-${me.data?.name} (${me.data?.role})`);

const board = await fetch(`${BASE}/api/boards`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
  body: JSON.stringify({ name: 'בדיקת מערכת', description: 'נמחק בסוף הבדיקה' })
}).then((r) => r.json());
console.log(`יצירת פרויקט: ${board.data?.name ? '✓' : '✗'}`);

const ev = await fetch(`${BASE}/api/boards/${board.data.id}/events`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
  body: JSON.stringify({ title: 'מבצע ספטמבר', actualDate: '2026-09-01', actualPrecision: 'month', kickoffDate: '2026-09-11', prepMonths: 1 })
}).then((r) => r.json());
console.log(`אירוע "במהלך חודש" + עלייה לאוויר ב-11 (התקלה שדיווחת): ${ev.data?.id ? '✓ נשמר' : '✗ ' + JSON.stringify(ev.error)}`);

const task = await fetch(`${BASE}/api/events/${ev.data.id}/tasks`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
  body: JSON.stringify({ title: 'משימת בדיקה', dueDate: '2026-09-05' })
}).then((r) => r.json());
console.log(`יצירת משימה: ${task.data?.id ? '✓' : '✗'}`);

const moved = await fetch(`${BASE}/api/tasks/${task.data.id}`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie },
  body: JSON.stringify({ assigneeId: me.data.id, status: 'in_progress', version: task.data.version })
}).then((r) => r.json());
console.log(`שיוך + שינוי מצב: ${moved.data?.assigneeId ? '✓' : '✗'}`);

const notes = await fetch(`${BASE}/api/notifications`, { headers: { cookie } }).then((r) => r.json());
console.log(`התראת שיוך: ${notes.data?.items?.length > 0 ? '✓ ' + notes.data.items.length + ' בפעמון' : '✗'}`);

const prefs = await fetch(`${BASE}/api/my/notification-prefs`, { headers: { cookie } }).then((r) => r.json());
console.log(`הגדרות התראות: ${prefs.data?.digestHour !== undefined ? '✓ סיכום ב-' + prefs.data.digestHour + ':00' : '✗'}`);

const preview = await fetch(`${BASE}/api/my/digest-preview`, { headers: { cookie } }).then((r) => r.json());
console.log(`תצוגה מקדימה של הסיכום: ${preview.data ? '✓' : '✗'}`);

const t0 = Date.now();
const ai = await fetch(`${BASE}/api/ai/suggest-tasks`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
  body: JSON.stringify({ eventTitle: 'מבצע פסח לחברות', category: 'campaign', prepMonths: 2 })
}).then((r) => r.json());
console.log(`AI: ${((Date.now() - t0) / 1000).toFixed(1)} שניות · ${ai.data?.recommendedTasks?.length ?? 0} משימות`);
for (const t of ai.data?.recommendedTasks ?? []) console.log(`   · ${t.title} — ${t.description}`);

await fetch(`${BASE}/api/boards/${board.data.id}`, { method: 'DELETE', headers: { cookie } });
const arch = await fetch(`${BASE}/api/boards?archived=1`, { headers: { cookie } }).then((r) => r.json());
console.log(`ארכוב: ${arch.data?.some((b) => b.id === board.data.id) ? '✓ במדף' : '✗'}`);
await fetch(`${BASE}/api/boards/${board.data.id}/restore`, { method: 'POST', headers: { cookie } });
const active = await fetch(`${BASE}/api/boards`, { headers: { cookie } }).then((r) => r.json());
console.log(`החזרה מהארכיון: ${active.data?.some((b) => b.id === board.data.id) ? '✓ פעיל' : '✗'}`);

await fetch(`${BASE}/api/boards/${board.data.id}`, { method: 'DELETE', headers: { cookie } });
const purge = await fetch(`${BASE}/api/boards/${board.data.id}/permanent`, { method: 'DELETE', headers: { cookie } });
console.log(`ניקוי פרויקט הבדיקה: HTTP ${purge.status}`);
const final = await fetch(`${BASE}/api/boards`, { headers: { cookie } }).then((r) => r.json());
console.log(`פרויקטים שנשארו בפרודקשן: ${final.data?.length ?? '?'}`);
await pool.end();
