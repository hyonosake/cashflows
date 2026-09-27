import type { Db } from '../db.js';
import { badRequest, notFound } from '../http.js';
import type {
    CategoryFieldDto,
    CategoryKindDto,
    CategoryLimitDto,
    CustomMappingDto,
    CustomMappingInputDto,
    McCodeOptionDto,
    McMappingDto,
    McMappingInputDto,
} from '../../../shared/types.js';

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

function findUserCategoryId(db: Db, name: string): number {
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
    const id = findUserCategoryId(db, category);
    db.prepare('UPDATE user_categories SET type = ? WHERE id = ?').run(kind, id);
}

// --- category_abstract (сферы) ---

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
    const id = findUserCategoryId(db, category);
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
    const id = findUserCategoryId(db, category);
    db.prepare('UPDATE user_categories SET month_limit_kopecks = ? WHERE id = ?').run(monthLimitKopecks, id);
}

// --- mcc_mappings ---

interface McOptionRow {
    mcc: string;
    description: string;
    cnt: number;
}

/**
 * MCC-коды, реально встречавшиеся в операциях, с примерами названий мерчантов и счётчиком —
 * чтобы создавать правило по MCC осмысленно («mcc+название»), а не по памяти вслепую (см.
 * MappingsSection). Сортировка по частоте — самые весомые коды сверху.
 */
export function listMccOptions(db: Db): McCodeOptionDto[] {
    const rows = db
        .prepare<[], McOptionRow>(
            `SELECT mcc, description, COUNT(*) AS cnt
             FROM operations
             WHERE mcc IS NOT NULL AND mcc != ''
             GROUP BY mcc, description
             ORDER BY mcc, cnt DESC`,
        )
        .all();
    const byMcc = new Map<string, { examples: string[]; operationsCount: number }>();
    for (const row of rows) {
        const entry = byMcc.get(row.mcc) ?? { examples: [], operationsCount: 0 };
        entry.operationsCount += row.cnt;
        if (row.description !== '' && entry.examples.length < 3 && !entry.examples.includes(row.description)) {
            entry.examples.push(row.description);
        }
        byMcc.set(row.mcc, entry);
    }
    return Array.from(byMcc.entries())
        .map(([mcc, entry]) => ({ mcc, examples: entry.examples, operationsCount: entry.operationsCount }))
        .sort((a, b) => b.operationsCount - a.operationsCount);
}

interface McRow {
    mcc: string;
    user_category_id: number;
    category_name: string;
}

export function listMccMappings(db: Db): McMappingDto[] {
    return db
        .prepare<[], McRow>(
            `SELECT mm.mcc AS mcc, mm.user_category_id, uc.name AS category_name
             FROM mcc_mappings mm JOIN user_categories uc ON uc.id = mm.user_category_id
             ORDER BY mm.mcc`,
        )
        .all()
        .map((row) => ({ mcc: row.mcc, targetCategory: row.category_name }));
}

export function createMccMapping(db: Db, input: McMappingInputDto): McMappingDto {
    const userCategoryId = findUserCategoryId(db, input.targetCategory);
    db.prepare('INSERT INTO mcc_mappings (mcc, user_category_id, created_at) VALUES (?, ?, ?) ON CONFLICT(mcc) DO UPDATE SET user_category_id = excluded.user_category_id').run(
        input.mcc,
        userCategoryId,
        new Date().toISOString(),
    );
    return { mcc: input.mcc, targetCategory: input.targetCategory };
}

export function deleteMccMapping(db: Db, mcc: string): void {
    const result = db.prepare('DELETE FROM mcc_mappings WHERE mcc = ?').run(mcc);
    if (result.changes === 0) {
        throw notFound(`Правило для MCC=${mcc} не найдено`);
    }
}

// --- custom_mappings (по подстроке в message) ---

interface CustomRow {
    id: number;
    match_value: string;
    user_category_id: number;
    category_name: string;
}

export function listCustomMappings(db: Db): CustomMappingDto[] {
    return db
        .prepare<[], CustomRow>(
            `SELECT cm.id, cm.match_value, cm.user_category_id, uc.name AS category_name
             FROM custom_mappings cm JOIN user_categories uc ON uc.id = cm.user_category_id
             ORDER BY cm.id`,
        )
        .all()
        .map((row) => ({ id: row.id, matchValue: row.match_value, targetCategory: row.category_name }));
}

export function createCustomMapping(db: Db, input: CustomMappingInputDto): CustomMappingDto {
    const userCategoryId = findUserCategoryId(db, input.targetCategory);
    const result = db
        .prepare('INSERT INTO custom_mappings (match_value, user_category_id, created_at) VALUES (?, ?, ?)')
        .run(input.matchValue, userCategoryId, new Date().toISOString());
    return { id: Number(result.lastInsertRowid), matchValue: input.matchValue, targetCategory: input.targetCategory };
}

export function deleteCustomMapping(db: Db, id: number): void {
    const result = db.prepare('DELETE FROM custom_mappings WHERE id = ?').run(id);
    if (result.changes === 0) {
        throw notFound(`Правило с id=${id} не найдено`);
    }
}
