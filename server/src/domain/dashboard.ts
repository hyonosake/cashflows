import type { Db } from '../db.js';
import { getOwedToUserKopecks, getSalaryAmountKopecks, getSalaryDays } from './settings.js';
import { listGoals } from './goals.js';
import {
    daysBetween,
    detectPeriodType,
    monthBounds,
    monthKey,
    moscowTodayIso,
    nextSalaryDate,
    previousPeriod,
    weeksOfMonth,
} from './periods.js';
import type { MonthWeek } from './periods.js';
import type {
    CategoryKind,
    CategorySliceDto,
    DashboardDto,
    ExpenseByKindDto,
    MonthOverviewCategoryDto,
    MonthOverviewDto,
    PeriodTotalsDto,
} from '../../../shared/types.js';

/**
 * Агрегаты дашборда (ARCHITECTURE.md §8). ВЕЗДЕ действует фильтр
 * status = 'Ок' AND include_in_analytics = 1 (внутренние переводы исключены).
 * Деньги — копейки INT; расходы возвращаются положительным числом. Категория —
 * ВСЕГДА через operations_effective (живой JOIN, db.ts), не «запечённая» колонка.
 */

export const AGG_FILTER = "status = 'Ок' AND include_in_analytics = 1";

interface TotalsRow {
    income: number;
    expense: number;
    cnt: number;
}

function periodTotals(db: Db, from: string, to: string): PeriodTotalsDto {
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

interface UserCategoryRow {
    id: number;
    name: string;
    category_abstract: string | null;
    limit_kopecks: number | null;
}

function userCategoryRows(db: Db): UserCategoryRow[] {
    return db
        .prepare<[], UserCategoryRow>(
            `SELECT uc.id AS id, uc.name AS name, ca.name AS category_abstract,
                    uc.month_limit_kopecks AS limit_kopecks
             FROM user_categories uc
             LEFT JOIN category_abstract ca ON ca.id = uc.category_abstract_id
             WHERE uc.name != 'Без категории'
             ORDER BY ca.name IS NULL, ca.name, uc.name`,
        )
        .all();
}

interface WeekSpendRow {
    id: number;
    spent: number;
}

/** Траты по каждой категории за диапазон дат (одна неделя месяца), сгруппированные по id. */
function spendByCategoryForRange(db: Db, from: string, to: string): Map<number, number> {
    const rows = db
        .prepare<[string, string], WeekSpendRow>(
            `SELECT oe.effective_user_category_id AS id,
                    COALESCE(-SUM(CASE WHEN oe.amount_kopecks < 0 THEN oe.amount_kopecks ELSE 0 END), 0) AS spent
             FROM operations_effective oe
             WHERE ${AGG_FILTER} AND oe.local_date >= ? AND oe.local_date <= ?
             GROUP BY oe.effective_user_category_id`,
        )
        .all(from, to);
    return new Map(rows.map((row) => [row.id, row.spent]));
}

/**
 * Матрица категория×неделя за календарный месяц, содержащий period.from, по каждой
 * user_categories (кроме служебной «Без категории»): план на месяц (month_limit_kopecks,
 * необязательное поле) + траты по каждой неделе месяца (periods.ts → weeksOfMonth, недели
 * Пн–Вс, обрезанные границами месяца). Не зависит от того, какая неделя выбрана
 * WeekSwitcher'ом — как и раньше резервы/цели/займы были не привязаны к окну дашборда.
 */
function monthCategorySpend(db: Db, weeks: MonthWeek[]): MonthOverviewCategoryDto[] {
    const categories = userCategoryRows(db);
    const weekSpend = weeks.map((week) => spendByCategoryForRange(db, week.from, week.to));
    return categories.map((row) => {
        const weeklySpentKopecks = weekSpend.map((byCategory) => byCategory.get(row.id) ?? 0);
        return {
            name: row.name,
            categoryAbstract: row.category_abstract,
            limitKopecks: row.limit_kopecks,
            weeklySpentKopecks,
            spentKopecks: weeklySpentKopecks.reduce((sum, spent) => sum + spent, 0),
        };
    });
}

/**
 * Обзор календарного месяца, содержащего period.from (ARCHITECTURE.md §8.8) — не зависит
 * от того, какая неделя выбрана на дашборде: дни до зарплаты (из настроек) + матрица
 * категория×неделя трат месяца по категориям пользователя + план дохода/расход/баланс месяца.
 * План дохода = salaryAmountKopecks (доход за один день зарплаты) × число дней зарплаты в
 * месяце — не факт из операций типа income (зарплата может быть ещё не начислена на момент
 * просмотра), а ожидание по расписанию из настроек; null, если salaryAmountKopecks или
 * salaryDays не заданы. Расходы — periodTotals() за весь месяц (все операции, не только
 * категории пользователя, тот же AGG_FILTER, что и everywhere).
 */
function buildMonthOverview(db: Db, from: string): MonthOverviewDto {
    const { from: monthFrom, to: monthTo } = monthBounds(from);
    const key = monthKey(monthFrom);
    const weeks = weeksOfMonth(monthFrom, monthTo);
    const salaryDays = getSalaryDays(db);
    const salaryAmountKopecks = getSalaryAmountKopecks(db);
    const today = moscowTodayIso();
    const nextSalary = nextSalaryDate(today, salaryDays);
    const expenseKopecks = periodTotals(db, monthFrom, monthTo).expenseKopecks;
    const plannedIncomeKopecks =
        salaryAmountKopecks !== null && salaryDays.length > 0 ? salaryAmountKopecks * salaryDays.length : null;

    return {
        month: { from: monthFrom, to: monthTo, key },
        weeks,
        categories: monthCategorySpend(db, weeks),
        salaryDays,
        nextSalaryDate: nextSalary,
        daysUntilSalary: nextSalary !== null ? daysBetween(today, nextSalary) : null,
        plannedIncomeKopecks,
        expenseKopecks,
        balanceKopecks: plannedIncomeKopecks === null ? null : plannedIncomeKopecks - expenseKopecks,
        owedToUserKopecks: getOwedToUserKopecks(db),
    };
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
