import type { Db } from '../db.js';
import { parseCsv, CsvFileError } from '../csv/parser.js';
import { normalizeRow, type NormalizedRow } from '../csv/normalize.js';
import type { ImportErrorDto, ImportResultDto } from '../../../shared/types.js';

/**
 * Оркестрация импорта CSV-файла (ARCHITECTURE.md §6.4): нормализация + дедупликация
 * по hash с учётом кратности + вставка в одной транзакции. Мерчант (description) —
 * find-or-create в merchants; «Ваша категория» из CSV — разовый override операции,
 * ТОЛЬКО если совпадает с существующей user_categories.name (строгий список категорий —
 * импорт не создаёт новые категории «на лету»).
 *
 * Алгоритм дедупликации (учёт кратности): кратность каждого хеша внутри файла сравнивается
 * с уже существующим количеством в БД; первые count_in_db экземпляров считаются дубликатами,
 * остальные вставляются. Свойства: первый импорт образца → inserted=117 (две одинаковые
 * поездки метро — две реальные операции); повторный импорт → duplicatesSkipped=117.
 */

const CHUNK_SIZE = 500;

function existingHashCounts(db: Db, hashes: string[]): Map<string, number> {
    const unique = Array.from(new Set(hashes));
    const counts = new Map<string, number>();
    for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
        const chunk = unique.slice(i, i + CHUNK_SIZE);
        // IN-запрос чанком по 500 (ARCHITECTURE.md §6.4)
        const placeholders = chunk.map(() => '?').join(',');
        const rows = db
            .prepare<string[], { hash: string; cnt: number }>(
                `SELECT hash, COUNT(*) AS cnt FROM operations WHERE hash IN (${placeholders}) GROUP BY hash`,
            )
            .all(...chunk);
        for (const row of rows) {
            counts.set(row.hash, row.cnt);
        }
    }
    return counts;
}

const insertOpSql = `
INSERT INTO operations (
  hash, datetime_iso, local_date, amount_kopecks, type, account, card, currency,
  status, category_default, mcc, description, message, bonuses_kopecks,
  include_in_analytics, merchant_id, user_category_override_id, source_file, imported_at
) VALUES (
  @hash, @datetimeIso, @localDate, @amountKopecks, @type, @account, @card, @currency,
  @status, @categoryDefault, @mcc, @description, @message, @bonusesKopecks,
  @includeInAnalytics, @merchantId, @overrideId, @sourceFile, @importedAt
)`;

/**
 * Импорт CSV-буфера. Ошибка всего файла (битый CSV) → CsvFileError (роут отдаёт 400).
 * Построчные ошибки нормализации попадают в errors[] (импорт продолжается, ответ 200).
 */
export function importCsvBuffer(db: Db, buffer: Buffer, sourceFile: string): ImportResultDto {
    const { rows, parsed } = parseCsv(buffer); // бросает CsvFileError для битого/пустого файла

    const errors: ImportErrorDto[] = [];
    const normalized: NormalizedRow[] = [];

    for (let i = 0; i < rows.length; i++) {
        const line = i + 2; // строка 1 — заголовок
        const row = rows[i] as Record<string, string>;
        try {
            normalized.push(normalizeRow(row, line));
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            errors.push({ line, reason });
        }
    }

    const importedAt = new Date().toISOString();
    let inserted = 0;
    let duplicatesSkipped = 0;

    const runTransaction = db.transaction(() => {
        // counts = сколько экземпляров каждого хеша уже есть в БД ДО импорта.
        // Каждая строка файла «потребляет» один экземпляр как дубликат (декремент);
        // при вставке counts НЕ увеличивается — поэтому две одинаковые строки внутри
        // одного файла вставляются обе (две реальные поездки метро), а повторный
        // импорт целого файла целиком уходит в duplicatesSkipped.
        const counts = existingHashCounts(
            db,
            normalized.map((row) => row.hash),
        );

        const insertRaw = db.prepare('INSERT OR IGNORE INTO raw_transactions (hash, raw_row, source_file, imported_at) VALUES (?, ?, ?, ?)');
        const findMerchant = db.prepare<[string], { id: number }>('SELECT id FROM merchants WHERE name = ?');
        const insertMerchant = db.prepare('INSERT INTO merchants (name, created_at) VALUES (?, ?)');
        const findUserCategory = db.prepare<[string], { id: number }>('SELECT id FROM user_categories WHERE name = ?');
        const insertOp = db.prepare<NormalizedRow & { merchantId: number; overrideId: number | null; sourceFile: string; importedAt: string }, []>(
            insertOpSql,
        );

        const merchantIdByName = new Map<string, number>();
        const findOrCreateMerchant = (name: string): number => {
            const cached = merchantIdByName.get(name);
            if (cached !== undefined) return cached;
            const existing = findMerchant.get(name);
            const id = existing !== undefined ? existing.id : Number(insertMerchant.run(name, importedAt).lastInsertRowid);
            merchantIdByName.set(name, id);
            return id;
        };

        for (const row of normalized) {
            const existing = counts.get(row.hash) ?? 0;
            if (existing > 0) {
                counts.set(row.hash, existing - 1);
                duplicatesSkipped += 1;
                continue;
            }
            insertRaw.run(row.hash, JSON.stringify(row.rawRow), sourceFile, importedAt);
            const merchantId = findOrCreateMerchant(row.description);
            const overrideId = row.categoryUserRaw !== null ? findUserCategory.get(row.categoryUserRaw)?.id ?? null : null;
            insertOp.run({ ...row, merchantId, overrideId, sourceFile, importedAt });
            inserted += 1;
        }
    });

    runTransaction();

    return { sourceFile, parsed, inserted, duplicatesSkipped, errors };
}

export { CsvFileError };
