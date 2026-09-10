/**
 * The import, from a terminal.
 *
 * The screen at `/import` is how this is meant to be done: a person uploads the
 * file, reads what is about to happen, and approves it. This exists for the one
 * case that screen cannot cover — loading a workspace's first file before
 * anybody has an account to sign in with, or repairing an import from a machine
 * that can reach the database when the browser cannot.
 *
 * Same parser, same plan, same transaction. The only thing missing is the
 * person, so the plan is printed in full and `--commit` is required to write
 * anything: a dry run is the default, and a dry run touches nothing.
 *
 *   npx tsx server/db/import-xlsx.ts docs/real-data.xlsx --board "תכנון שנתי"
 *   npx tsx server/db/import-xlsx.ts docs/real-data.xlsx --board "תכנון שנתי" --commit
 */
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { initDb, closeDb } from './client.js';
import { createRepo } from './repo.js';
import { users } from './schema.js';
import { readWorkbook } from '../import/workbook.js';
import { buildPlan } from '../import/plan.js';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });

const [file, ...rest] = process.argv.slice(2);
const boardName = rest[rest.indexOf('--board') + 1];
const commit = rest.includes('--commit');

if (!file || !rest.includes('--board') || !boardName) {
  console.error('שימוש: tsx server/db/import-xlsx.ts <קובץ.xlsx> --board "<שם הלוח>" [--commit]');
  process.exit(1);
}

const remote = Boolean(process.env.DATABASE_URL);
console.log(remote ? '⚠️  מסד נתונים מרוחק' : '✅ מסד מקומי (PGlite)');
console.log(`   קובץ: ${file}`);
console.log(`   לוח:  ${boardName}`);
console.log(commit ? '   מצב:  כתיבה\n' : '   מצב:  הרצה יבשה — לא נכתב כלום\n');

const db = await initDb();
const repo = createRepo(db);

const [owner] = await db.select().from(users).where(sql`is_owner = true and deleted_at is null`);
if (!owner) {
  console.error('אין מנהל ראשי במסד. הרץ קודם: tsx server/db/set-owner.ts <email>');
  await closeDb();
  process.exit(1);
}

const parsed = await readWorkbook(readFileSync(file));

console.log('גיליונות');
for (const name of parsed.sheetNames) {
  const rows = parsed.rows.filter((r) => r.sheet === name).length;
  const skipped = parsed.skipped.find((s) => s.sheet === name);
  console.log(`  ${name.padEnd(24)} ${rows ? `${rows} שורות` : `לא נקרא — ${skipped?.reason ?? ''}`}`);
}

// An existing board of the same name is imported into, not duplicated.
const boards = await repo.listBoards();
const existingBoard = boards.find((b) => b.name === boardName);
const boardId = existingBoard?.id ?? null;

const plan = buildPlan(parsed.rows, {
  existing: boardId ? await repo.eventsForImport(boardId) : []
});

const s = plan.summary;
console.log(
  `\n${s.sourceRows} שורות → ${s.events} אירועים · ` +
    `${s.create} חדשים · ${s.update} עדכונים · ${s.unchanged} ללא שינוי · ${s.skip} ידולגו`
);
console.log(`שגיאות: ${s.errors} · אזהרות: ${s.warnings} · סתירות: ${s.conflicts}`);

const problems = plan.events.flatMap((e) => e.issues.map((i) => ({ ...i, title: e.title })));
if (problems.length) {
  console.log('\nמה שצריך לדעת');
  for (const p of problems) {
    console.log(`  ${p.severity === 'error' ? '✗' : '⚠'} ${p.where} · ${p.title} · ${p.message}`);
  }
}

const conflicts = plan.events.flatMap((e) => e.conflicts.map((c) => ({ ...c, title: e.title })));
if (conflicts.length) {
  console.log('\nהגיליונות לא מסכימים');
  for (const c of conflicts) {
    console.log(
      `  ↔ ${c.title} · ${c.fieldLabel}: ` +
        c.values.map((v) => `${v.value} (${v.where.join(', ')})`).join('  ↔  ') +
        `  → נבחר ${c.chosen}`
    );
  }
}

const suggestions = plan.events.flatMap((e) => e.suggestions.map((x) => ({ ...x, title: e.title })));
if (suggestions.length) {
  console.log('\nהצעות לתיקון');
  for (const x of suggestions) {
    console.log(
      `  ${x.applied ? '[✓ הוחל]' : '[ ] לא הוחל'} ${x.title} · ${x.fieldLabel}: ${x.from} → ${x.to}  (${x.reason})`
    );
  }
}

if (!commit) {
  console.log('\nהרצה יבשה. להרצה אמיתית הוסף --commit');
  await closeDb();
  process.exit(0);
}

const board = existingBoard ?? (await repo.createBoard({ name: boardName }, owner.id));
const result = await repo.applyImport(board.id, plan.events, owner.id);

console.log(
  `\n✓ נוצרו ${result.created.length} · עודכנו ${result.updated.length} · ` +
    `ללא שינוי ${result.unchanged} · דולגו ${result.skipped}`
);

// Run the plan again against what was just written. Anything other than "all
// unchanged" means the same file could double the board, which is the one
// failure this feature exists to make impossible.
const again = buildPlan(parsed.rows, { existing: await repo.eventsForImport(board.id) });
console.log(
  `בדיקת כפילויות — אותו קובץ שוב: ${again.summary.create} חדשים · ` +
    `${again.summary.update} עדכונים · ${again.summary.unchanged} ללא שינוי`
);

const live = await repo.eventsForImport(board.id);
console.log(`\nעשר רשומות לבדיקה מול האקסל (מתוך ${live.length})`);
for (const e of plan.events.filter((x) => x.action !== 'skip').slice(0, 10)) {
  const v = e.values;
  console.log(
    `  ${e.title.padEnd(34).slice(0, 34)} ` +
      `אירוע ${v.actualDate} · התנעה ${v.kickoffMeetingDate ?? '—'.padEnd(10)} · ` +
      `אוויר ${v.kickoffDate ?? '—'.padEnd(10)} · הכנה ${String(v.prepMonths).padEnd(2)} · ` +
      `${v.category.padEnd(10)} · ${e.sources.join(' ')}`
  );
}

await closeDb();
