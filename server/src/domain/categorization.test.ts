import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db.js';
import { openTestDb } from './testDb.js';
import { EXPECTED_HEADERS } from '../csv/parser.js';
import { importCsvBuffer } from './import.js';
import { createUserCategory, deleteUserCategory } from './categories.js';
import { createCustomMapping, createMccMapping } from './categoryMappings.js';
import { setMerchantCategory } from './merchants.js';
import { listOperations, setOperationCategoryOverride } from './operations.js';

/**
 * Резолвинг эффективной категории (AGENTS.md, инвариант 5) — самая критичная и самая хрупкая
 * бизнес-логика приложения, ранее проверявшаяся только вручную через curl. Приоритет:
 * разовый override операции → custom_mappings (подстрока в message) → merchants.user_category_id
 * → mcc_mappings → «Без категории». Тесты гоняют РЕАЛЬНЫЙ пайплайн импорта (CSV → parser →
 * normalize → import), а не ручные INSERT в operations — иначе можно было бы протестировать
 * то, чего не бывает на практике.
 */

type CsvHeader = (typeof EXPECTED_HEADERS)[number];

const ROW_DEFAULTS: Record<CsvHeader, string> = {
    'Имя счёта': 'общий',
    'Номер карты': '*1234',
    'Дата операции': '01.09.2026 10:00:00',
    'Сумма операции': '-100,00',
    'Валюта операции': 'RUB',
    'Сумма в валюте счёта': '-100,00',
    'Валюта счёта': 'RUB',
    Статус: 'Ок',
    'Категория по-умолчанию': 'Прочее',
    'Ваша категория': '',
    MCC: '',
    Описание: 'Тестовый мерчант',
    Сообщение: '',
    Округление: '0,00',
    'Сумма операции с округлением': '-100,00',
    'Бонусы (включая кэшбэк)': '0,00',
    'Учёт в аналитике': 'Да',
};

function csvField(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
}

/** Собирает CSV-буфер строго по контракту (samples/CSV_FORMAT.md): CRLF, ';', все поля в кавычках. */
function buildCsv(rows: Array<Partial<Record<CsvHeader, string>>>): Buffer {
    const lines = [EXPECTED_HEADERS.map(csvField).join(';')];
    rows.forEach((row, index) => {
        // Разное время у каждой строки — иначе строки с одинаковым набором полей задедуплицировались бы.
        const merged: Record<CsvHeader, string> = { ...ROW_DEFAULTS };
        merged['Дата операции'] = `0${(index % 9) + 1}.09.2026 10:00:00`;
        for (const header of EXPECTED_HEADERS) {
            const value = row[header];
            if (value !== undefined) {
                merged[header] = value;
            }
        }
        lines.push(EXPECTED_HEADERS.map((h) => csvField(merged[h] ?? '')).join(';'));
    });
    return Buffer.from(lines.join('\r\n') + '\r\n', 'utf8');
}

function categoryOf(db: Db, description: string): string {
    const page = listOperations(db, { q: description });
    const match = page.items.find((op) => op.description === description);
    if (match === undefined) {
        throw new Error(`Операция с описанием "${description}" не найдена среди импортированных`);
    }
    return match.category;
}

function idOf(db: Db, description: string): number {
    const page = listOperations(db, { q: description });
    const match = page.items.find((op) => op.description === description);
    if (match === undefined) {
        throw new Error(`Операция с описанием "${description}" не найдена среди импортированных`);
    }
    return match.id;
}

