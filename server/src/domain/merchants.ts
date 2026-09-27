import type { Db } from '../db.js';
import { badRequest, notFound } from '../http.js';
import { AGG_FILTER } from './dashboard.js';
import type { MerchantSummaryDto } from '../../../shared/types.js';

/**
 * Список мерчантов (merchants, = operations.description) с суммой трат и текущей
 * эффективной категорией — обзорный раздел «Настройки → Мерчанты». ЗА ВСЁ ВРЕМЯ,
 * как раньше — не привязано к периоду дашборда. mixedCategories=true, если у операций
 * одного мерчанта сейчас разные эффективные категории (разовые override'ы отдельных
 * операций расходятся с категорией самого мерчанта) — category тогда та, на которую
 * пришлось больше всего трат.
 */

interface MerchantRow {
    name: string;
    category: string | null;
    spent_kopecks: number;
    cnt: number;
}

export function listMerchants(db: Db): MerchantSummaryDto[] {
    const rows = db
        .prepare<[], MerchantRow>(
            `SELECT m.name AS name, uc.name AS category,
                    COALESCE(-SUM(oe.amount_kopecks), 0) AS spent_kopecks, COUNT(*) AS cnt
             FROM merchants m
             JOIN operations_effective oe ON oe.merchant_id = m.id
             LEFT JOIN user_categories uc ON uc.id = oe.effective_user_category_id
             WHERE ${AGG_FILTER} AND oe.amount_kopecks < 0
             GROUP BY m.id, uc.id`,
        )
        .all();

    const byMerchant = new Map<string, { spentKopecks: number; operationsCount: number; categories: MerchantRow[] }>();
    for (const row of rows) {
        const entry = byMerchant.get(row.name) ?? { spentKopecks: 0, operationsCount: 0, categories: [] };
        entry.spentKopecks += row.spent_kopecks;
        entry.operationsCount += row.cnt;
        entry.categories.push(row);
        byMerchant.set(row.name, entry);
    }

    const result: MerchantSummaryDto[] = [];
    for (const [merchant, entry] of byMerchant) {
        const dominant = entry.categories.reduce((a, b) => (b.spent_kopecks > a.spent_kopecks ? b : a));
        result.push({
            merchant,
            category: dominant.category ?? 'Без категории',
            mixedCategories: entry.categories.length > 1,
            spentKopecks: entry.spentKopecks,
            operationsCount: entry.operationsCount,
        });
    }

    return result.sort((a, b) => b.spentKopecks - a.spentKopecks);
}

/** Меняет category у ВСЕГО мерчанта целиком — прямой FK, без правил и пересчёта (живой JOIN). */
export function setMerchantCategory(db: Db, merchant: string, targetCategory: string): void {
    const userCategory = db.prepare<[string], { id: number }>('SELECT id FROM user_categories WHERE name = ?').get(targetCategory);
    if (userCategory === undefined) {
        throw badRequest(`Неизвестная категория "${targetCategory}"`);
    }
    const result = db.prepare('UPDATE merchants SET user_category_id = ? WHERE name = ?').run(userCategory.id, merchant);
    if (result.changes === 0) {
        throw notFound(`Мерчант "${merchant}" не найден`);
    }
}
