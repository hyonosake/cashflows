import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { openDb } from '../db.js';
import { importCsvBuffer } from '../domain/import.js';
import { CsvFileError } from '../csv/parser.js';

/**
 * CLI импорта образцов (ARCHITECTURE.md §9): `npm run import:samples [пути...]`.
 * Аргументы — пути или glob-паттерны (по умолчанию `samples/*.csv`);
 * печатает ImportResultDto по каждому файлу. Использует тот же domain/import.ts,
 * что и HTTP-роут (единственная реализация логики).
 */

function expandPatterns(patterns: string[]): string[] {
    const files: string[] = [];
    for (const pattern of patterns) {
        if (pattern.includes('*')) {
            const dir = path.dirname(pattern);
            const base = path.basename(pattern);
            const re = new RegExp(
                `^${base.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`,
            );
            if (fs.existsSync(dir)) {
                for (const entry of fs.readdirSync(dir)) {
                    if (re.test(entry)) {
                        files.push(path.join(dir, entry));
                    }
                }
            }
        } else if (fs.existsSync(pattern)) {
            files.push(pattern);
        } else {
            console.error(`Файл не найден: ${pattern}`);
            process.exitCode = 1;
        }
    }
    return files;
}

function main(): void {
    const args = process.argv.slice(2);
    const patterns = args.length > 0 ? args : ['samples/*.csv'];
    const files = expandPatterns(patterns);
    if (files.length === 0) {
        console.error('Нет CSV-файлов для импорта (проверьте пути, например samples/*.csv)');
        if (process.exitCode === undefined || process.exitCode === 0) {
            process.exitCode = 1;
        }
        return;
    }

    const config = loadConfig();
    const db = openDb(config.dbFile);
    try {
        for (const file of files) {
            try {
                const buffer = fs.readFileSync(file);
                const result = importCsvBuffer(db, buffer, path.basename(file));
                console.log(`${file}:`);
                console.log(JSON.stringify(result, null, 2));
            } catch (error) {
                if (error instanceof CsvFileError) {
                    console.error(`${file}: ошибка формата CSV: ${error.message}`);
                    process.exitCode = 1;
                } else {
                    throw error;
                }
            }
        }
    } finally {
        db.close();
    }
}

main();
