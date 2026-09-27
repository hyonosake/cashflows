/**
 * Деньги: строка CSV → целые копейки, БЕЗ float-арифметики.
 * Регулярка: знак, целая часть, запятая-десятичный разделитель.
 * Дробная часть дополняется/обрезается до 2 знаков как строка.
 * Примеры: "-83,00" → -8300; "229743,72" → 22974372; "1,5" → 150.
 */

const AMOUNT_RE = /^(-?)(\d+)(?:,(\d+))?$/;

export class MoneyParseError extends Error {
    constructor(public readonly raw: string) {
        super(`Некорректная сумма: "${raw}"`);
        this.name = 'MoneyParseError';
    }
}

export function parseAmountToKopecks(raw: string): number {
    const match = AMOUNT_RE.exec(raw.trim());
    if (match === null) {
        throw new MoneyParseError(raw);
    }
    const sign = match[1] === '-' ? -1 : 1;
    const intPart = match[2] ?? '0';
    const fracRaw = match[3] ?? '';
    const frac = (fracRaw + '00').slice(0, 2); // дополнить/обрезать до 2 знаков
    const kopecks = Number.parseInt(intPart + frac, 10);
    if (!Number.isSafeInteger(kopecks)) {
        throw new MoneyParseError(raw);
    }
    return sign * kopecks;
}

/** Бонусы: как сумма, но ≥ 0. */
export function parseBonusToKopecks(raw: string): number {
    const value = parseAmountToKopecks(raw);
    return Math.max(0, value);
}
