import type { Db } from '../db.js';
import { listGoals } from './goals.js';
import { AGG_FILTER } from './queryFilters.js';
import { detectPeriodType, previousPeriod } from './periodResolution.js';
import { buildMonthOverview } from './monthOverview.js';
import type {
    CategoryKind,
    CategorySliceDto,
    DashboardDto,
    ExpenseByKindDto,
    PeriodTotalsDto,
} from '../../../shared/types.js';

/**
 * Агрегаты дашборда (ARCHITECTURE.md §8). ВЕЗДЕ действует фильтр
 * status = 'Ок' AND include_in_analytics = 1 (внутренние переводы исключены).
 * Деньги — копейки INT; расходы возвращаются положительным числом. Категория —
 * ВСЕГДА через operations_effective (живой JOIN, db.ts), не «запечённая» колонка.
 *
 * Матрица категория×неделя календарного месяца (`monthOverview`) — domain/monthOverview.ts;
 * она переиспользует periodTotals() отсюда, здесь же — только окно, выбранное WeekSwitcher'ом.
 */

export function periodTotals(db: Db, from: string, to: string): PeriodTotalsDto {
    interface TotalsRow {
        income: number;
        expense: number;
        cnt: number;
    }
    const row = db
        .prepare<[string, string], TotalsRow>(
            `SELECT
               COALESCE(SUM(CASE WHEN amount_kopecks > 0 THEN amount_kopecks ELSE 0 END), 0) AS income,
               COALESCE(-SUM(CASE WHEN amount_kopecks < 0 THEN amount_kopecks ELSE 0 END), 0) AS expense,
               COUNT(*) AS cnt
             FROM operations
             WHERE ${AGG_FILTER} AND local_date >= ? AND local_date <= ?`,
        )
        .get(from, to);
    return {
        incomeKopecks: row?.income ?? 0,
        expenseKopecks: row?.expense ?? 0,
        operationsCount: row?.cnt ?? 0,
    };
}

interface CategoryAggRow {
    category: string;
    income: number;
    expense: number;
    kind: string | null;
}

function byCategory(db: Db, from: string, to: string, totalExpense: number): CategorySliceDto[] {
    const rows = db
        .prepare<[string, string], CategoryAggRow>(
            `SELECT uc.name AS category,
                    COALESCE(SUM(CASE WHEN oe.amount_kopecks > 0 THEN oe.amount_kopecks ELSE 0 END), 0) AS income,
                    COALESCE(-SUM(CASE WHEN oe.amount_kopecks < 0 THEN oe.amount_kopecks ELSE 0 END), 0) AS expense,
                    uc.type AS kind
             FROM operations_effective oe
             JOIN user_categories uc ON uc.id = oe.effective_user_category_id
             WHERE ${AGG_FILTER} AND oe.local_date >= ? AND oe.local_date <= ?
             GROUP BY uc.id
             ORDER BY expense DESC, category ASC`,
        )
        .all(from, to);
    return rows.map((row) => ({
        category: row.category,
        incomeKopecks: row.income,
        expenseKopecks: row.expense,
        shareOfExpenses: totalExpense > 0 ? row.expense / totalExpense : 0,
        kind: (row.kind as CategoryKind | null) ?? null,
    }));
}

interface ExpenseByKindRow {
    kind: string;
    total: number;
}

function expenseByKind(db: Db, from: string, to: string): ExpenseByKindDto {
    const rows = db
        .prepare<[string, string], ExpenseByKindRow>(
            `SELECT CASE WHEN uc.type IS NULL THEN 'unclassified' ELSE uc.type END AS kind,
                    COALESCE(-SUM(oe.amount_kopecks), 0) AS total
             FROM operations_effective oe
             JOIN user_categories uc ON uc.id = oe.effective_user_category_id
             WHERE ${AGG_FILTER} AND oe.amount_kopecks < 0 AND oe.local_date >= ? AND oe.local_date <= ?
             GROUP BY kind`,
        )
        .all(from, to);
    const result: ExpenseByKindDto = { fixedKopecks: 0, variableKopecks: 0, reserveKopecks: 0, unclassifiedKopecks: 0 };
    for (const row of rows) {
        if (row.kind === 'fixed') result.fixedKopecks = row.total;
        else if (row.kind === 'variable') result.variableKopecks = row.total;
        else if (row.kind === 'reserve') result.reserveKopecks = row.total;
        else result.unclassifiedKopecks = row.total;
    }
    return result;
}

function deltaPct(current: number, prev: number): number | null {
    if (prev === 0) {
        return null;
    }
    return Math.round(((current - prev) / prev) * 10000) / 100;
}

/** Главная агрегатная функция: полный DashboardDto для окна from..to (ARCHITECTURE.md §8). */
export function buildDashboard(db: Db, from: string, to: string): DashboardDto {
    const type = detectPeriodType(from, to);
    const totals = periodTotals(db, from, to);
    const prevWindow = previousPeriod(from, to);
    const prevTotals = periodTotals(db, prevWindow.from, prevWindow.to);

    return {
        period: { from, to, type },
        totals,
        prevTotals,
        change: {
            incomeDeltaKopecks: totals.incomeKopecks - prevTotals.incomeKopecks,
            incomePct: deltaPct(totals.incomeKopecks, prevTotals.incomeKopecks),
            expenseDeltaKopecks: totals.expenseKopecks - prevTotals.expenseKopecks,
            expensePct: deltaPct(totals.expenseKopecks, prevTotals.expenseKopecks),
        },
        byCategory: byCategory(db, from, to, totals.expenseKopecks),
        expenseByKind: expenseByKind(db, from, to),
        goals: listGoals(db),
        monthOverview: buildMonthOverview(db, from),
    };
}
