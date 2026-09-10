/** Times the flows a person actually walks, against the deployed system. */
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
const env = readFileSync('.env.local', 'utf8');
const val = (k) => env.split('\n').find((l) => l.startsWith(k + '='))?.slice(k.length + 1).trim().replace(/^["']|["']$/g, '');
const BASE = 'https://xtra-gantt.vercel.app';
const PHONE = '0525770223';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await fetch(`${BASE}/api/auth/phone-number/send-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phoneNumber: PHONE }) });
await wait(3000);
const pool = new Pool({ connectionString: val('DATABASE_URL'), max: 1 });
const { rows } = await pool.query(`select value from verifications where identifier like $1 order by created_at desc limit 1`, [`%${PHONE}%`]);
const signIn = await fetch(`${BASE}/api/auth/phone-number/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phoneNumber: PHONE, code: String(rows[0].value).split(':')[0] }) });
const cookie = (signIn.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');

const me = await fetch(`${BASE}/api/me`, { headers: { cookie } }).then((r) => r.json());
const boards = await fetch(`${BASE}/api/boards`, { headers: { cookie } }).then((r) => r.json());
const board = boards.data[0];

const time = async (label, run, times = 5) => {
  await run(); // warm
  const ms = [];
  for (let i = 0; i < times; i++) { const t = Date.now(); await run(); ms.push(Date.now() - t); }
  ms.sort((a, b) => a - b);
  console.log(`  ${label.padEnd(30)} חציון ${String(ms[Math.floor(times / 2)]).padStart(5)}ms   (${ms[0]}–${ms[times - 1]}ms)`);
  return ms[Math.floor(times / 2)];
};

const get = (p) => () => fetch(`${BASE}${p}`, { headers: { cookie } }).then((r) => r.text());

console.log('\n=== מדידה ===');
const h = await fetch(`${BASE}/api/health`, { headers: { cookie } }).then((r) => r.json());
console.log(`  אזור=${h.region}  מסד=${h.dbRoundTripMs}ms  ${h.dbError ? 'שגיאה: ' + h.dbError : ''}`);
console.log('');
await time('בית: /me', get('/api/me'));
await time('בית: /boards', get('/api/boards'));
await time('בית: /boards?archived=1', get('/api/boards?archived=1'));
await time('בית: /notifications', get('/api/notifications'));
await time('משתמשים: /users', get('/api/users'));
await time('לוח שנה: /events (חודש)', get(`/api/boards/${board.id}/events?from=2026-09-01&to=2026-09-30`));
await time('לוח שנה: /holidays', get('/api/holidays?from=2026-08-30&to=2026-10-11'));
await time('משימות שלי: /my/tasks', get('/api/my/tasks'));
await time('חיפוש', get(`/api/boards/${board.id}/search?q=חג`));
await time('הגדרות: prefs', get('/api/my/notification-prefs'));
await time('הגדרות: digest-preview', get('/api/my/digest-preview'));

// The home screen as a browser actually loads it: everything at once.
console.log('');
const t0 = Date.now();
await Promise.all([get('/api/me')(), get('/api/boards')(), get('/api/boards?archived=1')(), get('/api/notifications')(), get('/api/users')()]);
console.log(`  מסך הבית במקביל (5 בקשות)   ${Date.now() - t0}ms`);
const t1 = Date.now();
await Promise.all([get(`/api/boards/${board.id}/events?from=2026-09-01&to=2026-09-30`)(), get('/api/holidays?from=2026-08-30&to=2026-10-11')()]);
console.log(`  לוח שנה במקביל (2 בקשות)     ${Date.now() - t1}ms`);
await pool.end();
