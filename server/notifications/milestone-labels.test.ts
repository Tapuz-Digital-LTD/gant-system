// Run: npx tsx server/notifications/milestone-labels.test.ts
//
// The server writes milestone names into notification text; the client draws
// them on screen. Neither can import the other's list — one pulls a whole icon
// library into a serverless function, the other reaches across the wire. So the
// names live twice, and this fails the moment they stop agreeing.
import assert from 'node:assert/strict';
import { MILESTONE_LABELS } from './milestone-labels.ts';
import { MILESTONES } from '../../src/data/milestones.ts';

const client = new Map(MILESTONES.map((m) => [m.key, m]));

for (const label of MILESTONE_LABELS) {
  const counterpart = client.get(label.key as (typeof MILESTONES)[number]['key']);
  assert.ok(counterpart, `the client has no milestone called "${label.key}"`);
  assert.equal(counterpart!.short, label.short, `"${label.key}" is called two different things`);
  assert.equal(counterpart!.field, label.field, `"${label.key}" reads two different columns`);
  assert.equal(counterpart!.order, label.order, `"${label.key}" sits in two different places`);
}

// The event date is the client's only extra: it is drawn, never sent as a
// reminder, because "the event is happening today" is not a thing to warn about.
const missing = MILESTONES.filter((m) => !MILESTONE_LABELS.some((l) => l.key === m.key)).map((m) => m.key);
assert.deepEqual(missing, ['actual'], 'every milestone but the event date itself is mirrored');

console.log(`milestone-labels: ${MILESTONE_LABELS.length} שמות זהים בשרת ובלקוח ✓`);
