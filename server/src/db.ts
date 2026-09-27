import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

/**
 * Открытие БД и идемпотентное создание схемы.
 * Никаких ORM и миграционных фреймворков: CREATE TABLE IF NOT EXISTS — весь механизм.
 * Деньги — целые копейки (INTEGER). Время — двойное: datetime_iso (UTC) + local_date (Europe/Moscow).
 *
 * Категории нормализованы (без «запекания»): operations ссылается на raw_transactions (по hash)
 * и merchants; эффективная категория — живой JOIN через вью operations_effective (см. ниже),
 * а не колонка. Приоритет: разовый override операции → custom_mappings (по message) →
 * merchants.user_category_id → mcc_mappings → «Без категории».
 */

export type Db = Database.Database;

const SCHEMA = `
-- Архив сырых CSV-строк на дедуп. hash — сам PK (уникален по построению всех 17 сырых
-- значений); несколько operations могут законно ссылаться на один и тот же hash
-- (повторяющиеся идентичные траты — см. дедуп с учётом кратности). raw_row — JSON-массив
-- 17 исходных строк CSV как есть; для исторических операций NULL (сырой текст не хранился
-- до этой схемы, сохранялся только его hash).
CREATE TABLE IF NOT EXISTS raw_transactions (
  hash TEXT PRIMARY KEY,
  raw_row TEXT,
  source_file TEXT NOT NULL,
  imported_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hash TEXT NOT NULL,                    -- REFERENCES raw_transactions(hash)
  datetime_iso TEXT NOT NULL,            -- мгновение UTC, ISO-8601 (2026-09-08T19:41:24Z)
  local_date TEXT NOT NULL,              -- календарный день по Москве, YYYY-MM-DD
  amount_kopecks INTEGER NOT NULL,       -- СО ЗНАКОМ: <0 расход, >0 доход/поступление
  type TEXT NOT NULL CHECK (type IN ('income','expense')),
  account TEXT NOT NULL,
  card TEXT,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  category_default TEXT NOT NULL,        -- банковская категория; только справочно, в резолвинге не участвует
  mcc TEXT,
  description TEXT NOT NULL DEFAULT '',  -- = merchants.name
  message TEXT NOT NULL DEFAULT '',      -- «Сообщение» из CSV, матчится custom_mappings
  bonuses_kopecks INTEGER NOT NULL DEFAULT 0,
  include_in_analytics INTEGER NOT NULL CHECK (include_in_analytics IN (0,1)),
  merchant_id INTEGER REFERENCES merchants(id),
  user_category_override_id INTEGER REFERENCES user_categories(id), -- разовая категория ЭТОЙ операции
  source_file TEXT NOT NULL,
  imported_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ops_hash ON operations(hash);
CREATE INDEX IF NOT EXISTS idx_ops_local_date ON operations(local_date);

-- Общие сферы категорий («Жильё и связь», «Сима» и т.п.) — абстракция поверх user_categories.
CREATE TABLE IF NOT EXISTS category_abstract (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  category_abstract_id INTEGER REFERENCES category_abstract(id),
  type TEXT CHECK (type IN ('fixed','variable','reserve')),
  month_limit_kopecks INTEGER CHECK (month_limit_kopecks > 0),  -- опционально
  year_limit_kopecks INTEGER CHECK (year_limit_kopecks > 0),    -- опционально
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS merchants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,             -- = operations.description
  user_category_id INTEGER REFERENCES user_categories(id),
  created_at TEXT NOT NULL
);

-- Фолбэк по банковскому MCC-коду, когда у мерчанта самого по себе ещё нет категории.
-- Только однозначные коды — неоднозначные (один код на
-- несколько разных user_categories, банк использует их как «мусорную» общую метку)
-- сюда не попадают, такие операции остаются на уровне мерчанта.
CREATE TABLE IF NOT EXISTS mcc_mappings (
  mcc TEXT PRIMARY KEY,
  user_category_id INTEGER NOT NULL REFERENCES user_categories(id),
  created_at TEXT NOT NULL
);

-- Правила по тексту «Сообщения» перевода (например, по конкретному отправителю/переводчику) —
-- высший приоритет среди автоматических правил, до merchant/mcc (по явной просьбе пользователя).
CREATE TABLE IF NOT EXISTS custom_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_value TEXT NOT NULL,
  user_category_id INTEGER NOT NULL REFERENCES user_categories(id),
  created_at TEXT NOT NULL
);

-- Финансовые цели — минимальный вид: имя + сумма, без автоматического прогресса по категориям.
CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  amount_kopecks INTEGER NOT NULL CHECK (amount_kopecks > 0),
  created_at TEXT NOT NULL
);

-- Общие настройки приложения, ключ-значение. Пока единственный ключ — 'salary_days'
-- (JSON-массив дней месяца 1..31 — зарплата может приходить несколько раз в месяц).
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

/**
 * Эффективная категория как живой JOIN — приоритет:
 * 1) разовый override операции (user_category_override_id);
 * 2) custom_mappings по подстроке в message (instr — точная подстрока, как JS .includes());
 * 3) merchants.user_category_id (через merchant_id);
 * 4) mcc_mappings по operations.mcc;
 * 5) «Без категории».
 */
const OPERATIONS_EFFECTIVE_VIEW = `
DROP VIEW IF EXISTS operations_effective;
CREATE VIEW operations_effective AS
SELECT
  o.*,
  COALESCE(
    o.user_category_override_id,
    (SELECT cm.user_category_id FROM custom_mappings cm
     WHERE o.message != '' AND instr(o.message, cm.match_value) > 0
     ORDER BY cm.id LIMIT 1),
    (SELECT m.user_category_id FROM merchants m WHERE m.id = o.merchant_id),
    (SELECT mm.user_category_id FROM mcc_mappings mm WHERE mm.mcc = o.mcc),
    (SELECT id FROM user_categories WHERE name = 'Без категории')
  ) AS effective_user_category_id
