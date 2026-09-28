# AGENTS.md — инструкция для ИИ-агентов

Cashflows — локальный инструмент личных финансов: импорт CSV-выгрузок Т-Банка в SQLite и дашборд
(неделя/неделя, обзор месяца по категориям, мерчанты, цели). Стек: Node 22 + TypeScript strict,
Fastify 5 + better-sqlite3 (без ORM), React 18 + Vite + Recharts (донат категорий), один корневой
`package.json` без workspaces. Деньги — целые копейки (INT), время хранится дважды (UTC ISO +
московская дата). Однопользовательский, без аутентификации, без миграционных фреймворков.

Категории — **нормализованная** модель без «запекания»: `operations` ссылается на `merchants` и
опционально на разовый override; эффективная категория — **живой SQL VIEW** (`operations_effective`
в `db.ts`), пересчитывать её вручную никогда не нужно — правило начинает действовать сразу, как
только строка появилась в `merchants`/`mcc_mappings`/`custom_mappings`. Бюджетов, планов дохода/
расхода и резервов в схеме больше нет (убраны рефакторингом до этой сессии) — единственный
плановый концепт сегодня: необязательный `user_categories.month_limit_kopecks` («план на месяц»),
показанный в матрице «Обзор месяца». Этот файл — единственный источник истины по архитектуре
(отдельный `docs/ARCHITECTURE.md` описывал СТАРУЮ, снесённую рефакторингом модель и был удалён
как вводящий в заблуждение — не пытайтесь его найти, ориентируйтесь на этот файл и на код).

## Карта проекта

