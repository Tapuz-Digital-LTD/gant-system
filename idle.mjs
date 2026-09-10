import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
const env = readFileSync('.env.local', 'utf8');
const url = env.split('\n').find((l) => l.startsWith('DATABASE_URL=')).slice(13).trim().replace(/^["']|["']$/g, '');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const connectOnce = async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  const t = Date.now();
  await p.query('select 1');
  const ms = Date.now() - t;
  await p.end();
  return ms;
};
console.log(`  חיבור חדש עכשיו:            ${await connectOnce()}ms`);
console.log('  ממתין 6 דקות ללא פעילות…');
await wait(6 * 60 * 1000);
console.log(`  חיבור חדש אחרי 6 דקות שקט: ${await connectOnce()}ms`);
console.log(`  ומיד אחריו:                 ${await connectOnce()}ms`);
