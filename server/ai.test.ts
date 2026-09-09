// Run: npx tsx server/ai.test.ts
//
// No network. The one piece of parsing between a model's reply and a person's
// screen, which is exactly where a bad assumption shows up as a broken list.
import assert from 'node:assert/strict';
import { stripFence } from './ai.ts';

const json = '{"recommendedTasks":[]}';

assert.equal(stripFence(json), json, 'plain JSON passes through untouched');
assert.equal(stripFence('```json\n' + json + '\n```'), json, 'a labelled fence is removed');
assert.equal(stripFence('```\n' + json + '\n```'), json, 'and an unlabelled one');
assert.equal(stripFence('הנה התוצאה:\n```json\n' + json + '\n```\nבהצלחה'), json, 'along with anything around it');
assert.equal(stripFence('  ' + json + '  '), json, 'whitespace is not content');

// A reply that is not JSON at all must stay not-JSON, so JSON.parse throws and
// the request fails honestly rather than rendering half a list.
assert.equal(stripFence('אין לי מה להציע'), 'אין לי מה להציע');
assert.throws(() => JSON.parse(stripFence('אין לי מה להציע')));

console.log('ai: כל הבדיקות עברו ✓');