```
server/src/        Fastify-бекенд
  app.ts           фабрика Fastify: error-хендлеры ДО роутов, multipart, статика web/dist, роуты
  db.ts            открытие SQLite, WAL, схема (CREATE TABLE IF NOT EXISTS — весь «механизм
                   миграций»; migrateDropLegacyOperationCategoryColumns() — первый и пока
                   единственный пример идемпотентной ALTER-миграции существующей таблицы
                   (PRAGMA table_info на входе + DROP COLUMN, вызывается из openDb() между
                   SCHEMA и VIEW) — по этому же образцу писать следующие, если понадобится
                   менять уже существующую таблицу) + VIEW
                   operations_effective (эффективная категория, живой JOIN, см. инвариант 5)
  csv/             parser.ts (csv-parse RFC 4180, 17 колонок по именам) + normalize.ts (даты,
                   копейки, hash; категорию больше НЕ вычисляет — только hash+сырые поля)
  domain/          import.ts (нормализация + дедуп с учётом кратности + find-or-create
                   merchants + разовый override, одна транзакция), operations.ts
                   (listOperations/setOperationCategoryOverride — единственная сущность, где
                   эта логика раньше жила прямо в routes/, вынесена для единообразия с
                   остальными), dashboard.ts (buildDashboard: totals/change/byCategory/
                   expenseByKind/goals ЗА ВСЁ ВРЕМЯ; экспортирует periodTotals, переиспользуемый
                   monthOverview.ts), monthOverview.ts (buildMonthOverview — календарный месяц,
                   содержащий period.from, с разбивкой на недели), queryFilters.ts (AGG_FILTER —
                   общий фильтр аналитики, шарится dashboard.ts/monthOverview.ts/merchants.ts,
                   чтобы merchants.ts не зависел от dashboard.ts), categories.ts
                   (listUserCategories + CRUD + kind-тег + месячный лимит + resolveUserCategoryId
                   — общий lookup id категории по имени, шарится merchants.ts/operations.ts),
                   categoryAreas.ts (CRUD сфер category_abstract), categoryMappings.ts (CRUD
                   mcc_mappings/custom_mappings), goals.ts (CRUD, без прогресса), merchants.ts
                   (listMerchants/setMerchantCategory — ЗА ВСЁ ВРЕМЯ, правило description на весь
                   мерчант через FK merchants.user_category_id), periods.ts (чистая дата-
                   арифметика: weekStart/isoWeekKey/monthBounds/weeksOfMonth) + periodResolution.ts
                   (семантика периода дашборда поверх неё: detectPeriodType/resolveDashboardRange/
                   nextSalaryDate — учитывает несколько дней зарплаты в месяце), money.ts
                   (parseAmountToKopecks); testDb.ts + *.test.ts — единственные backend-тесты
                   в проекте (vitest, in-memory SQLite), проверяют приоритет резолвинга
                   эффективной категории (инвариант 5) и CRUD mcc/custom-mappings, см. «Команды»
  routes/          health, import, dashboard (?from&to), operations (тонкий, вызывает
                   domain/operations.ts; + PUT /:id/category — разовый override без правила;
                   ?categories= через запятую), goals, merchants, categories (core CRUD + kinds +
                   limits), categoryMappings.ts (mcc-mappings, custom-mappings, mcc-options),
                   categoryAreas.ts (fields, areas — см. API), settings, debug (дамп всех таблиц
                   БД по 10 строк — вкладка Debug на фронте), schemas.ts — zod, секции по
                   сущностям
  scripts/         CLI, запускаются `npx tsx server/src/scripts/<file>.ts` (или через npm run,
                   где есть): import-samples.ts (npm run import:samples), auto-map-merchants.ts
                   (npm run auto-map — эвристика по словарю известных сетей, ничего не пишет без
                   --apply; переиспользует domain/merchants.ts::setMerchantCategory +
                   domain/categories.ts::listUserCategories, не дублирует SQL), inspect-xlsx.ts
                   (npm run inspect:xlsx — разведка произвольного xlsx, исторический артефакт,
                   сейчас ничем не используется), dump-rows.ts (без npm-скрипта — дамп диапазона
                   строк листа xlsx). Скриптов импорта/экспорта бюджета и пересчёта категорий
                   («recategorize») БОЛЬШЕ НЕТ — вместе с budgets/plans удалены; пересчитывать
                   категории не нужно НИКОГДА (см. инвариант 5)
web/               React SPA (Vite, root web/), 4 таба (App.tsx): Дашборд/Операции/Настройки/
  Debug + переключатель светлой/тёмной темы (useTheme, localStorage)
  pages/           Dashboard (WeekSwitcher + KPI + MonthOverview + CategoryBreakdown/
                   ExpenseKindSummary + GoalList + импорт), Operations (фильтры + таблица +
                   пагинация + CreateRuleDialog), Settings (контейнер секций, см. sections/),
                   Debug (сырой дамп таблиц БД, GET /api/debug/tables)
  sections/        GeneralSettingsSection (дни зарплаты — единственная общая настройка),
                   GoalsSection (CRUD, имя+сумма, без категорий/прогресса; удаление —
                   useConfirmDelete), MappingsSection (контейнер: mcc_mappings +
                   custom_mappings, рендерит по одному экземпляру mappings/MappingRuleForm +
                   mappings/MappingRuleList на каждое правило — общая форма/список,
                   различаются только первым полем формы, см. components/), MerchantsSection
                   (все мерчанты по убыванию трат за всё время + текущая категория,
                   CategorySelect с fallbackOption «(банк)» для ещё неразмеченных),
                   CategoryKindsSection (контейнер «Настройки категорий»: считает группировку
                   по сфере + рендерит category-kinds/InlineNameForm дважды («Новая категория»/
                   «Новая сфера» — идентичная форма), category-kinds/AreaGroupHeader на каждую
                   группу (заголовок сферы, плоский — только название; кнопка «Изменить»
                   открывает category-kinds/EditAreaDialog, попап с единственным полем «Название»,
                   PUT /api/categories/areas/:area, кроме псевдо-группы «Без сферы» —
                   переименовывать нечего) и один category-kinds/CategoryRow на категорию —
                   плоская строка (название + сводка тег/сфера/план текстом в одну строку,
                   без интерактивных контролов); кнопка «Изменить» открывает
                   category-kinds/EditCategoryDialog, попап-форма сразу с четырьмя полями —
                   «Название» (переименование, PUT /api/categories/:category), «Сфера»
                   (SearchableSelect из category_abstract, заводится отдельно полем «Новая
                   сфера» — GET/POST /api/categories/areas, без привязки к конкретной
                   категории), «Тег» (SearchableSelect fixed/variable/reserve, не кнопки) и
                   «План на месяц» (month_limit_kopecks); одно «Сохранить» шлёт rename (только
                   если имя изменилось) и PUT сферы/тега/плана (всегда, идемпотентно) —
                   контейнер не различает, какое поле реально поменялось. «Удалить» — отдельная
                   иконка (TrashIcon) в строке списка, вне попапа, с ConfirmDialog
                   (useConfirmDelete) — DELETE /api/categories/:category, кроме служебной «Без
                   категории» (её нельзя ни удалить, ни переименовать, ни переименовать ДРУГУЮ
                   категорию в неё — domain/categories.ts → renameUserCategory/
                   deleteUserCategory); список сгруппирован по сфере заголовками (алфавит
                   сферы, категории без сферы — блоком «Без сферы» в конце), как строки
                   MonthOverview)
  components/      MonthOverview (матрица категория×неделя: Категория | План | Неделя 1..N |
                   Потрачено | % от плана, группировка по category_abstract со строкой «Итого»;
                   любая сумма кликабельна, включая «0 ₽» и «Итого» — недельная открывает
                   операции своей недели, «Потрачено» — операции за весь месяц), WeekOperationsDialog
                   (попап по клику — список операций за категорию(и)+период, GET /api/operations
                   ?categories=&from=&to=, лимит 200 без пагинации внутри попапа, переиспользует
                   OperationsTable + CreateRuleDialog), CreateRuleDialog (правило ИЛИ разовая
                   категория одной операции — чекбокс переключает режим), OperationsTable/
                   OperationsFiltersBar/OperationsPager, CategoryBreakdown (донат, Recharts),
                   ExpenseKindSummary (стек-бар постоянные/переменные/не размечено), SummaryCards
                   (KPI недели), GoalList, ImportPanel/ImportStats, WeekSwitcher,
                   ui/ (CollapsibleSection — аккордеон, шеврон ChevronIcon поворачивается на 90°
                   при раскрытии, ConfirmDialog, ErrorBanner, Spinner, SearchInput (иконка-лупа
                   слева, обёртка над <input type="search">), SearchableSelect — комбобокс с
                   текстовым поиском по вариантам, замена ВСЕХ нативных <select> в приложении,
                   рисует шеврон ▾ сам (единый признак «это дропдаун»); список рисуется
                   position:fixed по координатам инпута, закрывается при скролле СТРАНИЦЫ, но
                   игнорирует скролл внутри себя же — иначе длинный список закрывался бы при
                   попытке прокрутить его колесом мыши; PencilIcon/TrashIcon/ChevronIcon/
                   SearchIcon — инлайн-SVG без иконочной библиотеки, см. «Конвенции кода» →
                   UI-паттерны), CategorySelect
                   (обёртка над SearchableSelect для выбора категории — единственное место, где
                   строится список вариантов «категория со сферой»: categoryOptionLabel(c,
                   sphere) + опциональный placeholder-пункт + fallbackOption для значения вне
                   списка категорий, например «(банк)» у ещё неразмеченного мерчанта; используется
                   в MerchantsSection/MappingsSection/OperationsFiltersBar/CreateRuleDialog вместо
                   ручного categories.map(...)). Подпись варианта дополняется сферой через
                   format.ts → categoryOptionLabel, например «Психолог (Сима)»: user_categories.name
                   уникально, но похожие/составные названия (несколько «Психолог …» на разных
                   членов семьи) неразличимы на слух без сферы. Источник — useCategoryFields
                   (не useCategories) везде, где нужна и категория, и её сфера одним запросом.
  hooks/           useApiQuery (общий GET-хук, AbortController) + один хук на сущность
                   (useCategories/useCategoryKinds/useCategoryFields/useCategoryAreas/
                   useCategoryLimits/useCustomMappings/useMcMappings/useMerchants/useGoals/
                   useSettings/useDashboard/useOperations/useDebugTables/useImport/useTheme) +
                   два общих UI-хука поверх них: useConfirmDelete (pending id + busy +
                   confirm/cancel — общий паттерн «запрос → подтверждение в ConfirmDialog →
                   удаление», раньше копипастился в CategoryKindsSection/MappingsSection×2/
                   GoalsSection) и useCreateRule (состояние + обработчики CreateRuleDialog,
                   общее для Operations.tsx и WeekOperationsDialog)
  src/api.ts       типизированный fetch-клиент (ApiError); src/format.ts — форматирование денег/
                   дат/процентов (переиспользовать!); src/constants.ts — API_PREFIX/лимиты/пороги;
                   src/periods.ts — недельная арифметика на фронте; тесты — *.test.ts(x) рядом
shared/types.ts    ЕДИНСТВЕННЫЙ источник API-типов (DTO); импорт обоими проектами по относительному
                   пути. Дыра контракта: `OperationsQuery` не объявляет `categories` (список через
                   запятую), хотя роут и `web/src/api.ts` его реально поддерживают — ориентируйтесь
                   на код routes/operations.ts и api.ts, не только на этот интерфейс
samples/           sample-operations.csv + CSV_FORMAT.md (контракт формата). budget_export/
                   (JSON-артефакт удалённой фичи импорта бюджета из xlsx) удалён вместе с
                   docs/ARCHITECTURE.md и PLANS.md (оба описывали снесённую рефакторингом
                   архитектуру — budgets/plans/reserves/goals-с-категориями/category_mappings) —
                   не пытаться найти ни их, ни `npm run import:budget`/`export:budget` — их нет
data/              cashflows.sqlite (+ -wal/-shm); в .gitignore
```