describe('эффективная категория операции (operations_effective)', () => {
    let db: Db;

    beforeEach(() => {
        db = openTestDb();
        createUserCategory(db, 'Продукты');
        createUserCategory(db, 'Транспорт');
        createUserCategory(db, 'Психолог');
        createUserCategory(db, 'Ручная');

        const csv = buildCsv([
            { Описание: 'Неизвестный Мерчант' },
            { Описание: 'МСС Мерчант', MCC: '7011' },
            { Описание: 'Мерчант Х', MCC: '9999' },
            { Описание: 'Мерчант Х', MCC: '9999', Сообщение: 'секретный код возврата' },
            { Описание: 'Мерчант Y', 'Ваша категория': 'Продукты' },
            { Описание: 'Мерчант Z', Сообщение: 'ручной тест' },
        ]);
        const result = importCsvBuffer(db, csv, 'test.csv');
        expect(result.errors).toEqual([]);
        expect(result.inserted).toBe(6);
    });

    it('без единого правила → «Без категории»', () => {
        expect(categoryOf(db, 'Неизвестный Мерчант')).toBe('Без категории');
    });

    it('mcc_mappings резолвит категорию, когда нет правила на мерчанта', () => {
        createMccMapping(db, { mcc: '7011', targetCategory: 'Транспорт' });
        expect(categoryOf(db, 'МСС Мерчант')).toBe('Транспорт');
    });

    it('правило на мерчанта побеждает mcc_mappings', () => {
        createMccMapping(db, { mcc: '9999', targetCategory: 'Транспорт' });
        setMerchantCategory(db, 'Мерчант Х', 'Продукты');
        expect(categoryOf(db, 'Мерчант Х')).toBe('Продукты');
    });

    it('custom_mappings (подстрока в сообщении) побеждает и мерчанта, и mcc', () => {
        createMccMapping(db, { mcc: '9999', targetCategory: 'Транспорт' });
        setMerchantCategory(db, 'Мерчант Х', 'Продукты');
        createCustomMapping(db, { matchValue: 'секретный код', targetCategory: 'Психолог' });

        // Тот же мерчант и тот же MCC, что и в предыдущем тесте, но с совпадающим сообщением —
        // единственное отличие этой операции. Категория должна разрешиться иначе.
        const rows = listOperations(db, { q: 'Мерчант Х' }).items;
        expect(rows).toHaveLength(2);
        const withoutMessage = rows.find((r) => r.message === '');
        const withMessage = rows.find((r) => r.message !== '');
        expect(withoutMessage?.category).toBe('Продукты');
        expect(withMessage?.category).toBe('Психолог');
    });

    it('«Ваша категория» из CSV становится разовым override при импорте', () => {
        // У «Мерчант Y» нет ни merchant-, ни mcc-, ни custom-правила — сработать может
        // только override, проставленный при импорте из колонки «Ваша категория».
        expect(categoryOf(db, 'Мерчант Y')).toBe('Продукты');
    });

    it('ручной override операции побеждает даже совпадающее правило по сообщению', () => {
        createCustomMapping(db, { matchValue: 'ручной тест', targetCategory: 'Продукты' });
        expect(categoryOf(db, 'Мерчант Z')).toBe('Продукты');

        setOperationCategoryOverride(db, idOf(db, 'Мерчант Z'), 'Ручная');
        expect(categoryOf(db, 'Мерчант Z')).toBe('Ручная');
    });

    it('удаление категории снимает все ссылавшиеся на неё правила, операции падают на следующий по приоритету источник', () => {
        createMccMapping(db, { mcc: '9999', targetCategory: 'Транспорт' });
        setMerchantCategory(db, 'Мерчант Х', 'Продукты');
        createCustomMapping(db, { matchValue: 'секретный код', targetCategory: 'Психолог' });
        // «Мерчант Y» получил override на «Продукты» из «Ваша категория» при импорте.
        expect(categoryOf(db, 'Мерчант Y')).toBe('Продукты');

        deleteUserCategory(db, 'Продукты');

        // merchants.user_category_id обнулился → операция «Мерчант Х» без сообщения падает на mcc_mapping.
        const rows = listOperations(db, { q: 'Мерчант Х' }).items;
        const withoutMessage = rows.find((r) => r.message === '');
        const withMessage = rows.find((r) => r.message !== '');
        expect(withoutMessage?.category).toBe('Транспорт');
        // custom_mapping указывал на «Психолог» (не удалялась) — не затронут.
        expect(withMessage?.category).toBe('Психолог');
        // override операции «Мерчант Y» указывал именно на удалённую категорию → обнулился,
        // других правил на неё нет → «Без категории».
        expect(categoryOf(db, 'Мерчант Y')).toBe('Без категории');
    });
});
