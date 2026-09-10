/**
 * The import, from a terminal.
 *
 * The screen at `/import` is how this is meant to be done: a person uploads the
 * file, reads the sheet-to-board mapping and what is about to happen, and
 * approves it. This exists for the one case that screen cannot cover — loading
 * a workspace's first file before anybody has an account to sign in with.
 *
 * Same parser, same plan, same transaction. The only thing missing is the
 * person, so the plan is printed in full and `--commit` is required to write
 * anything: a dry run is the default, and a dry run touches nothing.
 *
 *   npx tsx server/db/import-xlsx.ts docs/real-data.xlsx
 *   npx tsx server/db/import-xlsx.ts docs/real-data.xlsx --commit
 *   npx tsx server/db/import-xlsx.ts f.xlsx --accept "גאנט::פסח|2029-03-30:kickoffDate" --commit
 */
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { initDb, closeDb } from './client.js';
import { createRepo } from './repo.js';
import { users } from './schema.js';
import { readWorkbook } from '../import/workbook.js';
import { allEvents, buildPlan } from '../import/plan.js';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });

const argv = process.argv.slice(2);
const file = argv[0];
const commit = argv.includes('--commit');
/** Repeatable. Each value is a plan key plus a field, exactly as the dry run prints it. */
const accepted = new Set(argv.map((a, i) => (argv[i - 1] === '--accept' ? a : '')).filter(Boolean));
/** Repeatable. Renames one sheet's board: --board "<sheet>=<board name>". */
const renames = new Map(
  argv
    .map((a, i) => (argv[i - 1] === '--board' ? a : ''))
    .filter(Boolean)
    .map((pair) => {
      const at = pair.indexOf('=');
      return [pair.slice(0, at), pair.slice(at + 1)] as [string, string];
    })
);

if (!file || file.startsWith('--')) {
  console.error('שימוש: tsx server/db/import-xlsx.ts <קובץ.xlsx> [--board "<גיליון>=<לוח>"] [--accept <key>] [--commit]');
  process.exit(1);
}

console.log(process.env.DATABASE_URL ? '⚠️  מסד נתונים מרוחק' : '✅ מסד מקומי (PGlite)');
console.log(`   קובץ: ${file}`);
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

// A sheet whose board already exists is imported into it, not beside it.
const boards = await repo.listBoards();
const byName = new Map(boards.map((b) => [b.name.trim(), b.id]));
const sheets: string[] = [];
for (const row of parsed.rows) if (!sheets.includes(row.sheet)) sheets.push(row.sheet);

const choices = sheets.map((sheet) => {
  const boardName = renames.get(sheet) ?? sheet;
  return { sheet, boardName, boardId: byName.get(boardName) ?? null, include: true };
});

const existingByBoard = new Map<string, Awaited<ReturnType<typeof repo.eventsForImport>>>();
for (const c of choices) {
  if (c.boardId && !existingByBoard.has(c.boardId)) {
    existingByBoard.set(c.boardId, await repo.eventsForImport(c.boardId));
  }
}

const plan = buildPlan(parsed.rows, { sheets: choices, existingByBoard, accepted });

console.log('מיפוי: גיליון → לוח → אירועים');
for (const b of plan.boards) {
  console.log(
    `  ${b.sheet.padEnd(26)} → ${b.boardName.padEnd(26)} → ${String(b.summary.events).padStart(3)} אירועים` +
      `  (${b.summary.create} חדשים · ${b.summary.update} עדכונים · ${b.summary.unchanged} ללא שינוי)` +
      (b.boardId ? '  [לוח קיים]' : '  [לוח חדש]')
  );
}
for (const s of parsed.skipped) {
  console.log(`  ${s.sheet.padEnd(26)} → לא לוח — ${s.reason}`);
}

