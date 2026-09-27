import type { Db } from '../db.js';
import { badRequest, notFound } from '../http.js';
import type { CategoryKindDto, CategoryLimitDto } from '../../../shared/types.js';

/**
 * Категории пользователя — строгий курируемый список (user_categories), без «банковской
 * категории по умолчанию» как альтернативного источника (см. рефакторинг категорий —
 * обратная совместимость с «протекающими» банковскими категориями сознательно не сохранена).
 * includeUncategorized — включить служебную «Без категории» (нужно для фильтра операций,
 * не нужно там, где выбирается ЦЕЛЕВАЯ категория, например MerchantsSection).
 */
export function listUserCategories(db: Db, includeUncategorized = false): string[] {
    const rows = db
        .prepare<[], { name: string }>(
            includeUncategorized ? 'SELECT name FROM user_categories ORDER BY name' : "SELECT name FROM user_categories WHERE name != 'Без категории' ORDER BY name",
        )
        .all();
    return rows.map((row) => row.name);
}

/**
 * Общий поиск id категории пользователя по имени — используется везде, где нужно
 * превратить целевую категорию (из тела запроса) в FK: маппинги, лимиты/теги здесь,
 * а также domain/merchants.ts и domain/operations.ts (разовый override операции).
 */
export function resolveUserCategoryId(db: Db, name: string): number {
    const row = db.prepare<[string], { id: number }>('SELECT id FROM user_categories WHERE name = ?').get(name);
    if (row === undefined) {
        throw badRequest(`Неизвестная категория "${name}"`);
    }
    return row.id;
}

/**
 * Единственное место, где появляется НОВАЯ строка user_categories (раньше такого пути не
 * было вообще — категории заводились только вручную в БД/старым, уже удалённым скриптом
 * импорта бюджета). Везде, где нужно сослаться на категорию (маппинги, мерчанты, лимиты,
 * теги), выбор — строго из уже существующих (select, не свободный текст); создание новой —
 * только здесь, отдельным действием в «Настройках» (CategoryKindsSection).
 */
export function createUserCategory(db: Db, name: string): { name: string } {
    const existing = db.prepare<[string], { id: number }>('SELECT id FROM user_categories WHERE name = ?').get(name);
    if (existing !== undefined) {
        throw badRequest(`Категория "${name}" уже существует`);
    }
    db.prepare('INSERT INTO user_categories (name, created_at) VALUES (?, ?)').run(name, new Date().toISOString());
    return { name };
}

/**
 * Переименование категории — правки ссылаются на неё по id (FK), а не по имени, так что
 * переименование не требует никакого каскада: mcc_mappings/custom_mappings/merchants/override
 * операций продолжают указывать на ту же строку user_categories, просто с новым name.
 * «Без категории» нельзя ни переименовать (это служебное имя, на него завязаны COALESCE-фолбэки
 * в SQL — db.ts, routes/operations.ts), ни переименовать ДРУГУЮ категорию в неё (создало бы
 * вторую строку с этим именем поверх уже существующей служебной, а code полагается на то, что
 * оно ровно одно).
 */
export function renameUserCategory(db: Db, name: string, newName: string): { name: string } {
    if (name === 'Без категории') {
        throw badRequest('Нельзя переименовать служебную категорию «Без категории»');
    }
    if (newName === 'Без категории') {
        throw badRequest('Нельзя переименовать категорию в служебное имя «Без категории»');
    }
    const row = db.prepare<[string], { id: number }>('SELECT id FROM user_categories WHERE name = ?').get(name);
    if (row === undefined) {
        throw notFound(`Категория "${name}" не найдена`);
    }
    if (newName !== name) {
        const existing = db.prepare<[string], { id: number }>('SELECT id FROM user_categories WHERE name = ?').get(newName);
        if (existing !== undefined) {
            throw badRequest(`Категория "${newName}" уже существует`);
        }
    }
    db.prepare('UPDATE user_categories SET name = ? WHERE id = ?').run(newName, row.id);
    return { name: newName };
}

