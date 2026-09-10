/** Walks the flow a person actually walks, timing each hop. */
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
const env = readFileSync('.env.local', 'utf8');
const val = (k) => env.split('\n').find((l) => l.startsWith(k + '='))?.slice(k.length + 1).trim().replace(/^["']|["']$/g, '');
const BASE = 'https://xtra-gantt.vercel.app';
const PHONE = '0525770223';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const t = async (label, run) => { const s = Date.now(); const v = await run(); const ms = Date.now() - s; console.log(`  ${label.padEnd(34)} ${String(ms).padStart(5)}ms`); return v; };

await fetch(`${BASE}/api/auth/phone-number/send-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phoneNumber: PHONE }) });
await wait(3000);
const pool = new Pool({ connectionString: val('DATABASE_URL'), max: 1 });
const { rows } = await pool.query(`select value from verifications where identifier like $1 order by created_at desc limit 1`, [`%${PHONE}%`]);
const signIn = await t('כניסה (אימות קוד)', () => fetch(`${BASE}/api/auth/phone-number/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phoneNumber: PHONE, code: String(rows[0].value).split(':')[0] }) }));
const cookie = (signIn.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
const g = (p) => fetch(`${BASE}${p}`, { headers: { cookie } }).then((r) => r.json());

const home = await t('בית (כל הבקשות במקביל)', () => Promise.all([g('/api/me'), g('/api/boards'), g('/api/boards?archived=1'), g('/api/notifications'), g('/api/users')]));
const board = home[1].data[0];
if (!board) { console.log('  אין פרויקטים — נעצר'); await pool.end(); process.exit(0); }

await t('פתיחת פרויקט + לוח שנה', () => Promise.all([g(`/api/boards/${board.id}/events?from=2026-09-01&to=2026-09-30`), g('/api/holidays?from=2026-08-30&to=2026-10-11')]));
await t('מעבר לחודש הבא', () => Promise.all([g(`/api/boards/${board.id}/events?from=2026-10-01&to=2026-10-31`), g('/api/holidays?from=2026-09-27&to=2026-11-08')]));
await t('המשימות שלי', () => g('/api/my/tasks'));

const evs = await g(`/api/boards/${board.id}/events?from=2026-01-01&to=2027-12-31`);
const ev = evs.data[0];
if (ev) {
  await t('פתיחת אירוע (פרטים + תגובות)', () => Promise.all([g(`/api/events/${ev.id}`), g(`/api/events/${ev.id}/comments`)]));
  await t('שמירת עריכה', () => fetch(`${BASE}/api/events/${ev.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ note: 'בדיקת ביצועים ' + Date.now(), version: ev.version }) }).then((r) => r.json()));
}
await t('חיפוש', () => g(`/api/boards/${board.id}/search?q=חג`));
await t('הגדרות', () => Promise.all([g('/api/my/notification-prefs'), g('/api/my/digest-preview')]));
await pool.end();
