/**
 * Семантика периодов дашборда (ARCHITECTURE.md §8.1) поверх чистой дата-арифметики
 * domain/periods.ts: тип периода (неделя/месяц/произвольный диапазон), окно по умолчанию,
 * «предыдущий период» для сравнения, ближайшая дата зарплаты по расписанию из настроек.
 */

import { addDays, daysInMonth, moscowTodayIso, weekStart } from './periods.js';

export type DashboardPeriodType = 'week' | 'month' | 'range';

/**
 * Тип периода: from — понедельник и to = from + 6 → 'week';
 * from — 1-е число и to — последнее число того же месяца → 'month'; иначе 'range'.
 */
export function detectPeriodType(from: string, to: string): DashboardPeriodType {
    if (weekStart(from) === from && addDays(from, 6) === to) {
        return 'week';
    }
    if (from.slice(8, 10) === '01' && to.slice(0, 7) === from.slice(0, 7)) {
        const nextMonthFirst = to.slice(0, 7) === '12' ? `${Number(to.slice(0, 4)) + 1}-01-01` : `${to.slice(0, 5)}${String(Number(to.slice(5, 7)) + 1).padStart(2, '0')}-01`;
        if (addDays(to, 1) === nextMonthFirst) {
            return 'month';
        }
    }
    return 'range';
}

/** Предыдущий период для сравнения: окно той же длины, сдвинутое на 7 дней назад. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
    return { from: addDays(from, -7), to: addDays(to, -7) };
}

/**
 * Валидация окна from..to (оба или ни одного, from ≤ to) для GET /api/dashboard.
 * Возвращает нормализованное окно либо null, если параметры не заданы.
 */
export function resolveDashboardRange(
    from: string | undefined,
    to: string | undefined,
): { from: string; to: string } | null {
    if (from === undefined && to === undefined) {
        const today = moscowTodayIso();
        const monday = weekStart(today);
        return { from: monday, to: addDays(monday, 6) };
    }
    if (from === undefined || to === undefined) {
        throw new Error('Параметры from и to должны быть заданы одновременно');
    }
    if (from > to) {
        throw new Error('Параметр from не может быть больше to');
    }
    return { from, to };
}

/**
 * Ближайшая дата зарплаты не раньше `today` среди нескольких дней месяца `salaryDays`
 * (зарплата может приходить несколько раз в месяц, например 7 и 22 числа). Для каждого дня
 * берётся ближайшая дата (в этом или следующем месяце), затем — минимум по всем дням. Если
 * `salaryDay` больше числа дней в месяце — берётся последний день месяца (31 в феврале → 28/29).
 * `salaryDays: []` → `null` (не задано).
 */
export function nextSalaryDate(today: string, salaryDays: readonly number[]): string | null {
    if (salaryDays.length === 0) {
        return null;
    }
    const year = Number(today.slice(0, 4));
    const month = Number(today.slice(5, 7)); // 1..12
    const clamp = (y: number, m: number, day: number): string =>
        `${y}-${String(m).padStart(2, '0')}-${String(Math.min(day, daysInMonth(y, m))).padStart(2, '0')}`;
    const nextMonth = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };

    const candidates = salaryDays.map((day) => {
        const thisMonth = clamp(year, month, day);
        return thisMonth >= today ? thisMonth : clamp(nextMonth.y, nextMonth.m, day);
    });
    return candidates.sort()[0] ?? null;
}
