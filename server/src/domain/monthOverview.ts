import type { Db } from '../db.js';
import { getOwedToUserKopecks, getSalaryAmountKopecks, getSalaryDays } from './settings.js';
import { periodTotals } from './dashboard.js';
import { AGG_FILTER } from './queryFilters.js';
import { daysBetween, monthBounds, monthKey, moscowTodayIso, weeksOfMonth } from './periods.js';
import type { MonthWeek } from './periods.js';
import { nextSalaryDate } from './periodResolution.js';
import type { MonthOverviewCategoryDto, MonthOverviewDto } from '../../../shared/types.js';

/**
 * Обзор календарного месяца, содержащего period.from — не зависит от того, какая неделя
 * выбрана на дашборде (WeekSwitcher). Переиспользует periodTotals() из dashboard.ts за весь
 * месяц (тот же AGG_FILTER, что и everywhere).
 */

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
 * Обзор календарного месяца, содержащего period.from — не зависит
 * от того, какая неделя выбрана на дашборде: дни до зарплаты (из настроек) + матрица
 * категория×неделя трат месяца по категориям пользователя + план дохода/расход/баланс месяца.
 * План дохода = salaryAmountKopecks (доход за один день зарплаты) × число дней зарплаты в
 * месяце — не факт из операций типа income (зарплата может быть ещё не начислена на момент
 * просмотра), а ожидание по расписанию из настроек; null, если salaryAmountKopecks или
 * salaryDays не заданы.
 */
export function buildMonthOverview(db: Db, from: string): MonthOverviewDto {
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
