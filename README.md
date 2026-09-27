# Cashflows — дашборд личных финансов

Cashflows принимает CSV-выгрузки операций из ЛК Т-Банка, складывает их в локальную SQLite-базу
и показывает дашборд личных финансов: неделя/неделя, обзор календарного месяца по категориям
(план/факт/остаток), мерчанты, финансовые цели. Один процесс, один файл данных, ноль внешних
сервисов, без аутентификации (локальный однопользовательский инструмент).

Полная архитектура, схема БД, API-контракт и инварианты — в [`AGENTS.md`](AGENTS.md) (единственный
источник истины по проекту, поддерживается в актуальном состоянии). Этот файл — только быстрый старт.

## Требования

- **Node.js 22 LTS**.
- npm (идёт в комплекте с Node).

## Быстрый старт

```bash
npm install
```

### Вариант 1 — разработка (два процесса)

```bash
npm run dev
```

Поднимаются одновременно: API-сервер Fastify на **:3000** и Vite dev-сервер на **:5173**
(проксирует `/api` → :3000, CORS не нужен). Открывать в браузере: **http://localhost:5173**.

### Вариант 2 — прод (один процесс)

```bash
npm run build && npm start
```

`tsc` собирает сервер, `vite build` — SPA; затем единый Fastify-процесс на **http://localhost:3000**
раздаёт и UI, и API. Открывать: **http://localhost:3000**.

Проверка живости: `GET http://localhost:3000/api/health` → `{"ok":true,"version":"0.1.0"}`.

## Тесты

```bash
npm run test        # разовый прогон (vitest run): 320 тестов в 22 файлах
npm run test:watch  # watch-режим
```

Стек: **vitest + Testing Library**, два `test.projects` (конфиг — [vitest.config.ts](vitest.config.ts)):
- **web** (jsdom) — форматирование денег/дат ([web/src/format.ts](web/src/format.ts)), расчёт
  периодов/недель ([web/src/periods.ts](web/src/periods.ts)), разбор API-ошибок
  ([web/src/api.ts](web/src/api.ts)), хуки данных, UI-компоненты и секции «Настроек»;
- **server** (node, in-memory SQLite) — приоритет резолвинга эффективной категории
  (override → правило по сообщению → мерчант → MCC → «Без категории») и CRUD категорий/сфер/
  маппингов, включая прогон через реальный `samples/sample-operations.csv`.

Тесты работают **без сети**: `fetch`/`api.ts` мокаются в web-тестах, backend-тесты гоняют
in-memory SQLite — сервер :3000 нигде не запускается.

## Как импортировать выгрузку

Два способа:

1. **Через UI**: вкладка «Настройки» → блок «Импорт CSV» → выбрать файл выгрузки
   (формат — см. [samples/CSV_FORMAT.md](samples/CSV_FORMAT.md)). Результат покажется сразу.
2. **Через CLI**:

   ```bash
   npm run import:samples
   ```

   Импортирует `samples/*.csv` и печатает результат — тот же `domain/import.ts`, что и HTTP-роут.

**Дедупликация.** Повторный импорт того же файла безопасен: каждая строка хешируется (sha256 всех
17 полей), дубликаты пропускаются с учётом кратности. В ответе всегда видно три числа —
`parsed` (разобрано строк), `inserted` (вставлено новых), `duplicatesSkipped` (пропущено дубликатов).
Повторная загрузка `samples/sample-operations.csv` даёт `inserted: 0, duplicatesSkipped: 117`. Две
одинаковые строки *внутри одного файла* (например, две поездки метро за минуту) вставляются обе.

## Категоризация

Категория — не колонка, а живой SQL VIEW (`operations_effective`, приоритет: разовый override →
подстрока в «Сообщении» → мерчант целиком → MCC-код → «Без категории»). Новое правило действует
сразу для всех операций, прошлых и будущих — пересчитывать вручную никогда не нужно. Правила
редактируются на вкладке «Настройки»: мерчанты, специальные правила категоризации (по сообщению/
MCC), теги постоянная/переменная/резерв, «сферы» (группировка категорий в обзоре месяца), план
на месяц. `npm run auto-map` — эвристика для авторазметки известных сетей/сервисов по словарю
(предпросмотр по умолчанию, `--apply` пишет).

## API (кратко)

База: `/api/*`, ответы JSON, деньги — целые **копейки** (поля `*Kopecks`), даты — `YYYY-MM-DD`
по Москве. Полный контракт со всеми эндпоинтами, телами и инвариантами — в [AGENTS.md](AGENTS.md);
типы — [shared/types.ts](shared/types.ts).

```bash
curl "http://localhost:3000/api/dashboard?from=2026-09-01&to=2026-09-08"
curl -F "file=@samples/sample-operations.csv" http://localhost:3000/api/import
```

## Структура проекта

```
cashflows/
├── package.json          # скрипты и все зависимости (без workspaces)
├── tsconfig.base.json    # общие strict-опции TS
├── vitest.config.ts      # test.projects: web (jsdom) + server (node)
├── AGENTS.md             # архитектура, схема БД, API-контракт, инварианты — источник истины
├── samples/
│   ├── CSV_FORMAT.md         # описание формата выгрузки Т-Банка
│   └── sample-operations.csv # образец выгрузки (117 операций)
├── shared/
│   └── types.ts          # единый источник типов API (DTO) для сервера и веба
├── server/
│   └── src/
│       ├── index.ts, app.ts, config.ts, db.ts
│       ├── csv/           # parser + normalize
│       ├── domain/        # бизнес-логика: import, operations, dashboard/monthOverview,
│       │                  # categories/categoryAreas/categoryMappings, merchants, goals,
│       │                  # periods/periodResolution, money, settings
│       ├── routes/        # тонкие HTTP-хендлеры поверх domain/
│       └── scripts/       # CLI (import-samples, auto-map-merchants)
├── web/
│   └── src/               # React SPA: pages/ (Dashboard, Operations, Settings, Debug),
│                          # sections/ (секции «Настроек»), components/, hooks/
└── data/
    └── cashflows.sqlite   # база данных (создаётся автоматически; в .gitignore)
```

## Где данные и как сбросить

Все данные живут в одном файле: **`data/cashflows.sqlite`** (SQLite, WAL-режим; рядом появляются
`-wal`/`-shm` — это нормально).

**Не удалять `data/cashflows.sqlite*` для «сброса», если там реальные данные** — это стирает
операции/мерчантов/правила/категории/цели безвозвратно, а не только тестовые. Для проверки фичи
создавайте/удаляйте записи через API (curl) или UI, не пересоздавайте базу целиком. Пустая тестовая
БД создаётся сама при первом запуске, если файла ещё не было.
