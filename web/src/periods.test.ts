import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    addDays,
    currentPeriodKeys,
    isoWeekKey,
    isoWeekMonday,
    mondayOf,
    monthKeyFromDate,
    todayIso,
    weekKeyFromDate,
    weekRangeFromOffset,
} from './periods';

/** Подмена системного времени (Date.now/new Date) на указанное UTC-мгновение. */
function mockNowUtc(isoUtc: string): void {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(isoUtc));
}

afterEach(() => {
    vi.useRealTimers();
});

/** День недели ISO: 1=Пн … 7=Вс. */
function isoDow(iso: string): number {
    const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
    return dow === 0 ? 7 : dow;
}

describe('todayIso (Москва = UTC+3, фиксированный сдвиг, без TZ-библиотек)', () => {
    it('днём по UTC — сегодняшний московский день', () => {
        mockNowUtc('2026-09-24T11:00:00Z'); // 14:00 МСК
        expect(todayIso()).toBe('2026-09-24');
    });

    it('за секунду до московской полуночи — ещё «сегодня»', () => {
        mockNowUtc('2026-09-24T20:59:59Z'); // 23:59:59 МСК
        expect(todayIso()).toBe('2026-09-24');
    });

    it('ровно в московскую полночь (21:00 UTC предыдущего дня) день уже следующий', () => {
        mockNowUtc('2026-09-24T21:00:00Z'); // 00:00 МСК 25.09
        expect(todayIso()).toBe('2026-09-25');
    });

    it('поздним вечером UTC местная дата не съезжает: не UTC-день, а московский', () => {
        mockNowUtc('2026-09-24T23:59:59Z'); // 02:59:59 МСК 25.09
        expect(todayIso()).toBe('2026-09-25');
    });

    it('вечером UTC до полуночи МСК — ещё сегодняшний день (не «завтра»)', () => {
        mockNowUtc('2026-09-24T18:00:00Z'); // 21:00 МСК того же дня
        expect(todayIso()).toBe('2026-09-24');
    });
});

describe('addDays (чистая календарная арифметика в UTC)', () => {
    it.each([
        ['2026-09-21', 6, '2026-09-27'],
        ['2026-09-27', 1, '2026-09-28'],
        ['2026-09-28', 6, '2026-10-04'],
        ['2026-12-28', 6, '2027-01-03'],
        ['2026-09-21', -7, '2026-09-14'],
        ['2026-03-01', -1, '2026-02-28'],
        ['2024-03-01', -1, '2024-02-29'],
    ])('addDays(%s, %i) = %s', (iso, days, expected) => {
        expect(addDays(iso, days)).toBe(expected);
    });
});

describe('mondayOf (неделя Пн–Вс)', () => {
    it.each([
        ['2026-09-21', '2026-09-21'],
        ['2026-09-23', '2026-09-21'],
        ['2026-09-27', '2026-09-21'],
        ['2026-09-20', '2026-09-14'],
        ['2026-01-04', '2025-12-29'],
    ])('mondayOf(%s) = %s', (iso, expected) => {
        expect(mondayOf(iso)).toBe(expected);
    });

    it('известная дата: 2026-09-23 — среда недели 21.09–27.09', () => {
        expect(isoDow('2026-09-23')).toBe(3);
        expect(isoDow(mondayOf('2026-09-23'))).toBe(1);
        expect(mondayOf('2026-09-23')).toBe('2026-09-21');
    });

    it('воскресенье принадлежит своей неделе, а не следующей', () => {
        expect(isoDow('2026-09-27')).toBe(7);
        expect(mondayOf('2026-09-27')).toBe('2026-09-21');
    });
});

