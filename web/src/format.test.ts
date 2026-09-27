import { describe, expect, it } from 'vitest';
import {
    formatDate,
    formatDateShort,
    formatDateTime,
    formatMoney,
    formatMoneyShort,
    formatMoneyWhole,
    formatPercent,
    formatSignedPercent,
    formatWeekRange,
    kopecksToRublesInput,
    parseRublesToKopecks,
} from './format';

/** NBSP (U+00A0) — символ группировки тысяч в Intl.NumberFormat('ru-RU'). */
const NBSP = '\u00A0';
/** Типографский минус U+2212: formatMoney/formatSignedPercent ставят его вручную. */
const MINUS = '\u2212';

describe('formatMoney', () => {
    it.each([
        [0, '0,00 ₽'],
        [1, '0,01 ₽'],
        [99, '0,99 ₽'],
        [100, '1,00 ₽'],
        [123456, `1${NBSP}234,56 ₽`],
        [22974372, `229${NBSP}743,72 ₽`],
        [12345678900, `123${NBSP}456${NBSP}789,00 ₽`],
        [-123456, `${MINUS}1${NBSP}234,56 ₽`],
        [-1, `${MINUS}0,01 ₽`],
        [-100, `${MINUS}1,00 ₽`],
    ])('копейки %i → «%s»', (kopecks, expected) => {
        expect(formatMoney(kopecks)).toBe(expected);
    });
});

describe('formatMoneyWhole (без копеек, округление всегда вверх)', () => {
    it.each([
        [0, '0 ₽'],
        [100, '1 ₽'], // 1,00 — копеек нет, округлять нечего
        [101, '2 ₽'], // 1,01 → вверх, а не «вниз, т.к. меньше половины»
        [149, '2 ₽'], // 1,49 → вверх (не half-up: было бы «1 ₽»)
        [150, '2 ₽'], // 1,50 → вверх
        [123456, `1${NBSP}235 ₽`],
        [-150, `${MINUS}2 ₽`], // по модулю: 1,50 → 2
        [-149, `${MINUS}2 ₽`], // по модулю: 1,49 → вверх → 2 (не «−1 ₽»)
        [-100, `${MINUS}1 ₽`], // копеек нет — округлять нечего
    ])('копейки %i → «%s»', (kopecks, expected) => {
        expect(formatMoneyWhole(kopecks)).toBe(expected);
    });
});

describe('formatMoneyShort (оси графиков)', () => {
    it.each([
        [0, '0 ₽'],
        [50000, '500 ₽'],
        [99900, '999 ₽'],
        [123456, '1,2 тыс ₽'],
        [12345678, '123,5 тыс ₽'],
        [250000000, '2,5 млн ₽'],
        [1500000000, '15 млн ₽'],
        [-1500000, `${MINUS}15 тыс ₽`],
        [-500, `${MINUS}5 ₽`],
    ])('копейки %i → «%s»', (kopecks, expected) => {
        expect(formatMoneyShort(kopecks)).toBe(expected);
    });
});

describe('formatPercent', () => {
    it.each([
        [42, '42 %'],
        [0, '0 %'],
        [7.6, '8 %'],
        [-8, '-8 %'],
    ])('%f → «%s»', (pct, expected) => {
        expect(formatPercent(pct)).toBe(expected);
    });

    it('null → «—»', () => {
        expect(formatPercent(null)).toBe('—');
    });
});

describe('formatSignedPercent', () => {
    it.each([
        [0, '0 %'],
        [25, '+25 %'],
        [-15, `${MINUS}15 %`],
        [12.34, '+12,3 %'],
        [-4.12, `${MINUS}4,1 %`],
        [100, '+100 %'],
        [0.04, '0 %'],
    ])('%f → «%s»', (pct, expected) => {
        expect(formatSignedPercent(pct)).toBe(expected);
    });

    it('null → «—»', () => {
        expect(formatSignedPercent(null)).toBe('—');
    });
});

