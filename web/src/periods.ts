/**
 * Периоды на фронте: неделя Пн–Вс по Europe/Moscow (ARCHITECTURE.md §8.1, §11.1).
 * Москва = фиксированный UTC+3, DST нет → вычисления без TZ-библиотек.
 * Все даты — строки 'YYYY-MM-DD'; сравнение — лексикографическое.
 */

export const MS_DAY = 86_400_000;
const MS_TZ_OFFSET = 3 * 60 * 60 * 1000; // Europe/Moscow = UTC+3

/** Сегодняшний календарный день по Москве. */
export function todayIso(): string {
    return new Date(Date.now() + MS_TZ_OFFSET).toISOString().slice(0, 10);
}

/** Дата, сдвинутая на N дней (чистая календарная арифметика в UTC). */
export function addDays(iso: string, days: number): string {
    const ms = Date.parse(`${iso}T00:00:00Z`);
    return new Date(ms + days * MS_DAY).toISOString().slice(0, 10);
}

/** Понедельник недели, содержащей дату. */
export function mondayOf(iso: string): string {
    const dow = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0=Вс … 6=Сб
    const shift = (dow === 0 ? 7 : dow) - 1;
    return addDays(iso, -shift);
}

export interface WeekRange {
    from: string;
    to: string;
}

/** Диапазон недели со сдвигом от текущей: 0 — текущая, −1 — прошлая, +1 — следующая. */
export function weekRangeFromOffset(offset: number): WeekRange {
    const monday = addDays(mondayOf(todayIso()), offset * 7);
    return { from: monday, to: addDays(monday, 6) };
}

/** Ключ месяца 'YYYY-MM' для календарного дня по Москве. */
export function monthKeyFromDate(iso: string): string {
    return iso.slice(0, 7);
}

/** Текущие ключи периода по Москве: неделя '2026-W37' и месяц '2026-09'. */
export function currentPeriodKeys(): { week: string; month: string } {
    const today = todayIso();
    return { week: weekKeyFromDate(today), month: monthKeyFromDate(today) };
}

/** ISO-ключ недели 'YYYY-Www' по её понедельнику (первая неделя содержит первый четверг). */
export function isoWeekKey(mondayIso: string): string {
    const thursday = addDays(mondayIso, 3); // четверг определяет ISO-год и номер недели
    const [y = 0, m = 1, d = 1] = thursday.split('-').map(Number);
    const dayOfYear = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / MS_DAY) + 1;
    const week = Math.ceil(dayOfYear / 7);
    return `${y}-W${String(week).padStart(2, '0')}`;
}

/** Обратно: понедельник ISO-недели 'YYYY-Www' (неделя 1 содержит 4 января). */
export function isoWeekMonday(key: string): string {
    const [yearStr = '1970', weekStr = '1'] = key.split('-W');
    const year = Number(yearStr);
    const week = Number(weekStr);
    const jan4Dow = new Date(Date.UTC(year, 0, 4)).getUTCDay();
    const shift = (jan4Dow === 0 ? 7 : jan4Dow) - 1;
    const mondayWeek1 = Date.UTC(year, 0, 4) - shift * MS_DAY;
    return new Date(mondayWeek1 + (week - 1) * 7 * MS_DAY).toISOString().slice(0, 10);
}

/** Ключ ISO-недели, содержащей произвольную дату. */
export function weekKeyFromDate(iso: string): string {
    return isoWeekKey(mondayOf(iso));
}