/**
 * Удаление категории — единственное место, где строка user_categories физически исчезает.
 * «Без категории» удалить нельзя: это служебный фолбэк operations_effective (db.ts, COALESCE
 * в самом конце цепочки) — без неё эффективная категория стала бы NULL для любой операции,
 * не подошедшей ни под одно правило.
 *
 * FK на user_categories(id) объявлены БЕЗ ON DELETE CASCADE/SET NULL (foreign_keys=ON в db.ts —
 * SQLite реально это проверяет), поэтому перед DELETE нужно вручную разорвать все ссылки —
 * одной транзакцией, иначе либо упадёт FK-ошибка, либо (без транзакции) БД останется в
 * противоречивом состоянии при сбое на середине:
 *   1) operations.user_category_override_id → NULL (разовый override теряется, а не переносится
 *      на «Без категории» явно — VIEW сама даст «Без категории», если больше ничего не подошло);
 *   2) merchants.user_category_id → NULL (правило на мерчанта целиком снимается);
 *   3) mcc_mappings/custom_mappings, где user_category_id = удаляемая — строки удаляются целиком
 *      (колонка NOT NULL, NULL недопустим — «правило в никуда» бессмысленно, проще снести правило).
 * После этого operations_effective сама даст «Без категории» всем операциям, которые ссылались
 * только на удалённую категорию и ни на что другое — пересчитывать вручную не нужно (инвариант 5).
 */
export function deleteUserCategory(db: Db, name: string): void {
    if (name === 'Без категории') {
        throw badRequest('Нельзя удалить служебную категорию «Без категории»');
    }
    const row = db.prepare<[string], { id: number }>('SELECT id FROM user_categories WHERE name = ?').get(name);
    if (row === undefined) {
        throw notFound(`Категория "${name}" не найдена`);
    }
    const id = row.id;
    const runTransaction = db.transaction(() => {
        db.prepare('UPDATE operations SET user_category_override_id = NULL WHERE user_category_override_id = ?').run(id);
        db.prepare('UPDATE merchants SET user_category_id = NULL WHERE user_category_id = ?').run(id);
        db.prepare('DELETE FROM mcc_mappings WHERE user_category_id = ?').run(id);
        db.prepare('DELETE FROM custom_mappings WHERE user_category_id = ?').run(id);
        db.prepare('DELETE FROM user_categories WHERE id = ?').run(id);
    });
    runTransaction();
}

// --- category_kinds (type: fixed|variable|reserve) — теперь колонка user_categories.type ---

export function listCategoryKinds(db: Db): CategoryKindDto[] {
    return db
        .prepare<[], { name: string; type: string | null }>("SELECT name, type FROM user_categories WHERE name != 'Без категории' ORDER BY name")
        .all()
        .map((row) => ({ category: row.name, kind: row.type as CategoryKindDto['kind'] }));
}

export function setCategoryKind(db: Db, category: string, kind: 'fixed' | 'variable' | 'reserve' | null): void {
    const id = resolveUserCategoryId(db, category);
    db.prepare('UPDATE user_categories SET type = ? WHERE id = ?').run(kind, id);
}

// --- month_limit_kopecks (план на месяц, обзор месяца — MonthOverview) ---

export function listCategoryLimits(db: Db): CategoryLimitDto[] {
    return db
        .prepare<[], { name: string; month_limit_kopecks: number | null }>(
            "SELECT name, month_limit_kopecks FROM user_categories WHERE name != 'Без категории' ORDER BY name",
        )
        .all()
        .map((row) => ({ category: row.name, monthLimitKopecks: row.month_limit_kopecks }));
}

export function setCategoryLimit(db: Db, category: string, monthLimitKopecks: number | null): void {
    const id = resolveUserCategoryId(db, category);
    db.prepare('UPDATE user_categories SET month_limit_kopecks = ? WHERE id = ?').run(monthLimitKopecks, id);
}
