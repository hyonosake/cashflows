/**
 * Этап 5 (рекогносцировка): разовая инспекция budget_example.xlsx.
 * Печатает: список листов, диапазоны, содержимое каждой ячейки (raw + формат).
 * Использование: npx tsx server/src/scripts/inspect-xlsx.ts [путь.xlsx]
 */
import * as XLSX from 'xlsx';
import * as fs from 'node:fs';
import * as path from 'node:path';

const file = process.argv[2] ?? '/Users/shuyskiy.aleksey/Downloads/budget_example.xlsx';
const buf = fs.readFileSync(file);
const wb = XLSX.read(buf, { type: 'buffer', cellDates: false, cellNF: true });

console.log(`FILE: ${file} (${buf.length} bytes)`);
console.log(`SHEETS (${wb.SheetNames.length}): ${JSON.stringify(wb.SheetNames)}`);
console.log('='.repeat(100));

for (const name of wb.SheetNames) {
    const ws: XLSX.WorkSheet = wb.Sheets[name] as XLSX.WorkSheet;
    const ref: string = ws['!ref'] ?? '<empty>';
    const range = XLSX.utils.decode_range(ref);
    console.log(`\n### SHEET: "${name}"  range=${ref}  cols=${range.e.c - range.s.c + 1} rows=${range.e.r - range.s.r + 1}`);
    const merges = ws['!merges'] as XLSX.Range[] | undefined;
    if (merges?.length) {
        console.log(`merges: ${merges.map((m) => XLSX.utils.encode_range(m)).join(', ')}`);
    }
    const maxRows = Math.min(range.e.r, range.s.r + 59); // до 60 строк на лист в разведке
    const maxCols = Math.min(range.e.c, range.s.c + 17);
    for (let r = range.s.r; r <= maxRows; r++) {
        const cells: string[] = [];
        for (let c = range.s.c; c <= maxCols; c++) {
            const addr = XLSX.utils.encode_cell({ r, c });
            const cell = ws[addr] as XLSX.CellObject | undefined;
            if (cell === undefined) { cells.push('·'); continue; }
            let v = String(cell.v ?? '');
            if (v.length > 28) v = v.slice(0, 27) + '…';
            let tag: string = String(cell.t);
            if (cell.t === 'n' && cell.z) tag = `n:${String(cell.z)}`;
            if (cell.t === 'n' && !cell.z) tag = 'n';
            cells.push(`[${addr}=${v}|${tag}]`);
        }
        // пропускаем полностью пустые строки
        if (cells.every((x) => x === '·')) { console.log(`${String(r + 1).padStart(3)}: (пусто)`); continue; }
        console.log(`${String(r + 1).padStart(3)}: ${cells.join(' ')}`);
    }
    if (range.e.r > maxRows) console.log(`… (обрезано: всего строк до ${range.e.r + 1})`);
}
console.log('\nDONE');
