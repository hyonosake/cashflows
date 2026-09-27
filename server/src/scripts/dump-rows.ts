/**
 * Разовая утилита: дамп строк [from..to] листа [sheetName] из xlsx (raw-значения).
 * Использование: npx tsx server/src/scripts/dump-rows.ts <файл> <лист> <from> <to>
 */
import * as XLSX from 'xlsx';
import * as fs from 'node:fs';

const [file, sheetName, fromS, toS] = process.argv.slice(2);
const from = Number(fromS) - 1;
const to = Number(toS) - 1;

const wb = XLSX.read(fs.readFileSync(String(file)), { type: 'buffer' });
const ws: XLSX.WorkSheet = wb.Sheets[String(sheetName)] as XLSX.WorkSheet;
const ref: string = ws['!ref'] ?? 'A1';
const range = XLSX.utils.decode_range(ref);
const maxRow = Math.min(to, range.e.r);
const maxCol = range.e.c;

for (let r = from; r <= maxRow; r++) {
    const cells: string[] = [];
    for (let c = range.s.c; c <= maxCol; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
        if (cell === undefined) continue;
        const v = String(cell.v ?? '').replace(/\n/g, ' ⏎ ');
        cells.push(`${XLSX.utils.encode_col(c)}=${v.length > 90 ? v.slice(0, 89) + '…' : v}`);
    }
    if (cells.length === 0) continue;
    console.log(`${r + 1}: ${cells.join(' | ')}`);
}
