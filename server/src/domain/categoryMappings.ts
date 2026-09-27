import type { Db } from '../db.js';
import { notFound } from '../http.js';
import { resolveUserCategoryId } from './categories.js';
import type {
    CustomMappingDto,
    CustomMappingInputDto,
    McCodeOptionDto,
    McMappingDto,
    McMappingInputDto,
} from '../../../shared/types.js';

// --- mcc_mappings (фолбэк по банковскому MCC) ---

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
    const userCategoryId = resolveUserCategoryId(db, input.targetCategory);
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
    const userCategoryId = resolveUserCategoryId(db, input.targetCategory);
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
