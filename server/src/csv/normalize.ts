import { createHash } from 'node:crypto';
import type { RawRow } from './parser.js';
import { parseAmountToKopecks, parseBonusToKopecks, MoneyParseError } from '../domain/money.js';
import type { OperationType } from '../../../shared/types.js';

/**
 * Нормализация сырой CSV-строки в доменный объект:
 * даты → UTC ISO + local_date (Москва = UTC+3), суммы → копейки, include_in_analytics,
 * sha256-хеш всех 17 сырых полей. Категория больше НЕ вычисляется здесь — эффективная
 * категория теперь живой JOIN на чтении (см. db.ts → operations_effective); импорт только
 * сохраняет мерчанта (description) и, если «Ваша категория» из CSV совпадает с существующей
 * user_categories.name, — разовый override (import.ts).
 */

export interface NormalizedRow {
    hash: string;
    datetimeIso: string; // UTC ISO-8601
    localDate: string; // YYYY-MM-DD по Москве
    amountKopecks: number; // со знаком
    type: OperationType;
    account: string;
    card: string | null;
    currency: string;
    status: string;
    categoryDefault: string;
    categoryUserRaw: string | null; // сырое значение «Ваша категория»; резолвится в override в import.ts
    mcc: string | null;
    description: string;
    message: string;
    bonusesKopecks: number;
    includeInAnalytics: 0 | 1;
    rawRow: string[]; // все 17 сырых значений по порядку — для raw_transactions.raw_row
}

export class RowNormalizeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RowNormalizeError';
    }
}

const DATETIME_RE = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})$/;

/**
 * Сырое значение DD.MM.YYYY HH:mm:ss — московское локальное время (UTC+3 фиксированно,
 * DST нет). local_date — чистая строковая операция,
 * datetime_iso — Date.UTC(...) − 3ч.
 */
export function parseMoscowDateTime(raw: string): { datetimeIso: string; localDate: string } {
    const match = DATETIME_RE.exec(raw.trim());
    if (match === null) {
        throw new RowNormalizeError(`Некорректная дата (ожидается DD.MM.YYYY HH:mm:ss): "${raw}"`);
    }
    const [, dd, mm, yyyy, hh, min, ss] = match as unknown as [string, string, string, string, string, string, string];
    const day = Number(dd);
    const month = Number(mm);
    const year = Number(yyyy);
    const hour = Number(hh);
    const minute = Number(min);
    const second = Number(ss);
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
        throw new RowNormalizeError(`Некорректная дата (вне диапазона): "${raw}"`);
    }
    const localDate = `${yyyy}-${mm}-${dd}`;
    const utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - 3 * 60 * 60 * 1000;
    const datetimeIso = new Date(utcMs).toISOString().replace('.000Z', 'Z');
    return { datetimeIso, localDate };
}

/** sha256 от конкатенации всех 17 сырых значений разделителем \x1F. */
export function rowHash(values: readonly string[]): string {
    return createHash('sha256').update(values.join('\x1F'), 'utf8').digest('hex');
}

/** «Учёт в аналитике»: только «Да» → 1, любые другие значения → 0. */
export function parseIncludeInAnalytics(raw: string): 0 | 1 {
    return raw.trim() === 'Да' ? 1 : 0;
}

/** Нормализация одной сырой строки. Бросает RowNormalizeError при нечитаемых дате/сумме. */
export function normalizeRow(row: RawRow, line: number): NormalizedRow {
    try {
        const { datetimeIso, localDate } = parseMoscowDateTime(row['Дата операции'] ?? '');
        const amountKopecks = parseAmountToKopecks(row['Сумма операции'] ?? '');
        const bonusesKopecks = parseBonusToKopecks(row['Бонусы (включая кэшбэк)'] ?? '');
        const account = (row['Имя счёта'] ?? '').trim();
        const cardRaw = (row['Номер карты'] ?? '').trim();
        const currency = (row['Валюта операции'] ?? '').trim();
        const status = (row['Статус'] ?? '').trim();
        const categoryDefault = (row['Категория по-умолчанию'] ?? '').trim();
        const categoryUserRaw = (row['Ваша категория'] ?? '').trim();
        const mccRaw = (row['MCC'] ?? '').trim();
        const description = (row['Описание'] ?? '').trim();
        const message = (row['Сообщение'] ?? '').trim();

        if (account.length === 0) {
            throw new RowNormalizeError('Пустое значение «Имя счёта»');
        }
        if (currency.length === 0) {
            throw new RowNormalizeError('Пустое значение «Валюта операции»');
        }

        const mcc = /^\d{4}$/.test(mccRaw) ? mccRaw : null;
        const rawRow = [
            row['Имя счёта'] ?? '',
            row['Номер карты'] ?? '',
            row['Дата операции'] ?? '',
            row['Сумма операции'] ?? '',
            row['Валюта операции'] ?? '',
            row['Сумма в валюте счёта'] ?? '',
            row['Валюта счёта'] ?? '',
            row['Статус'] ?? '',
            row['Категория по-умолчанию'] ?? '',
            row['Ваша категория'] ?? '',
            row['MCC'] ?? '',
            row['Описание'] ?? '',
            row['Сообщение'] ?? '',
            row['Округление'] ?? '',
            row['Сумма операции с округлением'] ?? '',
            row['Бонусы (включая кэшбэк)'] ?? '',
            row['Учёт в аналитике'] ?? '',
        ];

        return {
            hash: rowHash(rawRow),
            datetimeIso,
            localDate,
            amountKopecks,
            type: amountKopecks < 0 ? 'expense' : 'income',
            account,
            card: cardRaw.length > 0 ? cardRaw : null,
            currency,
            status,
            categoryDefault: categoryDefault.length > 0 ? categoryDefault : 'Без категории',
            categoryUserRaw: categoryUserRaw.length > 0 ? categoryUserRaw : null,
            mcc,
            description,
            message,
            bonusesKopecks,
            includeInAnalytics: parseIncludeInAnalytics(row['Учёт в аналитике'] ?? ''),
            rawRow,
        };
    } catch (error) {
        if (error instanceof MoneyParseError || error instanceof RowNormalizeError) {
            throw new RowNormalizeError(`${error.message}`);
        }
        throw error;
    }
}
