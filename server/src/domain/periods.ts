/**
 * Периоды дашборда (ARCHITECTURE.md §8.1): недели Пн–Вс по Europe/Moscow,
 * ISO-ключи '2026-W37' / '2026-09', «сегодня по Москве», предыдущий период.
 *
 * Europe/Moscow с 2014 года — фиксированный UTC+3 (DST нет), поэтому таймзонные
 * вычисления делаются простым сдвигом на +3ч без tz-библиотек (допущение §11.1).
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

/** Первый/последний день календарного месяца, содержащего isoDate (для резервов — §8.7). */
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
 * Разбивка календарного месяца на недели Пн–Вс (§8.8, обзор месяца), обрезанные
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
function daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
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

/** Количество полных дней между двумя календарными датами (to − from). */
export function daysBetween(from: string, to: string): number {
    const ms = (iso: string): number =>
        Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
    return Math.round((ms(to) - ms(from)) / DAY_MS);
}

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

/** Период для планов/бюджетов по типу окна: неделя → ISO-ключ, месяц → 'YYYY-MM', range → null. */
export function periodKeyFor(from: string, to: string, type: DashboardPeriodType): string | null {
    if (type === 'week') {
        return isoWeekKey(from);
    }
    if (type === 'month') {
        return monthKey(from);
    }
    return null;
}

/** Предыдущий период для сравнения: окно той же длины, сдвинутое на 7 дней назад. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
    return { from: addDays(from, -7), to: addDays(to, -7) };
}

/** Количество дней в окне включительно (для заполнения byDay нулями). */
export function daysInclusive(from: string, to: string): string[] {
    const days: string[] = [];
    let cursor = from;
    while (cursor <= to) {
        days.push(cursor);
        cursor = addDays(cursor, 1);
    }
    return days;
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
