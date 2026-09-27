import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db.js';
import { openTestDb } from './testDb.js';
import { createUserCategory, renameUserCategory } from './categories.js';
import { createMccMapping, listMccMappings } from './categoryMappings.js';
import { setMerchantCategory } from './merchants.js';
import { listOperations } from './operations.js';

function insertMerchant(db: Db, name: string): number {
    const result = db.prepare('INSERT INTO merchants (name, created_at) VALUES (?, ?)').run(name, new Date().toISOString());
    return Number(result.lastInsertRowid);
}

function insertOperation(db: Db, merchantId: number, description: string): void {
    db.prepare(
        `INSERT INTO operations (
           hash, datetime_iso, local_date, amount_kopecks, type, account, currency, status,
           category_default, description, merchant_id, include_in_analytics, source_file, imported_at
         ) VALUES (?, ?, ?, -10000, 'expense', 'общий', 'RUB', 'Ок', 'Прочее', ?, ?, 1, 'test.csv', ?)`,
    ).run(`hash-${description}`, '2026-09-01T00:00:00Z', '2026-09-01', description, merchantId, new Date().toISOString());
}

describe('renameUserCategory', () => {
    let db: Db;

    beforeEach(() => {
        db = openTestDb();
        createUserCategory(db, 'Продукты');
    });

    it('переименовывает категорию', () => {
        const dto = renameUserCategory(db, 'Продукты', 'Еда');
        expect(dto).toEqual({ name: 'Еда' });
    });

    it('бросает 404, если категории с таким именем нет', () => {
        expect(() => renameUserCategory(db, 'Нет такой', 'Новое имя')).toThrow(/не найдена/);
    });

    it('бросает 400, если новое имя уже занято другой категорией', () => {
        createUserCategory(db, 'Транспорт');
        expect(() => renameUserCategory(db, 'Продукты', 'Транспорт')).toThrow(/уже существует/);
    });

    it('переименование в то же самое имя — no-op, без ошибки', () => {
        expect(renameUserCategory(db, 'Продукты', 'Продукты')).toEqual({ name: 'Продукты' });
    });

    it('нельзя переименовать служебную категорию «Без категории»', () => {
        expect(() => renameUserCategory(db, 'Без категории', 'Что-то другое')).toThrow(/служебную категорию/);
    });

    it('нельзя переименовать категорию В служебное имя «Без категории»', () => {
        expect(() => renameUserCategory(db, 'Продукты', 'Без категории')).toThrow(/служебное имя/);
    });

    it('mcc_mappings продолжает указывать на ту же категорию под новым именем (ссылка по id, без каскада)', () => {
        createMccMapping(db, { mcc: '5411', targetCategory: 'Продукты' });
        renameUserCategory(db, 'Продукты', 'Еда');
        expect(listMccMappings(db)).toEqual([{ mcc: '5411', targetCategory: 'Еда' }]);
    });

    it('правило на мерчанта резолвит операцию под новым именем сразу после переименования', () => {
        const merchantId = insertMerchant(db, 'Пятёрочка');
        insertOperation(db, merchantId, 'Пятёрочка');
        setMerchantCategory(db, 'Пятёрочка', 'Продукты');
        expect(listOperations(db, { q: 'Пятёрочка' }).items[0]?.category).toBe('Продукты');

        renameUserCategory(db, 'Продукты', 'Еда');

        expect(listOperations(db, { q: 'Пятёрочка' }).items[0]?.category).toBe('Еда');
    });
});