Поток импорта CSV (единая реализация для HTTP-роута и CLI): `csv/parser.ts` (RFC 4180, колонки по
именам; нет ни одного из 17 заголовков → файл целиком → 400) → `csv/normalize.ts` (строки с
нечитаемой датой/суммой → `errors[]` и пропуск; категорию НЕ вычисляет) → `domain/import.ts`
(дедуп с учётом кратности + find-or-create мерчанта по `description` + разовый override, если
«Ваша категория» из CSV совпадает с существующим `user_categories.name` — иначе игнорируется, в
БД новые категории «на лету» не создаются) — одна транзакция. Логику импорта не дублировать.

## Команды

```bash
npm run dev              # бек :3000 (tsx watch) + vite :5173; в браузере открывать http://localhost:5173
npm run build && npm start  # прод: единый процесс на :3000 (UI + API), entry server/dist/server/src/index.js
npm run typecheck        # tsc --noEmit для server/tsconfig.json И web/tsconfig.json — запускать после ЛЮБЫХ правок
npm run test             # vitest run — 319 тестов в 22 файлах: test.projects (vitest.config.ts) —
                          # "web" (17 файлов, web/*.test.ts(x), jsdom) и "server" (5 файлов,
                          # server/src/domain/*.test.ts, node, in-memory SQLite — приоритет
                          # резолвинга эффективной категории на синтетических операциях и на
                          # реальном samples/sample-operations.csv + CRUD mcc/custom-mappings +
                          # переименование категорий/сфер,
                          # единственные backend-тесты в проекте); test:watch — watch-режим
npm run import:samples   # импорт samples/*.csv в БД (идемпотентно, тот же domain/import.ts, что HTTP-роут)
npm run inspect:xlsx     # разведка произвольного xlsx (server/src/scripts/inspect-xlsx.ts [путь]) — исторический
                          # артефакт, применений в текущей фиче-модели сейчас нет
npm run auto-map         # предпросмотр авторазметки «очевидных» операций (сети/сервисы); --apply — записать
```

