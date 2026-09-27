/**
 * Единый источник истины для API-контракта Cashflows (ARCHITECTURE.md §7.1/§7.2).
 * Импортируется сервером и фронтом по относительному пути.
 */

export type IsoDate = string; // 'YYYY-MM-DD', календарный день Europe/Moscow
export type Money = number; // копейки, целое (безопасно до 2^53)
export type OperationType = 'income' | 'expense';
export type CategoryKind = 'fixed' | 'variable' | 'reserve';

// --- Импорт ---

export interface ImportErrorDto {
    line: number; // номер строки в файле (1 — заголовочная)
    reason: string;
}

export interface ImportResultDto {
    sourceFile: string;
    parsed: number; // строк данных без заголовка
    inserted: number;
    duplicatesSkipped: number;
    errors: ImportErrorDto[];
}

// --- Операции ---

export interface OperationDto {
    id: number;
    datetimeIso: string; // UTC ISO-8601
    localDate: IsoDate;
    amountKopecks: Money; // со знаком: <0 расход, >0 доход
    type: OperationType;
    account: string;
    card: string | null;
    currency: string;
    status: string;
    categoryDefault: string; // банковская категория — только справочно
    category: string; // эффективная категория (живой JOIN, всегда непусто — «Без категории», если ничего не подошло)
    mcc: string | null;
    description: string; // = merchants.name
    message: string;
    bonusesKopecks: Money;
    includeInAnalytics: boolean;
    sourceFile: string;
}

export interface OperationCategoryInputDto {
    categoryUser: string; // разовая категория ТОЛЬКО для этой операции (должна существовать в user_categories)
}

export interface OperationsQuery {
    from?: IsoDate; // по localDate, включительно
    to?: IsoDate;
    category?: string;
    type?: OperationType;
    q?: string; // подстрока в description/account
    analyticsOnly?: boolean; // default true: только status='Ок' и учёт в аналитике=Да
    page?: number; // default 1
    limit?: number; // default 50, max 200
}

export interface OperationsResponse {
    items: OperationDto[];
    total: number;
    page: number;
    limit: number;
}

// --- Дашборд ---

export interface PeriodTotalsDto {
    incomeKopecks: Money;
    expenseKopecks: Money; // положительное число
    operationsCount: number;
}

export interface CategorySliceDto {
    category: string;
    incomeKopecks: Money;
    expenseKopecks: Money;
    shareOfExpenses: number; // 0..1 от итоговых расходов периода
    kind: CategoryKind | null; // null = категория не размечена
}

export interface ExpenseByKindDto {
    fixedKopecks: Money;
    variableKopecks: Money;
    reserveKopecks: Money;
    unclassifiedKopecks: Money;
}

export interface DashboardDto {
    period: { from: IsoDate; to: IsoDate; type: 'week' | 'month' | 'range' };
    totals: PeriodTotalsDto;
    prevTotals: PeriodTotalsDto; // предыдущий период той же длины
    change: {
        incomeDeltaKopecks: Money;
        incomePct: number | null; // null, если prev = 0
        expenseDeltaKopecks: Money;
        expensePct: number | null;
    };
    byCategory: CategorySliceDto[]; // по убыванию расходов
    expenseByKind: ExpenseByKindDto; // расходы периода: постоянные/переменные/резерв/не размечено
    goals: GoalDto[]; // финансовые цели (без автопрогресса)
    monthOverview: MonthOverviewDto; // обзор календарного месяца, содержащего period.from
}

// --- Обзор месяца ---

export interface MonthOverviewWeekDto {
    index: number; // 1..N по порядку внутри месяца
    from: IsoDate;
    to: IsoDate;
}

export interface MonthOverviewCategoryDto {
    name: string;
    categoryAbstract: string | null; // сфера (category_abstract); null = не размечена
    limitKopecks: Money | null; // план на месяц (user_categories.month_limit_kopecks); null — не задан
    weeklySpentKopecks: Money[]; // потрачено по каждой неделе месяца, индекс = weeks[].index - 1
    spentKopecks: Money; // сумма weeklySpentKopecks, за весь календарный месяц
}

