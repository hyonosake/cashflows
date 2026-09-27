import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db.js';
import { openTestDb } from './testDb.js';
import { importCsvBuffer } from './import.js';
import { createUserCategory } from './categories.js';
import { createCustomMapping, createMccMapping } from './categoryMappings.js';
import { setMerchantCategory } from './merchants.js';
import { listOperations } from './operations.js';

/**
 * "Прогони все сырые операции снова через фильтры": проверяет ИМЕННО то, что не нужно —
 * эффективная категория живая (operations_effective, VIEW в db.ts, инвариант 5 в AGENTS.md):
 * правило, заведённое ПОСЛЕ импорта, немедленно применяется ко всем УЖЕ СУЩЕСТВУЮЩИМ операциям
 * без какого-либо отдельного шага «пересчитать»/«rescoring» — их достаточно просто прочитать
 * снова (listOperations здесь и есть тот самый повторный проход «по новой»). Гоняется на
 * РЕАЛЬНОМ файле samples/sample-operations.csv (117 строк, тот же, что `npm run import:samples`),
 * а не на синтетических фикстурах — числа ниже (11×метро, 7×ВкусВилл, 2×«Вб») сверены заранее
 * прямым разбором файла.
 */

// vitest (как и все npm-скрипты, AGENTS.md → «Команды») всегда запускается из корня репозитория.
const SAMPLE_CSV_PATH = resolve(process.cwd(), 'samples/sample-operations.csv');

function importSampleCsv(db: Db): void {
    const buffer = readFileSync(SAMPLE_CSV_PATH);
    const result = importCsvBuffer(db, buffer, 'sample-operations.csv');
    expect(result.errors).toEqual([]);
    expect(result.inserted).toBe(117);
}

function itemsOf(db: Db, description: string) {
    return listOperations(db, { q: description, limit: 200, analyticsOnly: false }).items.filter((op) => op.description === description);
}

function categoriesOf(db: Db, description: string): string[] {
    return itemsOf(db, description).map((op) => op.category);
}

describe('живой пересчёт категории на реальном датасете (samples/sample-operations.csv)', () => {
    let db: Db;

    beforeEach(() => {
        db = openTestDb();
    });

    it('без единого правила все 117 операций — «Без категории» (включая проигнорированный override из CSV)', () => {
        // «Табак»/«Психолог» из колонки «Ваша категория» НЕ создаются заранее — по инварианту 3
        // импорт не создаёт категории «на лету», override молча игнорируется.
        importSampleCsv(db);
        const page = listOperations(db, { limit: 200, analyticsOnly: false });
        expect(page.total).toBe(117);
        expect(page.items.every((op) => op.category === 'Без категории')).toBe(true);
    });

    it('mcc_mapping, заведённый ПОСЛЕ импорта, немедленно применяется ко всем ранее импортированным операциям', () => {
        importSampleCsv(db);
        expect(categoriesOf(db, 'Московский метрополитен')).toEqual(Array(11).fill('Без категории'));

        createUserCategory(db, 'Транспорт');
        createMccMapping(db, { mcc: '4111', targetCategory: 'Транспорт' });

        // Те же самые 11 операций, вставленные ДО этого правила, — без повторного импорта.
        expect(categoriesOf(db, 'Московский метрополитен')).toEqual(Array(11).fill('Транспорт'));
    });

    it('правило на мерчанта, заведённое ПОСЛЕ импорта, применяется ко всем его операциям сразу', () => {
        importSampleCsv(db);
        expect(categoriesOf(db, 'ВкусВилл')).toEqual(Array(7).fill('Без категории'));

        createUserCategory(db, 'Продукты');
        setMerchantCategory(db, 'ВкусВилл', 'Продукты');

        expect(categoriesOf(db, 'ВкусВилл')).toEqual(Array(7).fill('Продукты'));
    });

    it('custom_mapping по подстроке в сообщении применяется задним числом', () => {
        importSampleCsv(db);
        // «Мария С.» — 3 операции: 1 без сообщения, 2 с сообщением «Вб» — все уже в базе,
        // без единого правила.
        const before = itemsOf(db, 'Мария С.');
        expect(before).toHaveLength(3);
        expect(before.every((op) => op.category === 'Без категории')).toBe(true);

        createUserCategory(db, 'Маркетплейсы');
        createCustomMapping(db, { matchValue: 'Вб', targetCategory: 'Маркетплейсы' });

        // Те же самые 3 операции — правило задним числом задевает только 2 с совпадающим
        // сообщением, третья (без сообщения) по-прежнему «Без категории».
        const after = itemsOf(db, 'Мария С.');
        expect(after.filter((op) => op.message === 'Вб').every((op) => op.category === 'Маркетплейсы')).toBe(true);
        expect(after.filter((op) => op.message === '').every((op) => op.category === 'Без категории')).toBe(true);
    });

    it('«Ваша категория» из CSV — override, только если категория УЖЕ существовала на момент импорта', () => {
        // «Психолог» заводим заранее — override для «Екатерина Ш.» должен сработать при импорте.
        // «Табак» НЕ заводим — override для «IP Unanyan Vg»/«IP Vyazovskij V.N.» должен быть
        // проигнорирован (инвариант 3): категория «на лету» не создаётся, строка не «зависает»
        // на несуществующей категории, просто ведёт себя как обычная операция без override.
        createUserCategory(db, 'Психолог');
        importSampleCsv(db);

        expect(categoriesOf(db, 'Екатерина Ш.')).toEqual(['Психолог']);
        expect(categoriesOf(db, 'IP Unanyan Vg')).toEqual(Array(3).fill('Без категории'));

        // Заводим «Табак» и mcc-правило уже ПОСЛЕ импорта — тот же живой пересчёт, что и выше,
        // но теперь применяется к операциям, чей CSV-override был проигнорирован при импорте:
        // они резолвятся через mcc, а не «вспоминают» пропущенный override задним числом.
        // (mcc 5814 в реальном образце неоднозначен — им же помечены Pe Edilov Anzor Isaevi и
        // Surf Coffee — намеренно не тот код, что стоило бы заводить в реальном mcc_mappings
        // AGENTS.md, инвариант 5; здесь важна только механика пересчёта, не осмысленность кода.)
        createUserCategory(db, 'Табак');
        createMccMapping(db, { mcc: '5814', targetCategory: 'Табак' });
        expect(categoriesOf(db, 'IP Unanyan Vg')).toEqual(Array(3).fill('Табак'));
    });
});
