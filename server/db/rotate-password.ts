/**
 * Changes the database password, and proves the new one works.
 *
 * Neon roles are ordinary Postgres roles, so this is ALTER ROLE and nothing
 * more exotic. The new password is generated here, used here, and written to
 * `.env.local` — it is never printed, never passed as a command-line argument
 * where it would land in the process list, and never committed.
 *
 * Order matters. The new credential is verified with a real connection BEFORE
 * anything is told to depend on it, so a rotation that half-worked is a
 * rotation that failed loudly rather than a database nobody can reach.
 *
 * Updating Vercel is deliberately NOT done here: pushing a value to a
 * deployment is a different act from changing a password, and bundling them
 * means one command that can leave production pointing at a credential that no
 * longer exists. The script prints the one command to run next.
 *
 *   npx tsx server/db/rotate-password.ts
 */
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });

const current = process.env.DATABASE_URL;
if (!current) {
  console.error('אין DATABASE_URL.');
  process.exit(1);
}

const url = new URL(current);
const role = url.username;

// base64url so the result needs no escaping inside a connection string.
const next = randomBytes(24).toString('base64url');

const admin = new Pool({ connectionString: current, max: 1 });
try {
  await admin.query(`alter role "${role}" with password '${next}'`);
} finally {
  await admin.end();
}
console.log(`הסיסמה של ${role} הוחלפה.`);

url.password = next;
const rotated = url.toString();

const check = new Pool({ connectionString: rotated, max: 1 });
try {
  const { rows } = await check.query('select current_user as usr, current_database() as db');
  console.log(`אימות: התחברות תקינה כ-${rows[0].usr} אל ${rows[0].db}`);
} finally {
  await check.end();
}

const file = '.env.local';
const text = readFileSync(file, 'utf8');
const line = text.split('\n').find((l) => l.startsWith('DATABASE_URL='));
writeFileSync(file, line ? text.replace(line, `DATABASE_URL=${rotated}`) : `${text}\nDATABASE_URL=${rotated}\n`);
console.log(`${file} עודכן.`);

console.log('\nנשאר לעדכן את הפריסה:');
console.log('  vercel env rm DATABASE_URL production --yes');
console.log('  grep "^DATABASE_URL=" .env.local | cut -d= -f2- | tr -d "\\n" | vercel env add DATABASE_URL production');