export interface MonthOverviewDto {
    month: { from: IsoDate; to: IsoDate; key: string }; // 'YYYY-MM'
    weeks: MonthOverviewWeekDto[]; // разбивка месяца на недели Пн–Вс (столбцы матрицы)
    categories: MonthOverviewCategoryDto[]; // плоский список трат месяца по категориям пользователя
    salaryDays: number[]; // из настроек, дни месяца 1..31; [] — не задано
    nextSalaryDate: IsoDate | null;
    daysUntilSalary: number | null;
    plannedIncomeKopecks: Money | null; // salaryAmountKopecks × salaryDays.length; null — не заданы оба
    expenseKopecks: Money; // фактические расходы за календарный месяц (все операции, не только категории пользователя)
    balanceKopecks: Money | null; // plannedIncomeKopecks − expenseKopecks; null — plannedIncomeKopecks не задан
    owedToUserKopecks: Money | null; // займы: сколько должны пользователю другие люди; ручной ввод из настроек, null — не задано
}

// --- Плановые лимиты категорий ---

export interface CategoryLimitDto {
    category: string;
    monthLimitKopecks: Money | null; // план на месяц; null — не задан
}

export interface CategoryLimitInputDto {
    monthLimitKopecks: Money | null;
}

// --- Цели (минимальный вид, без categories[]/прогресса) ---

export interface GoalDto {
    id: number;
    name: string;
    amountKopecks: Money;
}

export interface GoalInputDto {
    name: string;
    amountKopecks: Money;
}

// --- Категории ---

export interface CategoryKindDto {
    category: string;
    kind: CategoryKind | null; // null = не размечена
}

/**
 * CategoryField — сфера (category_abstract) поверх категории пользователя, например
 * «Еда и повседневное» объединяет «Продукты + бытовая химия»/«Кафе / доставка / рестораны»/«Табак».
 */
export interface CategoryFieldDto {
    category: string;
    field: string | null; // null = не размечена
}

export interface CategoryFieldInputDto {
    field: string | null;
}

// --- Маппинги ---

/** Правило по MCC (банковский код операции) → user_category. Один код — одно правило. */
export interface McMappingDto {
    mcc: string;
    targetCategory: string;
}

export interface McMappingInputDto {
    mcc: string;
    targetCategory: string;
}

/**
 * MCC-код, реально встречавшийся в операциях — для выбора кода ИЗ РЕАЛЬНЫХ данных при
 * создании правила (MappingsSection), а не вслепую по памяти («я их не буду вставлять» —
 * сырой 4-значный код без примера мерчанта ничего не говорит). examples — до 3 характерных
 * description этого кода (самые частые), operationsCount — сколько операций всего.
 */
export interface McCodeOptionDto {
    mcc: string;
    examples: string[];
    operationsCount: number;
}

/** Правило по подстроке в «Сообщении» перевода (например, по конкретному отправителю). */
export interface CustomMappingDto {
    id: number;
    matchValue: string;
    targetCategory: string;
}

export interface CustomMappingInputDto {
    matchValue: string;
    targetCategory: string;
}

// --- Мерчанты ---

export interface MerchantSummaryDto {
    merchant: string; // = merchants.name = operations.description
    category: string; // текущая категория мерчанта; при mixedCategories — та, на которую пришлось больше всего трат
    mixedCategories: boolean; // операции этого мерчанта сейчас размечены по-разному (разовые override'ы)
    spentKopecks: Money; // сумма расходов за всё время
    operationsCount: number;
}

export interface MerchantCategoryInputDto {
    merchant: string;
    targetCategory: string;
}

// --- Настройки ---

export interface SettingsDto {
    salaryDays: number[]; // дни месяца 1..31 (зарплата может приходить несколько раз в месяц); [] = не задано
    salaryAmountKopecks: Money | null; // доход за ОДИН день зарплаты (план); null — не задано
    owedToUserKopecks: Money | null; // займы: сколько должны пользователю другие люди; null — не задано
}

export interface SettingsInputDto {
    salaryDays: number[];
    salaryAmountKopecks: Money | null;
    owedToUserKopecks: Money | null;
}

// --- Debug (служебная страница) ---

export interface DebugTableDto {
    name: string;
    totalRows: number;
    rows: Array<Record<string, unknown>>; // первые N строк «как есть» — для сверки миграций
}

export interface DebugTablesDto {
    tables: DebugTableDto[];
}
