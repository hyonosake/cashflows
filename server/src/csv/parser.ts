import { parse } from 'csv-parse/sync';

/**
 * Чтение и парсинг CSV-выгрузки:
 * UTF-8 (BOM отрезается), csv-parse/sync c delimiter ';', кавычки `"`, экранирование `""`,
 * поддержка многострочных ячеек. Наивный split(';') запрещён (samples/CSV_FORMAT.md §1, §7).
 * Колонки сопоставляются ПО ИМЕНАМ заголовков; отсутствие любого из 17 → ошибка файла целиком.
 */

/** 17 ожидаемых заголовков в каноническом порядке (индекс = порядок из CSV_FORMAT.md §2). */
export const EXPECTED_HEADERS: readonly string[] = [
    'Имя счёта',
    'Номер карты',
    'Дата операции',
    'Сумма операции',
    'Валюта операции',
    'Сумма в валюте счёта',
    'Валюта счёта',
    'Статус',
    'Категория по-умолчанию',
    'Ваша категория',
    'MCC',
    'Описание',
    'Сообщение',
    'Округление',
    'Сумма операции с округлением',
    'Бонусы (включая кэшбэк)',
    'Учёт в аналитике',
] as const;

/** Ошибка всего файла (битый CSV, нет заголовков, пустой файл) → HTTP 400. */
export class CsvFileError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CsvFileError';
    }
}

export type RawRow = Record<string, string>;

export interface ParsedCsv {
    /** Сырые строки данных, ключи — имена заголовков. */
    rows: RawRow[];
    /** Количество строк данных без заголовка. */
    parsed: number;
}

export function parseCsv(buffer: Buffer): ParsedCsv {
    let text = buffer.toString('utf8');
    if (text.charCodeAt(0) === 0xfeff) {
        text = text.slice(1); // толерантность к BOM, хотя контракт — «без BOM»
    }
    if (text.trim().length === 0) {
        throw new CsvFileError('Файл пуст: ожидался CSV с заголовком и строками операций');
    }

    let records: unknown[][];
    try {
        records = parse(text, {
            delimiter: ';',
            quote: '"',
            escape: '"',
            bom: false, // BOM уже отрезан вручную
            trim: false,
            relax_column_count: false, // все строки обязаны иметь одинаковую длину (17)
            skip_empty_lines: true,
        }) as unknown[][];
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new CsvFileError(`Не удалось разобрать CSV (ожидается разделитель «;» и кавычки «"» по RFC 4180): ${reason}`);
    }

    if (records.length === 0) {
        throw new CsvFileError('В файле нет заголовочной строки: ожидалось 17 колонок с русскими именами');
    }

    const header = (records[0] ?? []).map((cell) => String(cell ?? '').trim());
    const missing = EXPECTED_HEADERS.filter((name) => !header.includes(name));
    if (missing.length > 0) {
        throw new CsvFileError(`Отсутствуют ожидаемые колонки заголовка: ${missing.join(', ')}`);
    }

    // Сопоставление колонок ПО ИМЕНАМ (порядок/состав колонок может отличаться между выгрузками).
    const headerIndex = new Map<string, number>();
    header.forEach((name, index) => {
        if (!headerIndex.has(name)) {
            headerIndex.set(name, index);
        }
    });

    const rows: RawRow[] = [];
    for (let i = 1; i < records.length; i++) {
        const record = records[i] ?? [];
        const row: RawRow = {};
        for (const name of EXPECTED_HEADERS) {
            const index = headerIndex.get(name);
            const value = index === undefined ? '' : record[index];
            row[name] = value === undefined || value === null ? '' : String(value);
        }
        rows.push(row);
    }

    return { rows, parsed: rows.length };
}