`server/src/scripts/dump-rows.ts` не подключён к `npm run` — запускать явно:
`npx tsx server/src/scripts/dump-rows.ts <файл.xlsx> <лист> <from> <to>`.

Как проверять изменения: `npm run typecheck` (обе конфигурации) + `npm run test` + ручные curl-проверки API, например:

```bash
curl "http://localhost:3000/api/dashboard?from=2026-09-01&to=2026-09-08"
curl -F "file=@samples/sample-operations.csv" http://localhost:3000/api/import   # повторный → duplicatesSkipped=117
```

## API (кратко; база `/api/*`, полные типы — `shared/types.ts`)

| Метод и путь | Назначение |
|---|---|
| `GET /api/health` | живость: `{"ok":true,"version":"0.1.0"}` |
| `POST /api/import` | multipart, поле `file`; построчные ошибки → 200 с `errors[]`, битый файл целиком → 400 |
| `GET /api/dashboard` | `?from&to` (`YYYY-MM-DD`, оба или ни одного; без них — текущая московская неделя) |
| `GET /api/operations` | фильтры `from,to,category,categories,type,q,analyticsOnly,page,limit` (def: analyticsOnly=true, limit=50, max 200); `categories` — список через запятую, `category IN (...)` (не в `OperationsQuery`-типе, см. «дыра контракта» выше) |
| `PUT /api/operations/:id/category` | тело `{categoryUser}` — категория ТОЛЬКО этой операции (разовый override, без правила) |
| `GET/POST/PUT/DELETE /api/goals[/:id]` | CRUD целей; тело `{name, amountKopecks}` — БЕЗ категорий и прогресса |
| `GET /api/merchants` | мерчанты (`operations.description`) ЗА ВСЁ ВРЕМЯ: сумма расходов, кол-во операций, текущая категория, `mixedCategories`, по убыванию суммы |
| `PUT /api/merchants/category` | тело `{merchant, targetCategory}` — прямой FK `merchants.user_category_id` на весь мерчант, живой JOIN, пересчёт не нужен |
| `GET/POST/PUT/DELETE /api/categories[/:category]` | без `?scope` — категории пользователя + служебная «Без категории» (для фильтра операций); `?scope=user` — БЕЗ «Без категории» (выбор целевой категории); PUT тело `{name}` — переименование (ссылки — по id/FK, каскад не нужен; нельзя переименовать «Без категории» и нельзя переименовать ДРУГУЮ категорию в неё); DELETE удаляет категорию (кроме «Без категории» — 400) и одной транзакцией снимает на неё все ссылки (override операций и `merchants.user_category_id` → NULL, mcc/custom-правила на неё → удаляются) — операции, ссылавшиеся ТОЛЬКО на неё, становятся «Без категории» сами через живой VIEW |
| `GET/POST/DELETE /api/categories/mcc-mappings[/:mcc]` | правило `mcc → targetCategory`, один код — одно правило |
| `GET/POST/DELETE /api/categories/custom-mappings[/:id]` | правило по подстроке в `message` («Сообщение» из CSV) — высший приоритет среди авто-правил |
| `GET/PUT /api/categories/kinds[/:category]` | тег `fixed\|variable\|reserve\|null` (`user_categories.type`) |
| `GET/PUT /api/categories/fields[/:category]` | «сфера» (`category_abstract`) поверх категории — группировка строк в MonthOverview |
| `GET/POST/PUT /api/categories/areas[/:area]` | сферы (`category_abstract`) как самостоятельный список: все существующие имена + создание новой БЕЗ привязки к категории (в отличие от `PUT /fields/:category`, которая заводит сферу «попутно», find-or-create по имени); PUT тело `{name}` — переименование сферы (ссылки — по id/FK, каскад не нужен) |
| `GET/PUT /api/categories/limits[/:category]` | план на месяц (`month_limit_kopecks`, положительное целое либо `null`) — колонки «План»/«% от плана» в MonthOverview |
| `GET/PUT /api/settings` | `{salaryDays: number[]}` (дни 1..31); PUT перезаписывает целиком |
| `GET /api/debug/tables` | служебный дамп: каждая таблица БД целиком по имени + первые 10 строк «как есть» (вкладка Debug) |