const t = plan.summary;
console.log(
  `\nסך הכול: ${t.sourceRows} שורות → ${t.events} אירועים ב-${plan.boards.filter((b) => b.include).length} לוחות · ` +
    `${t.create} חדשים · ${t.update} עדכונים · ${t.unchanged} ללא שינוי · ${t.skip} ידולגו`
);
console.log(`שגיאות: ${t.errors} · אזהרות: ${t.warnings} · סתירות: ${t.conflicts}`);

const events = allEvents(plan);

const problems = events.flatMap((e) => e.issues.map((i) => ({ ...i, title: e.title, sheet: e.sheet })));
if (problems.length) {
  console.log('\nמה שצריך לדעת');
  for (const p of problems) {
    console.log(`  ${p.severity === 'error' ? '✗' : '⚠'} ${p.where} · ${p.title} · ${p.message}`);
  }
}

const conflicts = events.flatMap((e) => e.conflicts.map((c) => ({ ...c, title: e.title, sheet: e.sheet })));
if (conflicts.length) {
  console.log('\nהגיליונות לא מסכימים');
  for (const c of conflicts) {
    console.log(
      `  ↔ [${c.sheet}] ${c.title} · ${c.fieldLabel}: ` +
        c.values.map((v) => `${v.value} (${v.where.join(', ')})`).join('  ↔  ') +
        `  → נבחר ${c.chosen}`
    );
  }
}

const suggestions = events.flatMap((e) => e.suggestions.map((x) => ({ ...x, event: e })));
if (suggestions.length) {
  console.log('\nהצעות לתיקון');
  for (const x of suggestions) {
    console.log(`  ${x.applied ? '[✓ הוחל]' : '[ ] לא הוחל'} ${x.event.title} · ${x.fieldLabel}: ${x.from} → ${x.to}`);
    console.log(`      ${x.reason}`);
    if (!x.applied) console.log(`      --accept "${x.event.planKey}:${x.field}"`);
  }
}

if (!commit) {
  console.log('\nהרצה יבשה. להרצה אמיתית הוסף --commit');
  await closeDb();
  process.exit(0);
}

const live = plan.boards.filter((b) => b.include);
const report = await repo.applyImport(
  live.map((b) => ({ boardName: b.boardName, boardId: b.boardId, events: b.events })),
  owner.id
);

console.log('\n✓ הייבוא הושלם');
for (const b of report) {
  console.log(
    `  ${b.boardName.padEnd(26)} נוצרו ${String(b.created).padStart(3)} · עודכנו ${String(b.updated).padStart(3)} · ` +
      `ללא שינוי ${String(b.unchanged).padStart(3)} · דולגו ${b.skipped}${b.boardCreated ? '  [לוח נוצר]' : ''}`
  );
}

// Run the plan again against what was just written. Anything other than "all
// unchanged" means the same file could double a board, which is the one failure
// this feature exists to make impossible.
const afterExisting = new Map<string, Awaited<ReturnType<typeof repo.eventsForImport>>>();
for (const b of report) afterExisting.set(b.boardId, await repo.eventsForImport(b.boardId));
const again = buildPlan(parsed.rows, {
  sheets: live.map((b, i) => ({ ...b, boardId: report[i].boardId })),
  existingByBoard: afterExisting,
  accepted
});
console.log(
  `\nבדיקת כפילויות — אותו קובץ שוב: ${again.summary.create} חדשים · ` +
    `${again.summary.update} עדכונים · ${again.summary.unchanged} ללא שינוי`
);

console.log('\nעשר רשומות לבדיקה מול האקסל, מכל לוח');
for (const b of live) {
  console.log(`  ── ${b.boardName} ──`);
  for (const e of b.events.filter((x) => x.action !== 'skip').slice(0, 10)) {
    const v = e.values;
    console.log(
      `    ${e.title.padEnd(32).slice(0, 32)} אירוע ${v.actualDate} · ` +
        `התנעה ${(v.kickoffMeetingDate ?? '—').padEnd(10)} · אוויר ${(v.kickoffDate ?? '—').padEnd(10)} · ` +
        `הכנה ${String(v.prepMonths).padEnd(2)} · ${e.sources.join(' ')}`
    );
  }
}

await closeDb();
