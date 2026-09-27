/**
 * Чистая дата-арифметика (ARCHITECTURE.md §8.1): недели Пн–Вс по Europe/Moscow,
 * ISO-ключи '2026-W37' / '2026-09', «сегодня по Москве».
 *
 * Europe/Moscow с 2014 года — фиксированный UTC+3 (DST нет), поэтому таймзонные
 * вычисления делаются простым сдвигом на +3ч без tz-библиотек (допущение §11.1).
 *
 * Семантика периодов дашборда (тип периода, «предыдущий период», ближайшая зарплата) —
 * domain/periodResolution.ts, которая опирается на эти функции.
 */

export const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' «сегодня по Москве». */
export function moscowTodayIso(nowMs: number = Date.now()): string {
    return new Date(nowMs + MOSCOW_OFFSET_MS).toISOString().slice(0, 10);
}

/** Сдвиг календарного дня YYYY-MM-DD на n дней (чистая дата-арифметика в UTC). */
export function addDays(isoDate: string, days: number): string {
    const ms = Date.UTC(
        Number(isoDate.slice(0, 4)),
        Number(isoDate.slice(5, 7)) - 1,
        Number(isoDate.slice(8, 10)),
    );
    return new Date(ms + days * DAY_MS).toISOString().slice(0, 10);
}

/** Понедельник недели, содержащей isoDate (недели Пн–Вс). */
export function weekStart(isoDate: string): string {
    const ms = Date.UTC(
        Number(isoDate.slice(0, 4)),
        Number(isoDate.slice(5, 7)) - 1,
        Number(isoDate.slice(8, 10)),
    );
    const dow = new Date(ms).getUTCDay(); // 0=Вс..6=Сб
    const shiftToMonday = dow === 0 ? -6 : 1 - dow;
    return addDays(isoDate, shiftToMonday);
}

/**
 * ISO-ключ недели 'YYYY-Www' по ISO 8601: первая неделя года — та,
 * что содержит первый четверг (ARCHITECTURE.md §8.1).
 */
export function isoWeekKey(isoDate: string): string {
    const date = new Date(`${isoDate}T00:00:00Z`);
    const dow = date.getUTCDay() === 0 ? 7 : date.getUTCDay(); // 1=Пн..7=Вс
    const thursday = new Date(date.getTime() + (4 - dow) * DAY_MS); // четверг этой недели
    const year = thursday.getUTCFullYear();
    const jan1 = Date.UTC(year, 0, 1);
    const week = Math.floor((thursday.getTime() - jan1) / DAY_MS / 7) + 1;
    return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Месячный ключ 'YYYY-MM'. */
export function monthKey(isoDate: string): string {
    return isoDate.slice(0, 7);
}

/** Первый/последний день календарного месяца, содержащего isoDate. */
export function monthBounds(isoDate: string): { from: string; to: string } {
    const year = Number(isoDate.slice(0, 4));
    const month = Number(isoDate.slice(5, 7));
    const from = `${isoDate.slice(0, 7)}-01`;
    const nextMonthFirst =
        month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
    return { from, to: addDays(nextMonthFirst, -1) };
}

export interface MonthWeek {
    index: number; // 1..N по порядку внутри месяца
    from: string;
    to: string;
}

/**
 * Разбивка календарного месяца на недели Пн–Вс (обзор месяца), обрезанные
 * границами месяца: первая/последняя неделя может быть короче 7 дней, если месяц
 * начинается/заканчивается не в понедельник/воскресенье.
 */
export function weeksOfMonth(monthFrom: string, monthTo: string): MonthWeek[] {
    const weeks: MonthWeek[] = [];
    let cursor = monthFrom;
    let index = 1;
    while (cursor <= monthTo) {
        const rawEnd = addDays(weekStart(cursor), 6);
        const to = rawEnd > monthTo ? monthTo : rawEnd;
        weeks.push({ index, from: cursor, to });
        index += 1;
        cursor = addDays(to, 1);
    }
    return weeks;
}

/** Число дней в месяце (1..12) григорианского года. */
export function daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Количество полных дней между двумя календарными датами (to − from). */
export function daysBetween(from: string, to: string): number {
    const ms = (iso: string): number =>
        Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
    return Math.round((ms(to) - ms(from)) / DAY_MS);
}