describe('formatDate / formatDateShort', () => {
    it('«2026-09-07» → «07.09.2026»', () => {
        expect(formatDate('2026-09-07')).toBe('07.09.2026');
    });

    it('короткий формат: «2026-09-07» → «07.09»', () => {
        expect(formatDateShort('2026-09-07')).toBe('07.09');
    });

    it('нераспознанная строка возвращается как есть', () => {
        expect(formatDate('мусор')).toBe('мусор');
        expect(formatDateShort('мусор')).toBe('мусор');
    });
});

describe('formatDateTime (московское время = UTC+3)', () => {
    it('UTC-мгновение → московская дата и время', () => {
        expect(formatDateTime('2026-09-08T19:41:24Z')).toBe('08.09.2026 22:41');
    });

    it('московская полночь переходит через сутки', () => {
        expect(formatDateTime('2026-01-01T21:30:00Z')).toBe('02.01.2026 00:30');
    });

    it('нераспознанная строка возвращается как есть', () => {
        expect(formatDateTime('не дата')).toBe('не дата');
    });
});

describe('formatWeekRange', () => {
    it('одинаковый год: год в конце диапазона', () => {
        expect(formatWeekRange('2026-09-21', '2026-09-27')).toBe('21.09 – 27.09.2026');
    });

    it('разные годы: год у обеих дат', () => {
        expect(formatWeekRange('2025-12-29', '2026-01-04')).toBe('29.12.2025 – 04.01.2026');
    });

    it('битые даты → исходный диапазон без форматирования', () => {
        expect(formatWeekRange('битая', '2026-01-04')).toBe('битая – 2026-01-04');
    });
});

describe('parseRublesToKopecks', () => {
    it.each([
        ['1234,56', 123456],
        ['1234.56', 123456],
        ['0', 0],
        ['00', 0],
        ['5', 500],
        ['1,5', 150],
        ['1,50', 150],
        [' 123,45 ', 12345],
        ['-1234,56', -123456],
        ['-1', -100],
        ['-0,01', -1],
    ])('«%s» → %i копеек', (raw, expected) => {
        expect(parseRublesToKopecks(raw)).toBe(expected);
    });

    it.each([
        [''],
        ['   '],
        ['abc'],
        ['12,345'],
        ['1 234.56'],
        ['1e3'],
        ['+5'],
        ['-'],
        ['12,'],
    ])('мусор «%s» → null', (raw) => {
        expect(parseRublesToKopecks(raw)).toBeNull();
    });

    it('число за пределами safe integer → null', () => {
        expect(parseRublesToKopecks('99999999999999999')).toBeNull();
    });
});

describe('kopecksToRublesInput', () => {
    it.each([
        [123456, '1234,56'],
        [0, '0,00'],
        [1, '0,01'],
        [5, '0,05'],
        [99, '0,99'],
        [100, '1,00'],
        [-123456, '-1234,56'],
        [-1, '-0,01'],
    ])('%i копеек → «%s»', (kopecks, expected) => {
        expect(kopecksToRublesInput(kopecks)).toBe(expected);
    });
});

describe('обратимость parseRublesToKopecks ↔ kopecksToRublesInput', () => {
    it.each([0, 1, 5, 50, 99, 100, 101, 123456, 22974372, 12345678900, -1, -99, -100, -123456, -22974372])(
        'parse(toRublesInput(%i)) === %i',
        (kopecks) => {
            expect(parseRublesToKopecks(kopecksToRublesInput(kopecks))).toBe(kopecks);
        },
    );

    it('точка нормализуется в запятую (каноническая форма input)', () => {
        const parsed = parseRublesToKopecks('1234.56');
        expect(parsed).toBe(123456);
        expect(kopecksToRublesInput(parsed ?? 0)).toBe('1234,56');
    });

    it('серверный пример «-83,00» → −8300 копеек и обратно', () => {
        const parsed = parseRublesToKopecks('-83,00');
        expect(parsed).toBe(-8300);
        expect(kopecksToRublesInput(parsed ?? 0)).toBe('-83,00');
    });
});
