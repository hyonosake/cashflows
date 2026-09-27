import type { Db } from '../db.js';
import { badRequest, notFound } from '../http.js';
import { resolveUserCategoryId } from './categories.js';
import type { CategoryFieldDto } from '../../../shared/types.js';

/**
 * category_abstract («сферы») — абстракция ПОВЕРХ user_categories, только для группировки
 * строк в MonthOverview (не участвует в дедупе/резолвинге эффективной категории).
 */

export function listCategoryAbstracts(db: Db): CategoryFieldDto[] {
    return db
        .prepare<[], { name: string; field: string | null }>(
            `SELECT uc.name AS name, ca.name AS field
             FROM user_categories uc LEFT JOIN category_abstract ca ON ca.id = uc.category_abstract_id
             WHERE uc.name != 'Без категории' ORDER BY uc.name`,
        )
        .all()
        .map((row) => ({ category: row.name, field: row.field }));
}

export function setCategoryAbstract(db: Db, category: string, field: string | null): void {
    const id = resolveUserCategoryId(db, category);
    if (field === null) {
        db.prepare('UPDATE user_categories SET category_abstract_id = NULL WHERE id = ?').run(id);
        return;
    }
    const existing = db.prepare<[string], { id: number }>('SELECT id FROM category_abstract WHERE name = ?').get(field);
    const abstractId =
        existing?.id ??
        Number(db.prepare('INSERT INTO category_abstract (name, created_at) VALUES (?, ?)').run(field, new Date().toISOString()).lastInsertRowid);
    db.prepare('UPDATE user_categories SET category_abstract_id = ? WHERE id = ?').run(abstractId, id);
}

/**
 * Все существующие сферы (category_abstract) по имени — независимо от того, назначена ли
 * сфера хоть одной категории сейчас. Источник вариантов для select в UI (CategoryKindsSection):
 * без этого списка сфера заводилась только «попутно», вписыванием в поле конкретной категории
 * (setCategoryAbstract выше, find-or-create) — этот список даёт явное «создать сферу» отдельно.
 */
export function listCategoryAreaNames(db: Db): string[] {
    const rows = db.prepare<[], { name: string }>('SELECT name FROM category_abstract ORDER BY name').all();
    return rows.map((row) => row.name);
}

export function createCategoryArea(db: Db, name: string): { name: string } {
    const existing = db.prepare<[string], { id: number }>('SELECT id FROM category_abstract WHERE name = ?').get(name);
    if (existing !== undefined) {
        throw badRequest(`Сфера "${name}" уже существует`);
    }
    db.prepare('INSERT INTO category_abstract (name, created_at) VALUES (?, ?)').run(name, new Date().toISOString());
    return { name };
}

/**
 * Переименование сферы — категории ссылаются на неё по category_abstract_id (FK), поэтому,
 * как и с user_categories, переименование не требует каскада: у всех категорий этой сферы
 * оно просто отобразится под новым именем через живой JOIN (MonthOverview/CategoryKindsSection).
 */
export function renameCategoryArea(db: Db, name: string, newName: string): { name: string } {
    const row = db.prepare<[string], { id: number }>('SELECT id FROM category_abstract WHERE name = ?').get(name);
    if (row === undefined) {
        throw notFound(`Сфера "${name}" не найдена`);
    }
    if (newName !== name) {
        const existing = db.prepare<[string], { id: number }>('SELECT id FROM category_abstract WHERE name = ?').get(newName);
        if (existing !== undefined) {
            throw badRequest(`Сфера "${newName}" уже существует`);
        }
    }
    db.prepare('UPDATE category_abstract SET name = ? WHERE id = ?').run(newName, row.id);
    return { name: newName };
}