describe('weekRangeFromOffset', () => {
    it('текущая неделя: Пн–Вс от сегодняшнего московского дня', () => {
        mockNowUtc('2026-09-23T12:00:00Z'); // среда, 15:00 МСК
        expect(weekRangeFromOffset(0)).toEqual({ from: '2026-09-21', to: '2026-09-27' });
        expect(isoDow(weekRangeFromOffset(0).from)).toBe(1);
        expect(isoDow(weekRangeFromOffset(0).to)).toBe(7);
    });

    it('смещения −1/+1: прошлая и следующая недели', () => {
        mockNowUtc('2026-09-23T12:00:00Z');
        expect(weekRangeFromOffset(-1)).toEqual({ from: '2026-09-14', to: '2026-09-20' });
        expect(weekRangeFromOffset(1)).toEqual({ from: '2026-09-28', to: '2026-10-04' });
    });

    it('граница недели — московская полночь вс→пн (21:00 UTC), а не UTC-полночь', () => {
        mockNowUtc('2026-09-27T20:59:59Z'); // 23:59:59 МСК воскресенья
        expect(weekRangeFromOffset(0)).toEqual({ from: '2026-09-21', to: '2026-09-27' });
        vi.setSystemTime(new Date('2026-09-27T21:00:00Z')); // 00:00 МСК понедельника
        expect(weekRangeFromOffset(0)).toEqual({ from: '2026-09-28', to: '2026-10-04' });
    });
});

describe('currentPeriodKeys', () => {
    it('сентябрьская неделя 2026: 2026-W39 / 2026-09', () => {
        mockNowUtc('2026-09-23T12:00:00Z');
        expect(currentPeriodKeys()).toEqual({ week: '2026-W39', month: '2026-09' });
    });

    it('1 января по Москве: W01 и январь', () => {
        mockNowUtc('2026-01-01T00:00:00Z'); // 03:00 МСК 1 января
        expect(currentPeriodKeys()).toEqual({ week: '2026-W01', month: '2026-01' });
    });

    it('новый год по Москве наступает раньше, чем по UTC', () => {
        mockNowUtc('2025-12-31T21:00:00Z'); // 00:00 МСК 1 января 2026
        expect(currentPeriodKeys()).toEqual({ week: '2026-W01', month: '2026-01' });
    });
});

describe('isoWeekKey (формат YYYY-Wnn)', () => {
    it.each([
        ['2026-09-21', '2026-W39'],
        ['2026-02-02', '2026-W06'],
        ['2025-12-29', '2026-W01'],
        ['2020-12-28', '2020-W53'],
    ])('понедельник %s → %s', (monday, expected) => {
        expect(isoWeekKey(monday)).toBe(expected);
    });

    it('ведущий ноль у номера недели и соответствие формату YYYY-Wnn', () => {
        const key = isoWeekKey(mondayOf('2026-01-01'));
        expect(key).toBe('2026-W01');
        expect(key).toMatch(/^\d{4}-W\d{2}$/);
    });
});

describe('isoWeekMonday (обратное преобразование)', () => {
    it.each([
        ['2026-W39', '2026-09-21'],
        ['2026-W01', '2025-12-29'],
        ['2020-W53', '2020-12-28'],
        ['2021-W01', '2021-01-04'],
    ])('%s → %s', (key, expected) => {
        expect(isoWeekMonday(key)).toBe(expected);
    });
});

describe('weekKeyFromDate (ISO-неделя произвольной даты)', () => {
    it.each([
        ['2026-09-23', '2026-W39'],
        ['2026-01-01', '2026-W01'],
        ['2025-12-29', '2026-W01'],
        ['2021-01-01', '2020-W53'],
        ['2026-09-20', '2026-W38'],
        ['2026-09-27', '2026-W39'],
    ])('%s → %s', (iso, expected) => {
        expect(weekKeyFromDate(iso)).toBe(expected);
    });

    it('неделя меняется в понедельник: воскресенье — последний день старой недели', () => {
        expect(weekKeyFromDate('2026-09-20')).toBe('2026-W38'); // воскресенье
        expect(weekKeyFromDate('2026-09-21')).toBe('2026-W39'); // понедельник
    });
});

describe('roundtrip: isoWeekMonday(weekKeyFromDate(...)) = mondayOf(...)', () => {
    it.each(['2026-09-23', '2026-01-01', '2025-12-29', '2021-01-01', '2020-12-31', '2024-02-29'])(
        '%s',
        (iso) => {
            expect(isoWeekMonday(weekKeyFromDate(iso))).toBe(mondayOf(iso));
        },
    );
});

describe('monthKeyFromDate', () => {
    it.each([
        ['2026-09-23', '2026-09'],
        ['2026-01-01', '2026-01'],
        ['2025-12-31', '2025-12'],
    ])('%s → %s', (iso, expected) => {
        expect(monthKeyFromDate(iso)).toBe(expected);
    });
});
