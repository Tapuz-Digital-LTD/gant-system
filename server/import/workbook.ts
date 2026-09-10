/**
 * exceljs, behind the smallest possible door.
 *
 * It is the heaviest dependency in the project, so it is imported here and
 * nowhere else, and only inside the function — a cold start that draws a
 * calendar must never pay for a spreadsheet parser it is not going to use.
 */
import { parseSheets, type ParsedWorkbook, type SheetLike } from './parse.js';

export async function readWorkbook(data: Buffer): Promise<ParsedWorkbook> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as unknown as ArrayBuffer);

  const sheets: SheetLike[] = wb.worksheets.map((ws) => ({
    name: ws.name,
    rowCount: ws.rowCount,
    // A sheet can be 135 columns of timeline drawing; the headers are never
    // out there, and scanning them all costs nothing worth measuring.
    columnCount: Math.min(ws.columnCount, 200),
    cell: (row: number, column: number) => ws.getCell(row, column).value
  }));

  return parseSheets(sheets);
}
