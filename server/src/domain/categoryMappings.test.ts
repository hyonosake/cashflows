import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db.js';
import { openTestDb } from './testDb.js';
import { createUserCategory } from './categories.js';
import {
    createCustomMapping,
    createMccMapping,
    deleteCustomMapping,
    deleteMccMapping,
    listCustomMappings,
    listMccMappings,
} from './categoryMappings.js';

describe('categoryMappings (mcc_mappings / custom_mappings)', () => {
    let db: Db;

    beforeEach(() => {
        db = openTestDb();
        createUserCategory(db, 'Продукты');
        createUserCategory(db, 'Транспорт');
    });

    describe('mcc_mappings', () => {
        it('создаёт правило mcc → категория', () => {
            const dto = createMccMapping(db, { mcc: '5411', targetCategory: 'Продукты' });
            expect(dto).toEqual({ mcc: '5411', targetCategory: 'Продукты' });
            expect(listMccMappings(db)).toEqual([{ mcc: '5411', targetCategory: 'Продукты' }]);
        });

        it('повторное создание с тем же mcc обновляет категорию (один код — одно правило)', () => {
            createMccMapping(db, { mcc: '5411', targetCategory: 'Продукты' });
            createMccMapping(db, { mcc: '5411', targetCategory: 'Транспорт' });
            expect(listMccMappings(db)).toEqual([{ mcc: '5411', targetCategory: 'Транспорт' }]);
        });

        it('бросает 400, если целевая категория не существует', () => {
            expect(() => createMccMapping(db, { mcc: '5411', targetCategory: 'Нет такой' })).toThrow(/Неизвестная категория/);
        });

        it('удаление существующего правила', () => {
            createMccMapping(db, { mcc: '5411', targetCategory: 'Продукты' });
            deleteMccMapping(db, '5411');
            expect(listMccMappings(db)).toEqual([]);
        });

        it('удаление несуществующего правила бросает 404', () => {
            expect(() => deleteMccMapping(db, '0000')).toThrow(/не найдено/);
        });
    });

    describe('custom_mappings', () => {
        it('создаёт правило подстрока → категория', () => {
            const dto = createCustomMapping(db, { matchValue: 'Психолог', targetCategory: 'Продукты' });
            expect(dto).toMatchObject({ matchValue: 'Психолог', targetCategory: 'Продукты' });
            expect(listCustomMappings(db)).toHaveLength(1);
        });

        it('позволяет несколько разных правил с одинаковой целевой категорией', () => {
            createCustomMapping(db, { matchValue: 'Иванов', targetCategory: 'Продукты' });
            createCustomMapping(db, { matchValue: 'Петров', targetCategory: 'Продукты' });
            expect(listCustomMappings(db)).toHaveLength(2);
        });

        it('бросает 400, если целевая категория не существует', () => {
            expect(() => createCustomMapping(db, { matchValue: 'Иванов', targetCategory: 'Нет такой' })).toThrow(/Неизвестная категория/);
        });

        it('удаление существующего правила по id', () => {
            const dto = createCustomMapping(db, { matchValue: 'Иванов', targetCategory: 'Продукты' });
            deleteCustomMapping(db, dto.id);
            expect(listCustomMappings(db)).toEqual([]);
        });

        it('удаление несуществующего id бросает 404', () => {
            expect(() => deleteCustomMapping(db, 999999)).toThrow(/не найдено/);
        });
    });
});
