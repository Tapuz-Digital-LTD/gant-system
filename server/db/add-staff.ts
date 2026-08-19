/**
 * Creates or promotes an internal staff account.
 *
 * Sign-in itself never grants privilege — a fresh account is always a guest
 * with no board access. Staff status is conferred here, by someone with
 * database access, and nowhere else.
 *
 * Usage: npx tsx server/db/add-staff.ts tomer@xtra.co.il "תומר" admin
 */
import dotenv from 'dotenv';
import { sql } from 'drizzle-orm';
import { initDb, closeDb } from './client.js';
import { users } from './schema.js';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });

const email = process.argv[2]?.trim().toLowerCase();
const name = process.argv[3]?.trim();
const role = (process.argv[4] ?? 'admin') as 'admin' | 'editor' | 'viewer';

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('שימוש: tsx server/db/add-staff.ts <email> [שם] [admin|editor|viewer]');
  process.exit(1);
}
if (!['admin', 'editor', 'viewer'].includes(role)) {
  console.error(`תפקיד לא חוקי: ${role}`);
  process.exit(1);
}

const db = await initDb();
const [existing] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`);

if (existing) {
  await db
    .update(users)
    .set({ role, isGuest: false, ...(name ? { name } : {}) })
    .where(sql`lower(${users.email}) = ${email}`);
  console.log(`✓ ${email} עודכן — תפקיד ${role}, צוות פנימי פנימי`);
} else {
  await db.insert(users).values({
    email,
    name: name || email.split('@')[0],
    role,
    isGuest: false,
    // Verification happens when they enter the code sent to this address.
    emailVerified: false
  });
  console.log(`✓ ${email} נוצר — תפקיד ${role}, צוות פנימי פנימי`);
}

console.log('  הכניסה: הזן את הכתובת במסך ההתחברות וקבל קוד בן 6 ספרות.');
await closeDb();
