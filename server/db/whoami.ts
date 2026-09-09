/**
 * Proves where the data actually lives before anyone trusts a test run.
 * Prints the storage in use, and refuses to look friendly if it is remote.
 */
import dotenv from 'dotenv';
import { sql } from 'drizzle-orm';
import { initDb, closeDb } from './client.js';
import { boards, events } from './schema.js';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });

const url = process.env.DATABASE_URL;
const remote = Boolean(url);

console.log(remote ? '⚠️  מסד נתונים מרוחק' : '✅ מסד נתונים מקומי בלבד (PGlite, .data/pg)');
console.log(`   DATABASE_URL: ${url ? url.replace(/\/\/[^@]*@/, '//***@') : '(ריק — אין חיבור החוצה)'}`);

const db = await initDb();
const [b] = await db.select({ n: sql<number>`count(*)::int` }).from(boards);
const [e] = await db.select({ n: sql<number>`count(*)::int` }).from(events);
console.log(`   לוחות: ${b.n} · אירועים: ${e.n}`);
await closeDb();

if (remote) process.exit(1);
