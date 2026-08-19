// Shared by the client download (dateHelpers) and the server export route,
// so the injection guard can never drift between the two.

// A cell starting with one of these is executed as a formula by Excel / Sheets /
// LibreOffice. Event titles are user-controlled, so every cell gets neutralised.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const safe = FORMULA_TRIGGER.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Builds a full CSV document: BOM for Excel's Hebrew detection, CRLF per RFC 4180. */
export function toCsvDocument(headers: string[], rows: unknown[][]): string {
  return (
    '﻿' +
    [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
  );
}
