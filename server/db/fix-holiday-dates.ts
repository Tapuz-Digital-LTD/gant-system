/**
 * Corrects hand-typed holiday dates against the computed Hebrew calendar.
 *
 * 22 of 28 holiday events in the prototype were wrong — Purim 2027 by four
 * days. Run with --apply to fix them; without it, nothing is written.
 */
import dotenv from 'dotenv';
import { eq } from 'drizzle-orm';
import { HebrewCalendar } from '@hebcal/core';
import { initDb, closeDb } from './client.js';
import { events } from './schema.js';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });

const apply = process.argv.includes('--apply');
const db = await initDb();

const strip = (s: string) => s.replace(/[֑-ׇ]/g, '').trim();

/** title fragment in our data → the canonical holiday it means */
const MAP: [string, string][] = [
  ['ראש השנה', 'ראש השנה'],
  ['יום כיפור', 'יום כיפור'],
  ['סוכות', 'סוכות א׳'],
  ['חנוכה', 'חנוכה: א׳ נר'],
  ['ט״ו בשבט', 'ט״ו בשבט'],
  ['פורים', 'פורים'],
  ['פסח', 'פסח א׳'],
  ['יום העצמאות', 'יום העצמאות'],
  ['ל״ג בעומר', 'ל״ג בעומר'],
  ['שבועות', 'שבועות'],
  ['תשעה באב', 'תשעה באב']
];

const real = new Map<string, string[]>();
for (const y of [2025, 2026, 2027, 2028, 2029]) {
  for (const e of HebrewCalendar.calendar({ year: y, isHebrewYear: false, il: true, locale: 'he' })) {
    const name = strip(e.render('he'));
    real.set(name, [...(real.get(name) ?? []), e.getDate().greg().toISOString().slice(0, 10)]);
  }
}

const rows = await db.select().from(events);
let fixed = 0;

for (const ev of rows) {
  const entry = MAP.find(([needle]) => ev.title.includes(needle));
  if (!entry) continue;

  const candidates = real.get(entry[1]) ?? [];
  const correct = candidates.find((d) => d.slice(0, 4) === ev.actualDate.slice(0, 4));
  if (!correct || correct === ev.actualDate) continue;

  // Keep the prep window the same length by moving kickoff with the event.
  const shift =
    (Date.parse(correct) - Date.parse(ev.actualDate)) / 86_400_000;
  const kickoff = ev.kickoffDate
    ? new Date(Date.parse(ev.kickoffDate) + shift * 86_400_000).toISOString().slice(0, 10)
    : null;

  console.log(`  ${ev.title.slice(0, 24).padEnd(24)} ${ev.actualDate} → ${correct}  (${shift > 0 ? '+' : ''}${shift}d)`);
  fixed++;

  if (apply) {
    await db
      .update(events)
      .set({ actualDate: correct, kickoffDate: kickoff, updatedAt: new Date() })
      .where(eq(events.id, ev.id));
  }
}

console.log(apply ? `\nתוקנו ${fixed} תאריכים.` : `\n${fixed} תאריכים שגויים. הרץ עם --apply כדי לתקן.`);
await closeDb();
