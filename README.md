# Cashflows — дашборд личных финансов

Cashflows принимает CSV-выгрузки операций из ЛК Т-Банка, складывает их в локальную SQLite-базу
и показывает дашборд личных финансов: неделя/неделя, план/факт, разбивка по категориям и дням,
бюджеты с контролем перерасхода. Один процесс, один файл данных, ноль внешних сервисов.

## Требования

- **Node.js 22 LTS** (проверялось на 22.x; `engines` в `package.json`: `>=22`).
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
раздает и UI, и API. Открывать: **http://localhost:3000**.

Проверка живости: `GET http://localhost:3000/api/health` → `{"ok":true,"version":"0.1.0"}`.

## Тесты

```bash
npm run test        # разовый прогон (vitest run): 224 теста в 10 файлах
npm run test:watch  # watch-режим
```

Стек: **vitest + Testing Library** (jsdom, конфиг — [vitest.config.ts](vitest.config.ts)). Покрываются:
форматирование денег/дат ([web/src/format.ts](web/src/format.ts)), расчёт периодов/недель
([web/src/periods.ts](web/src/periods.ts)), разбор API-ошибок ([web/src/api.ts](web/src/api.ts)),
хуки данных (`useApiQuery`, `useImport`) и UI-компоненты (KPI-карточки, переключатель недель, диалог
подтверждения, прогресс-бары, статистика импорта). Тесты работают **без сети**: `fetch` и модуль
`api.ts` мокаются (`vi.stubGlobal` / `vi.mock`), сервер :3000 не запускается; глобали vitest не
включены — явные импорты из `'vitest'`.

## Как импортировать выгрузку

Два способа:

1. **Через UI**: вкладка «Настройки» → блок «Импорт CSV» → выбрать файл выгрузки
   (формат — см. [samples/CSV_FORMAT.md](samples/CSV_FORMAT.md)). Результат покажется сразу.
2. **Через CLI**:

   ```bash
   npm run import:samples
   ```

   Импортирует все CSV из `samples/` и печатает результат по каждому файлу.

**Дедупликация.** Повторный импорт того же файла безопасен: каждая строка хешируется (sha256 всех
полей), дубликаты пропускаются. В ответе всегда видно три числа — `parsed` (разобрано строк),
`inserted` (вставлено новых), `duplicatesSkipped` (пропущено дубликатов). Повторная загрузка
того же файла даёт `inserted: 0, duplicatesSkipped: 117` — данные не задваиваются. Две одинаковые
строки *внутри одного файла* (например, две поездки метро за минуту) вставляются обе.

## Бюджет из Excel

Бюджетная таблица `budget_example.xlsx` переносится в приложение в два шага (JSON-файлы уже лежат
в [samples/budget_export/](samples/budget_export/), см. [README-export.md](samples/budget_export/README-export.md)):

1. `npm run export:budget` — выгрузка xlsx в машиночитаемые JSON (`mappings.json`, `plans.json`,
   `categories.json`); в БД ничего не пишет. Для разовой инспекции книги есть `npm run inspect:xlsx`.
2. `npm run import:budget` — идемпотентная загрузка в БД: 50 правил категоризации, 24 категориальных
   бюджета на 2026-09 и 2 плана (доход/расход месяца); повторный запуск даёт 0 вставок/0 изменений.
   Бюджеты привязаны к маппинговым категориям (словарь `budgetToMappingCategory`), чтобы факт
   операций считался в spent.

Резервы, цели накоплений и займы из xlsx пока **не грузятся** — ждут расширения контракта
(см. `plans.json → conflicts`).

## Дашборд

Главный экран (вкладка «Дашборд») состоит из блоков:

- **Переключатель недель** (← →) — переход между неделями Пн–Вс по Москве, кнопка «текущая неделя»;
- **KPI-карточки**: Доходы, Расходы, Баланс периода — с дельтой к прошлой неделе (▲/▼ и %);
- **График по дням** — столбцы доход/расход за каждый день периода (Пн–Вс);
- **Донат по категориям** — доли расходов по категориям с легендой и суммами;
- **План/факт** — плановая сумма на период против факта, процент выполнения;
  если план не задан — «план не задан»;
