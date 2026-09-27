import type { Db } from '../db.js';

/**
 * Общие настройки приложения: key-value таблица `settings`. Дни зарплаты — для «дней до ЗП»
 * в обзоре месяца; массив, а не одно число — зарплата может приходить несколько раз в месяц
 * (например 7 и 22). Доход за один день зарплаты (salaryAmountKopecks) — план дохода месяца =
 * salaryAmountKopecks × salaryDays.length (MonthOverviewDto.plannedIncomeKopecks), используется
 * для «Баланс» (план дохода минус факт расходов месяца) в обзоре месяца. Займы (owedToUserKopecks) —
 * сколько должны пользователю другие люди; ручной ввод, НЕ выводится из операций (нет сущности
 * «займы» в схеме — сознательно, см. AGENTS.md) — просто справочная цифра рядом с Доход/Расходы/Баланс.
 */

const SALARY_DAYS_KEY = 'salary_days';
const SALARY_AMOUNT_KEY = 'salary_amount_kopecks';
const OWED_TO_USER_KEY = 'owed_to_user_kopecks';

/** Общий геттер/сеттер для «одно положительное целое копеек» ключей (salaryAmount, owedToUser). */
function getMoneySetting(db: Db, key: string): number | null {
    const row = db.prepare<[string], { value: string }>('SELECT value FROM settings WHERE key = ?').get(key);
    if (row === undefined) return null;
    const parsed = Number(row.value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function setMoneySetting(db: Db, key: string, amountKopecks: number | null): void {
    if (amountKopecks === null) {
        db.prepare('DELETE FROM settings WHERE key = ?').run(key);
        return;
    }
    db.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(key, String(amountKopecks), new Date().toISOString());
}

function parseSalaryDays(json: string): number[] {
    try {
        const parsed: unknown = JSON.parse(json);
        if (Array.isArray(parsed)) {
            return parsed
                .filter((item): item is number => typeof item === 'number' && Number.isInteger(item) && item >= 1 && item <= 31)
                .sort((a, b) => a - b);
        }
    } catch {
        // fallback ниже
    }
    return [];
}

export function getSalaryDays(db: Db): number[] {
    const row = db
        .prepare<[string], { value: string }>('SELECT value FROM settings WHERE key = ?')
        .get(SALARY_DAYS_KEY);
    return row === undefined ? [] : parseSalaryDays(row.value);
}

export function setSalaryDays(db: Db, days: number[]): void {
    const unique = Array.from(new Set(days)).sort((a, b) => a - b);
    if (unique.length === 0) {
        db.prepare('DELETE FROM settings WHERE key = ?').run(SALARY_DAYS_KEY);
        return;
    }
    db.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(SALARY_DAYS_KEY, JSON.stringify(unique), new Date().toISOString());
}

export function getSalaryAmountKopecks(db: Db): number | null {
    return getMoneySetting(db, SALARY_AMOUNT_KEY);
}

export function setSalaryAmountKopecks(db: Db, amountKopecks: number | null): void {
    setMoneySetting(db, SALARY_AMOUNT_KEY, amountKopecks);
}

export function getOwedToUserKopecks(db: Db): number | null {
    return getMoneySetting(db, OWED_TO_USER_KEY);
}

export function setOwedToUserKopecks(db: Db, amountKopecks: number | null): void {
    setMoneySetting(db, OWED_TO_USER_KEY, amountKopecks);
}