Эндпоинтов `/api/budgets`, `/api/plans`, `/api/reserves`, `/api/categories/mappings`,
`/api/categories/recalculate` **не существует** — соответствующие сущности удалены рефакторингом.

## Ключевые инварианты (КРИТИЧНО — нарушение ломает данные)

1. **Деньги — ВСЕГДА целые копейки** (`INT` в БД, `Money` в `shared/types.ts`, поля `*Kopecks`).
   Никаких float, `parseFloat`, умножения на 100. ru-RU суммы с запятой-разделителем парсит
   `server/src/domain/money.ts` (`parseAmountToKopecks`: regex + целочисленная арифметика).
   На фронте — только `web/src/format.ts` (`formatMoney`, `formatMoneyWhole` — округлено до целых
   рублей, для плотных таблиц вроде MonthOverview, `parseRublesToKopecks`, `kopecksToRublesInput`).
2. **Время хранится дважды**: `datetime_iso` (UTC-мгновение ISO) + `local_date` (`YYYY-MM-DD`,
   календарный день Europe/Moscow = **фиксированный UTC+3**, DST нет → TZ-библиотеки НЕ нужны:
   `Date.UTC(...) - 3ч`). Неделя = Пн–Вс по Москве (ISO-неделя); `period_key`: `2026-W37` / `2026-09`.
   Все фильтры периодов — по `local_date`, включительно.
3. **Дедупликация**: `hash` = sha256 всех **17 сырых значений** CSV-строки, join `\x1F`
   (`csv/normalize.ts`). Импорт идёт в транзакции с учётом кратности: две одинаковые строки внутри
   одного файла = две операции (две реальные поездки метро), повторный импорт того же файла даёт
   `inserted: 0`, `duplicatesSkipped: 117` (на `samples/sample-operations.csv`). Не «упрощайте»
   алгоритм до `hash UNIQUE` на `operations` — сломается кратность (`raw_transactions.hash`
   уникален, это отдельная таблица-архив на дедуп; `operations.hash` — обычная колонка).
4. **Агрегаты дашборда** (`dashboard.ts`, дефолт `/api/operations` с `analyticsOnly=true`) ВЕЗДЕ
   фильтруют `status = 'Ок' AND include_in_analytics = 1` (внутренние переводы «между своими»
   исключены). Импорт сохраняет ВСЕ строки — фильтр только на чтении. `dashboard.goals` — ЗА ВСЁ
   ВРЕМЯ (у целей вообще нет периода и нет автопрогресса — просто список имя+сумма);
   `dashboard.monthOverview` — календарный месяц, СОДЕРЖАЩИЙ `period.from` (не окно целиком),
   с разбивкой на недели Пн–Вс, обрезанные границами месяца (`periods.ts → weeksOfMonth`); не
   зависит от того, какая неделя выбрана `WeekSwitcher`'ом. Займов/резервов в модели больше нет.
5. **Эффективная категория — ВСЕГДА живой SQL VIEW** (`operations_effective`, `db.ts`), НЕ
   колонка и никогда не «запекается» — пересчитывать её вручную не нужно ни в каком случае,
   новое правило действует немедленно для всех операций (прошлых и будущих). Приоритет:
   разовый override операции (`user_category_override_id`, из `PUT /api/operations/:id/category`
   или «Ваша категория» из CSV при импорте) → `custom_mappings` по подстроке в `message`
   (`instr()`, порядок id) → `merchants.user_category_id` (правило на весь мерчант,
   `PUT /api/merchants/category`) → `mcc_mappings` по `operations.mcc` (только однозначные коды —
   один код должен вести ровно в одну категорию, иначе не добавлять) → служебная категория
   «Без категории». «Категория пользователя» = любая строка `user_categories`, кроме «Без
   категории» (`listUserCategories()` в `domain/categories.ts`) — банковская «Категория
   по-умолчанию» (`category_default`) вспомогательная и местами неверная, НЕ показывать как
   вариант выбора целевой категории нигде в UI (в `MerchantsSection` она видна как заблокированный
   `disabled`-пункт «(банк)», только для уже отображаемого текущего значения).
6. **Контракт API**: типы ТОЛЬКО в `shared/types.ts` (с одним известным пробелом — см. карту
   проекта); валидация входа zod (`routes/schemas.ts`); ошибки формата `{ "error": string,
   "details"?: [...] }`; `setErrorHandler`/`setNotFoundHandler` регистрируются в `app.ts` **ДО**
   `register` роутов (иначе роуты наследуют дефолтный формат Fastify).