- **Бюджеты** — прогресс-бары с остатком лимита; при перерасходе прогресс подсвечивается;
- **Операции** — таблица операций периода (полная таблица с фильтрами — на вкладке «Операции»);
- **Настройки** — импорт CSV, создание/редактирование бюджетов и планов.

## API (кратко)

База: `/api/*`, ответы JSON, деньги — целые **копейки** (поля `*Kopecks`), даты — `YYYY-MM-DD`
по Москве. Полные типы — [shared/types.ts](shared/types.ts).

| Метод и путь | Назначение | Ключевые параметры |
|---|---|---|
| `GET /api/health` | живость сервиса | — |
| `POST /api/import` | импорт CSV (multipart, поле `file`) | файл выгрузки |
| `GET /api/dashboard` | агрегаты дашборда | `from`, `to` (`YYYY-MM-DD`, оба или ни одного; по умолчанию текущая неделя) |
| `GET /api/operations` | список операций с фильтрами | `from`, `to`, `category`, `type`, `q`, `analyticsOnly`, `page`, `limit` |
| `GET /api/budgets` | список бюджетов | — |
| `POST /api/budgets` | создать бюджет | тело: `name`, `categories[]`, `periodType`, `limitKopecks` |
| `PUT /api/budgets/:id` | изменить бюджет | тело как у POST |
| `DELETE /api/budgets/:id` | удалить бюджет | — |
| `GET /api/plans` | список планов | `period_type`, `period_key`, `kind` |
| `POST /api/plans` | создать план | тело: `kind`, `periodType`, `periodKey`, `amountKopecks` |
| `PUT /api/plans/:id` | изменить план | тело как у POST |
| `DELETE /api/plans/:id` | удалить план | — |
| `GET /api/categories` | список категорий (для фильтров) | — |
| `GET/POST/DELETE /api/categories/mappings` | правила переименования категорий | `matchType`, `matchValue`, `targetCategory` |

Пример:

```bash
curl "http://localhost:3000/api/dashboard?from=2026-09-01&to=2026-09-08"
```

## Структура проекта

```
cashflows/
├── package.json              # скрипты и все зависимости (без workspaces)
├── tsconfig.base.json        # общие strict-опции TS
├── vite.config.ts            # Vite: root web/, прокси /api → :3000, чанки
├── docs/
│   └── ARCHITECTURE.md       # архитектура: решения, схема данных, API-контракт
├── samples/
│   ├── CSV_FORMAT.md         # описание формата выгрузки Т-Банка
│   └── sample-operations.csv # образец выгрузки (117 операций)
├── shared/
│   └── types.ts              # единый источник типов API (DTO) для сервера и веба
├── server/
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts          # bootstrap: конфиг → БД → Fastify → listen :3000
│       ├── app.ts            # фабрика Fastify: плагины и роуты
│       ├── config.ts         # PORT, DATA_DIR, DB_FILE, WEB_DIST
│       ├── db.ts             # открытие SQLite, WAL, схема (4 таблицы)
│       ├── csv/              # parser + normalize (даты, копейки, hash)
│       ├── domain/           # импорт, дашборд, бюджеты, планы, периоды, деньги
│       ├── routes/           # health, import, dashboard, operations, budgets, plans, categories
│       └── scripts/          # CLI-импорт (npm run import:samples)
├── web/
│   └── src/                  # React SPA: pages/ (Dashboard, Operations, Settings), components/
└── data/
    └── cashflows.sqlite      # база данных (создаётся автоматически)
```

## Где данные и как сбросить

Все данные живут в одном файле: **`data/cashflows.sqlite`** (SQLite, WAL-режим; рядом появляются
`-wal`/`-shm` — это нормально). Сброс к чистому состоянию:

```bash
# остановить приложение, затем:
rm data/cashflows.sqlite*
```

При следующем запуске база создастся заново пустой; после импорта образца в ней будет
117 операций (99 из них участвуют в аналитике).

## Подробнее

- Архитектура, схема БД, алгоритм дедупликации, контракт API: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Формат CSV-выгрузки Т-Банка: [samples/CSV_FORMAT.md](samples/CSV_FORMAT.md)
