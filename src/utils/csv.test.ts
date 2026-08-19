// Run: npx tsx src/utils/csv.test.ts
import assert from 'node:assert/strict';
import { csvCell, toCsvDocument } from './csv.ts';

// --- formula injection: the reason this module exists ---
assert.equal(csvCell('=1+1'), `"'=1+1"`, 'leading = must be neutralised');
assert.equal(csvCell('+HYPERLINK("http://evil")'), `"'+HYPERLINK(""http://evil"")"`);
assert.equal(csvCell('-2+3'), `"'-2+3"`);
assert.equal(csvCell('@SUM(A1)'), `"'@SUM(A1)"`);
assert.equal(csvCell('\tcmd'), `"'\tcmd"`);

// A minus *inside* the value is harmless and must not be touched.
assert.equal(csvCell('2026-09-11'), '"2026-09-11"', 'ISO dates must survive intact');

// --- quoting ---
assert.equal(csvCell('רגיל'), '"רגיל"');
assert.equal(csvCell('אמר "שלום"'), '"אמר ""שלום"""', 'quotes must be doubled');
assert.equal(csvCell('שורה\nחדשה'), '"שורה\nחדשה"', 'newlines survive inside quotes');
assert.equal(csvCell(''), '""');
assert.equal(csvCell(null), '""');
assert.equal(csvCell(undefined), '""');
assert.equal(csvCell(0), '"0"', 'zero must not become empty');
assert.equal(csvCell(false), '"false"');

// --- document ---
const doc = toCsvDocument(['שם', 'תאריך'], [['=בדיקה', '2026-09-11']]);
assert.ok(doc.startsWith('﻿'), 'BOM required for Excel to read Hebrew');
assert.ok(doc.includes('\r\n'), 'CRLF per RFC 4180');
assert.equal(doc, '﻿"שם","תאריך"\r\n"\'=בדיקה","2026-09-11"');

console.log('csv: כל הבדיקות עברו ✓');