7. **UI-прокси**: в dev `/api` идёт через Vite-прокси на :3000 (`vite.config.ts`); CORS-плагина
   нет — **не добавлять**. Прод — тот же origin. Фронт зовёт API только относительными путями
   через `web/src/api.ts`.

## Схема БД (SQLite, WAL; `CREATE TABLE IF NOT EXISTS` в `db.ts`, фреймворков миграций нет)

- **raw_transactions** — архив сырых CSV-строк на дедуп: `hash` (PK, sha256 всех 17 полей),
  `raw_row` (JSON-массив 17 исходных значений, `NULL` для исторических операций), `source_file`,
  `imported_at`. `INSERT OR IGNORE` — хеш глобально уникален как факт «эта комбинация полей
  когда-то встречалась», хотя `operations` может ссылаться на него многократно (кратность).
- **operations** — нормализованные операции: `hash` (обычная колонка, НЕ уникальная — см.
  инвариант 3), `datetime_iso`, `local_date`, `amount_kopecks` (СО ЗНАКОМ: <0 расход),
  `type` (income|expense), `account`, `card`, `currency`, `status`, `category_default`
  (справочно, в резолвинге не участвует), `mcc`, `description` (= `merchants.name`), `message`
  («Сообщение» из CSV, матчится `custom_mappings`), `bonuses_kopecks`, `include_in_analytics`
  (0|1), `merchant_id` (FK `merchants`), `user_category_override_id` (FK `user_categories`,
  разовая категория ЭТОЙ операции), `source_file`, `imported_at`. Категории `category`/
  `category_user` КАК КОЛОНОК НЕТ — см. `operations_effective`.
- **operations_effective** (VIEW, не таблица) — `SELECT o.*, ... AS effective_user_category_id`
  с приоритетом override → custom_mappings → merchants → mcc_mappings → «Без категории»
  (см. инвариант 5); пересоздаётся (`DROP VIEW IF EXISTS` → `CREATE VIEW`) при каждом `openDb()`.
- **category_abstract** — «сферы» категорий (например «Еда и повседневное», «Сима»): `id`, `name`
  (UNIQUE), `created_at`. Абстракция ПОВЕРХ `user_categories`, только для группировки строк в
  MonthOverview — не участвует ни в дедупе, ни в резолвинге категории.
- **user_categories** — курируемый список категорий: `id`, `name` (UNIQUE), `category_abstract_id`
  (FK, опционально), `type` (fixed|variable|reserve, опционально — тег для `ExpenseKindSummary`),
  `month_limit_kopecks` (опционально, > 0 — план на месяц, единственный сейчас работающий план),
  `year_limit_kopecks` (опционально, > 0 — **колонка есть, но НЕТ ни API, ни UI**, не путать
  пользователя обещанием годового плана), `created_at`. Служебная строка `'Без категории'` —
  фолбэк по умолчанию, всегда существует (создаётся отдельно, не через обычный CRUD-путь).
- **merchants** — мерчанты: `id`, `name` (UNIQUE, = `operations.description`), `user_category_id`
  (FK, опционально), `created_at`. Категория мерчанта — самый частый источник эффективной
  категории; find-or-create при каждом импорте новой строки по `description`.
- **mcc_mappings** — фолбэк по банковскому MCC: `mcc` (PK, 4 цифры), `user_category_id` (FK,
  NOT NULL), `created_at`. Только однозначные коды (см. инвариант 5) — не добавлять код, который
  банк использует как «мусорную» общую метку на несколько разных реальных категорий.
- **custom_mappings** — правила по подстроке в `message`: `id`, `match_value`, `user_category_id`
  (FK, NOT NULL), `created_at`. Высший приоритет среди автоматических правил (порядок id).
- **goals** — минимальный вид: `id`, `name`, `amount_kopecks` (> 0), `created_at`. Никаких
  `categories`/прогресса — просто именованная сумма-цель, не привязанная к операциям.
- **settings** — key-value (`key` PK, `value`, `updated_at`). Единственный ключ — `salary_days`
  (JSON-массив дней 1..31, например `[7,22]`; используется в `monthOverview` для «дней до ЗП»).

Индексы: `operations(hash, local_date)`. Никакого индекса по категории — её больше нет как
колонки (VIEW не индексируется напрямую, но объём данных для личных финансов достаточно мал).

Менять схему = править `db.ts`. Для НОВЫХ таблиц/VIEW `CREATE TABLE IF NOT EXISTS`/`DROP VIEW IF
EXISTS` + `CREATE VIEW` при каждом старте достаточно. Для изменений в СУЩЕСТВУЮЩИХ таблицах
(новая колонка, другой CHECK, удаление колонки) сам по себе `ALTER` не запустится на уже
созданных базах — нужна явная идемпотентная миграция внутри `openDb()` (проверка через
`PRAGMA table_info`/`sqlite_master.sql`, чтобы не выполнять её повторно); пример —
`migrateDropLegacyOperationCategoryColumns()` в `db.ts`, вызывается из `openDb()` между
`SCHEMA` и созданием VIEW: убирает `operations.category`/`category_user` — колонки, оставшиеся
на уже существующих базах от схемы ДО рефакторинга категорий (`CREATE TABLE IF NOT EXISTS` их
не трогал), из-за чего `category NOT NULL` без `DEFAULT` ломал `INSERT` любой РЕАЛЬНО новой
(не дублирующейся) операции — `domain/import.ts` эту колонку не заполняет. Проверено на копии
реальной БД (повторный импорт образца всегда шёл по ветке «дубликат» и до `INSERT` не доходил,
поэтому баг был не виден); задача пофикшена автоматически на живой БД при сохранении файла —
дев-сервер пользователя перезапускается на `tsx watch`.

