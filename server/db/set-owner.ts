/**
 * Marks one account as the workspace owner.
 * The owner bypasses every permission check and cannot be removed or demoted —
 * so a mis-tick in the permissions screen can always be undone.
 *
 * Usage: npx tsx server/db/set-owner.ts tomer@xtra.co.il
 */
import dotenv from 'dotenv';
import { sql, ne } from 'drizzle-orm';
import { initDb, closeDb } from './client.js';
import { users } from './schema.js';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('שימוש: tsx server/db/set-owner.ts <email>');
  process.exit(1);
}

const db = await initDb();
const [target] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`);
if (!target) {
  console.error(`לא מצאנו את מה שחיפשת חשבון עבור ${email}`);
  await closeDb();
  process.exit(1);
}

// Exactly one owner: clear any previous holder in the same statement pair.
await db.update(users).set({ isOwner: false }).where(ne(users.id, target.id));
await db.update(users).set({ isOwner: true, role: 'admin', isGuest: false }).where(sql`lower(${users.email}) = ${email}`);

console.log(`✓ ${email} הוא כעת המנהל הראשי — לא ניתן להסיר או להוריד בדרגה`);
await closeDb();
