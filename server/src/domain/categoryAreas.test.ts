import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db.js';
import { openTestDb } from './testDb.js';
import { createUserCategory } from './categories.js';
import { createCategoryArea, listCategoryAbstracts, renameCategoryArea, setCategoryAbstract } from './categoryAreas.js';

describe('renameCategoryArea', () => {
    let db: Db;

    beforeEach(() => {
        db = openTestDb();
        createCategoryArea(db, 'Еда и повседневное');
    });

    it('переименовывает сферу', () => {
        expect(renameCategoryArea(db, 'Еда и повседневное', 'Быт')).toEqual({ name: 'Быт' });
    });

    it('бросает 404, если сферы с таким именем нет', () => {
        expect(() => renameCategoryArea(db, 'Нет такой', 'Новое имя')).toThrow(/не найдена/);
    });

    it('бросает 400, если новое имя уже занято другой сферой', () => {
        createCategoryArea(db, 'Хобби');
        expect(() => renameCategoryArea(db, 'Еда и повседневное', 'Хобби')).toThrow(/уже существует/);
    });

    it('переименование в то же самое имя — no-op, без ошибки', () => {
        expect(renameCategoryArea(db, 'Еда и повседневное', 'Еда и повседневное')).toEqual({ name: 'Еда и повседневное' });
    });

    it('категория, привязанная к сфере по id, видит новое имя сразу после переименования', () => {
        createUserCategory(db, 'Продукты');
        setCategoryAbstract(db, 'Продукты', 'Еда и повседневное');
        expect(listCategoryAbstracts(db)).toEqual([{ category: 'Продукты', field: 'Еда и повседневное' }]);

        renameCategoryArea(db, 'Еда и повседневное', 'Быт');

        expect(listCategoryAbstracts(db)).toEqual([{ category: 'Продукты', field: 'Быт' }]);
    });
});