## Конвенции кода

- TypeScript strict + `noUncheckedIndexedAccess` (`tsconfig.base.json`): доступ по индексу возвращает
  `T | undefined` — проверять, не использовать `!`.
- Без ORM: чистый SQL + prepared statements (`db.prepare<Params, Row>()`), транзакции `db.transaction`.
- React: только хуки, без роутера/стейт-менеджеров/React-Query; данные — функции из `web/src/api.ts`,
  один `use*`-хук на сущность поверх общего `useApiQuery` (AbortController, `version` в deps — счётчик
  изменений из `App.tsx`, растёт после импорта/любого CRUD, вызывает перезагрузку данных).
- CSS: один файл `web/src/styles.css` с переменными (`:root` + `:root[data-theme='dark']` для тёмной
  темы). Никаких CSS-in-JS.
- UI-паттерны (без иконочной библиотеки — каждая иконка инлайн-SVG в `components/ui/*Icon.tsx`,
  ~15×15, `stroke="currentColor"`, без внешних зависимостей, по образцу уже существующих —
  не тащить lucide/heroicons/etc.):
  - Действие «изменить/переименовать» в списке (категория, сфера) — иконка-кнопка
    (`PencilIcon`, класс `btn btn-icon`), не текст «Изменить»: список записей плотный,
    иконка не удлиняет строку и сразу узнаваема; обязателен `aria-label`/`title` с полным
    текстом действия (кнопка без видимого текста), например `Переименовать категорию ${name}`.
  - Действие «удалить» в списке — аналогично иконка (`TrashIcon`, `btn btn-icon btn-danger`),
    не текст «Удалить» (кроме кнопки ПОДТВЕРЖДЕНИЯ внутри самого `ConfirmDialog` — там кнопка
    одна и без подписи неоднозначна, текст сохраняется).
  - Любой дропдаун (`SearchableSelect`) — шеврон ▾ обязателен (сам компонент рисует его для
    всех использований разом): иначе комбобокс неотличим от обычного текстового поля, особенно
    при коротких значениях (тег категории, «Все категории» и т.п.).
  - Поле поиска — обёртка `components/ui/SearchInput` (иконка-лупа слева) вместо голого
    `<input type="search">`; используется, где семантика поля — именно поиск/фильтр по
    подстроке (не любой текстовый инпут).
  - Аккордеон (`CollapsibleSection`) — шеврон (`ChevronIcon`), поворачивается на 90° при
    раскрытии; уже реализовано, не переизобретать для новых сворачиваемых блоков — оборачивать
    в тот же компонент.
  - Редактирование записи списка (категория, сфера — `CategoryRow`/`AreaGroupHeader`) — паттерн:
    строка списка плоская (только название + для категории сводка тег/сфера/план текстом), без
    интерактивных контролов в самой строке; иконка «карандаш» открывает попап (`EditCategoryDialog`/
    `EditAreaDialog`, `.modal`/`.modal-overlay`, как `ConfirmDialog`/`CreateRuleDialog`) с формой всех
    редактируемых полей сразу, Escape/клик по подложке отменяет, «Сохранить» отправляет все PUT'ы
    одной пачкой (rename — только если имя изменилось, остальные поля — всегда, идемпотентно);
    состояние формы (драфты полей, локальная валидация) — локальный `useState` диалога, какая
    запись сейчас редактируется и сама мутация/busy/error — у контейнера секции (тот же принцип,
    что и `useConfirmDelete`/`useCreateRule` — UI-состояние живёт как можно ближе к разметке,
    состояние данных/сети — в контейнере). Поле внутри `SearchableSelect`, вложенное в `.field`
    через промежуточный `.searchable-select`-div, не растягивается на 100% автоматически (в отличие
    от обычного `<input>` — прямого flex-ребёнка `.field`, которого тянет `align-items: stretch`) —
    для него ширина 100% задана явно (`.searchable-select input.input-control`), иначе в узкой
    grid-колонке (`.form-grid`, несколько полей в ряд, как в `EditCategoryDialog`) инпут вылезает
    за рамки модалки своим intrinsic-размером.