FROM operations o;
`;

/**
 * Идемпотентная миграция: колонки operations.category/category_user — наследие схемы ДО
 * рефакторинга категорий (см. шапку файла и AGENTS.md, инвариант 5). На уже созданных БД они
 * физически всё ещё есть (`CREATE TABLE IF NOT EXISTS` не трогает существующую таблицу и не
 * убирает лишние колонки), хотя текущий код их нигде не читает и не пишет — единственный
 * источник эффективной категории теперь operations_effective (см. ниже). Проблема: `category`
 * объявлена NOT NULL без DEFAULT, а insertOpSql (domain/import.ts) её не заполняет — INSERT
 * любой РЕАЛЬНО новой (не дублирующейся) операции падал `NOT NULL constraint failed:
 * operations.category` (вскрыто вручную на копии реальной БД, т.к. повторные импорты образца
 * всегда шли по ветке «дубликат» и до INSERT не доходили). DROP COLUMN (SQLite 3.35+,
 * better-sqlite3 здесь — 3.53) убирает обе колонки безвозвратно; идемпотентно — проверка
 * через PRAGMA table_info, на уже помигрированной или изначально новой БД колонок нет и
 * функция ничего не делает. Индекс на `category` дропается первым — DROP COLUMN не работает,
 * пока колонка входит в индекс.
 */
function migrateDropLegacyOperationCategoryColumns(db: Db): void {
  const columns = db.prepare('PRAGMA table_info(operations)').all() as Array<{ name: string }>;
  const names = new Set(columns.map((c) => c.name));
  if (names.has('category')) {
    db.exec('DROP INDEX IF EXISTS idx_ops_category');
    db.exec('ALTER TABLE operations DROP COLUMN category');
  }
  if (names.has('category_user')) {
    db.exec('ALTER TABLE operations DROP COLUMN category_user');
  }
}

export function openDb(dbFile: string): Db {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new Database(dbFile);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  migrateDropLegacyOperationCategoryColumns(db);
  db.exec(OPERATIONS_EFFECTIVE_VIEW);
  return db;
}