- Тесты (vitest + Testing Library): файлы `*.test.ts(x)` рядом с исходником; глобали vitest НЕ включены —
  явные импорты `describe/it/expect/vi` из `'vitest'`; тесты без сети — `fetch`/`web/src/api.ts` мокаются
  (`vi.stubGlobal('fetch')`, `vi.mock`), сервер :3000 не запускается. Конфиг — `vitest.config.ts`
  (отдельно от `vite.config.ts`, прод-сборка не затронута).
- Интерфейс и сообщения об ошибках — на русском.
- Не ссылаться в комментариях на номера параграфов внешних документов (было неудобное место:
  комментарии массово цитировали `docs/ARCHITECTURE.md §N`, документ устарел и был удалён, ссылки
  пришлось вычищать по всему кодбейзу) — писать самодостаточные комментарии о текущем коде.

## Известные ограничения / грабли

- `user_categories.year_limit_kopecks` существует в схеме, но не имеет ни API, ни UI — только
  `month_limit_kopecks` («План на месяц» в `CategoryKindsSection`, `GET/PUT /api/categories/limits`)
  реально работает и попадает в `MonthOverview`. Не обещать пользователю годовое планирование,
  пока это не реализовано целиком (API + UI + агрегат).
- `category_abstract` («группа»/сфера) назначается категории по одной за раз, выбором из
  SearchableSelect (`CategoryKindsSection`; сама сфера заводится отдельно полем «Новая сфера» —
  `GET/POST /api/categories/areas`) — нет массового назначения, нет импорта готовой раскладки
  по сферам; переименование категории и сферы есть (`PUT /api/categories/:category`,
  `PUT /api/categories/areas/:area` — карандаш в `CategoryKindsSection`/`AreaGroupHeader`), но
  в отличие от user_categories (`DELETE /api/categories/:category`, иконка-корзина в
  `CategoryKindsSection`) удаления самой сферы пока нет ни в API, ни в UI.
- `WeekOperationsDialog` (попап операций по клику на ячейку MonthOverview) ограничен `LIMIT = 200`
  без пагинации внутри попапа — при большем числе операций показывается только «первые N из
  total», остальные не видны, пока не сузить период/категорию иначе (например через страницу
  «Операции» с постраничной навигацией).
- Финансовые цели (`goals`) — полностью ручная бухгалтерия: `GoalDto`/`GoalInputDto` = `{name,
  amountKopecks}`, никакого `categories[]`, никакого автопрогресса по операциям. «Прогресс» цели
  нужно отслеживать пользователю самостоятельно вне приложения.
- `OperationsQuery` в `shared/types.ts` не объявляет поле `categories` (список категорий через
  запятую), хотя `routes/operations.ts` и `web/src/api.ts` (`OperationsFilters.categories`) его
  полноценно поддерживают — это разъехавшийся, но рабочий контракт; при правке фильтров
  ориентироваться на реальный код роута/клиента, а не только на этот интерфейс.
- Скриптов `import:budget`/`export:budget`/`seed:category-kinds` не существует — вместе с ними
  удалены и артефакты `samples/budget_export/*.json` (были частью снесённой фичи импорта бюджета
  из xlsx).
- `npm run auto-map` — эвристика по словарю известных сетей (см. `HINTS` в
  `auto-map-merchants.ts`), не LLM: создаёт правило (`merchants.user_category_id`) только когда
  целевая категория однозначно резолвится среди уже существующих категорий пользователя. По
  умолчанию — предпросмотр без записи, `--apply` пишет. Расширять `HINTS` по мере появления новых
  сетей; не пытаться угадывать категорию для неоднозначных описаний (переводы людям и т.п.).
- Дни зарплаты (`GeneralSettingsSection`, `settings.salary_days`) не заданы по умолчанию — обзор
  месяца показывает подсказку «указать в Настройках» вместо «дней до ЗП», пока не введены.
- Сброс данных: остановить приложение и `rm data/cashflows.sqlite*` (включая -wal/-shm); при
  старте база пересоздастся. **НИКОГДА не делать это без явной просьбы пользователя** — это
  стирает реальные данные (операции/мерчанты/правила/категории/цели), а не только тестовые; для
  проверки фичи создавайте/удаляйте записи через API (curl), не пересоздавайте БД целиком.
- Порты: бек :3000, vite :5173. `PORT`/`DATA_DIR`/`DB_FILE`/`WEB_DIST` переопределяются через env
  (`server/src/config.ts`), dotenv не используется — только дефолты в коде.

## Тестовые данные

`samples/sample-operations.csv` — 117 операций за 01–08.09.2026 (из них 99 участвуют в аналитике,
18 — внутренние переводы с «Учёт в аналитике» = Нет). Формат файла — `samples/CSV_FORMAT.md`
(UTF-8, CRLF, `;`, все поля в кавычках, 17 колонок с русскими заголовками, даты `DD.MM.YYYY HH:mm:ss`).
`npm run import:samples` идемпотентен — можно запускать повторно без страха: повторный импорт
даёт `inserted: 0`, `duplicatesSkipped: 117`.
