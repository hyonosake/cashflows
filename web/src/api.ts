import type {
    CategoryFieldDto,
    CategoryKind,
    CategoryKindDto,
    CategoryLimitDto,
    CustomMappingDto,
    CustomMappingInputDto,
    DashboardDto,
    DebugTablesDto,
    GoalDto,
    GoalInputDto,
    McCodeOptionDto,
    McMappingDto,
    McMappingInputDto,
    MerchantCategoryInputDto,
    MerchantSummaryDto,
    ImportResultDto,
    IsoDate,
    OperationCategoryInputDto,
    OperationDto,
    OperationType,
    OperationsResponse,
    SettingsDto,
    SettingsInputDto,
} from '../../shared/types';
import { API_PREFIX } from './constants';

/**
 * Типизированный HTTP-клиент. Все вызовы идут на /api/*
 * (в dev — через прокси Vite на :3000, в прод — тот же origin).
 * Единая точка вызовов API: компоненты не делают fetch напрямую.
 * Ошибки сервера приходят в формате { error, details? } — бросаем ApiError.
 * GET-функции принимают AbortSignal (отмена в useApiQuery при unmount/смене deps).
 */

export class ApiError extends Error {
    readonly statusCode: number;
    /** Детали валидации 400: массив { path, message } от zod либо строка. */
    readonly details: unknown;

    constructor(statusCode: number, message: string, details?: unknown) {
        super(message);
        this.name = 'ApiError';
        this.statusCode = statusCode;
        this.details = details;
    }
}

/** Детали 400 → читаемая строка «path: message; …» (не «[object Object]»). */
export function formatApiErrorDetails(details: unknown): string | undefined {
    if (details === undefined || details === null) return undefined;
    if (typeof details === 'string') return details;
    if (Array.isArray(details)) {
        return details
            .map((item) => {
                if (typeof item === 'string') return item;
                if (typeof item === 'object' && item !== null) {
                    const rec = item as Record<string, unknown>;
                    const path = typeof rec['path'] === 'string' ? rec['path'] : '';
                    const message = typeof rec['message'] === 'string' ? rec['message'] : '';
                    const line = typeof rec['line'] === 'number' ? `строка ${rec['line']}: ` : '';
                    // line проверяется ПЕРВЫМ: иначе {line, message} попадал в ветку
                    // message и номер строки терялся (баг, вскрытый тестами Этапа R2).
                    if (line !== '') return line + message;
                    if (path !== '' || message !== '') {
                        return [path, message].filter(Boolean).join(': ');
                    }
                }
                return String(item);
            })
            .filter((s) => s !== '')
            .join('; ');
    }
    return JSON.stringify(details);
}

/** Произвольная ошибка → текст для пользователя (учитывает details из 400). */
export function apiErrorText(error: unknown, fallback = 'Неизвестная ошибка'): string {
    if (error instanceof ApiError) {
        const details = formatApiErrorDetails(error.details);
        return details === undefined || details === '' ? error.message : `${error.message} (${details})`;
    }
    return error instanceof Error ? error.message : fallback;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`${API_PREFIX}${path}`, {
            headers: init?.body !== undefined && !(init.body instanceof FormData)
                ? { 'Content-Type': 'application/json' }
                : undefined,
            ...init,
        });
    } catch (cause) {
        // AbortError — отмена самим приложением (useApiQuery): не маскируем сообщением о недоступности.
        if (cause instanceof DOMException && cause.name === 'AbortError') {
            throw cause;
        }
        throw new ApiError(0, 'Сервер недоступен. Убедитесь, что бекенд запущен на :3000', String(cause));
    }

    if (response.status === 204) {
        return undefined as T;
    }

    let payload: unknown = null;
    const text = await response.text();
    if (text !== '') {
        try {
            payload = JSON.parse(text) as unknown;
        } catch {
            payload = text;
        }
    }

    if (!response.ok) {
        if (typeof payload === 'object' && payload !== null && 'error' in payload) {
            const record = payload as Record<string, unknown>;
            const message = typeof record['error'] === 'string' ? record['error'] : `HTTP ${response.status}`;
            throw new ApiError(response.status, message, record['details']);
        }
        throw new ApiError(response.status, typeof payload === 'string' && payload !== '' ? payload : `HTTP ${response.status}`);
    }

    return payload as T;
}

function isoParam(name: string, value: IsoDate | undefined, query: URLSearchParams): void {
    if (value !== undefined) {
        query.set(name, value);
    }
}

// --- Импорт ---

export function importCsv(file: File): Promise<ImportResultDto> {
    const form = new FormData();
    form.append('file', file, file.name);
    return request<ImportResultDto>('/import', { method: 'POST', body: form });
}

// --- Операции ---

export interface OperationsFilters {
    from?: IsoDate;
    to?: IsoDate;
    category?: string;
    /** Несколько категорий (попап трат недели — WeekOperationsDialog); склеиваются через запятую. */
    categories?: string[];
    type?: OperationType;
    q?: string;
    analyticsOnly?: boolean;
    page?: number;
    limit?: number;
}

export function fetchOperations(filters: OperationsFilters = {}, signal?: AbortSignal): Promise<OperationsResponse> {
    const query = new URLSearchParams();
    isoParam('from', filters.from, query);
    isoParam('to', filters.to, query);
    if (filters.category !== undefined && filters.category !== '') query.set('category', filters.category);
    if (filters.categories !== undefined && filters.categories.length > 0) {
        query.set('categories', filters.categories.join(','));
    }
    if (filters.type !== undefined) query.set('type', filters.type);
    if (filters.q !== undefined && filters.q !== '') query.set('q', filters.q);
    if (filters.analyticsOnly !== undefined) query.set('analyticsOnly', String(filters.analyticsOnly));
    if (filters.page !== undefined) query.set('page', String(filters.page));
    if (filters.limit !== undefined) query.set('limit', String(filters.limit));
    const qs = query.toString();
    return request<OperationsResponse>(`/operations${qs === '' ? '' : `?${qs}`}`, { signal });
}

/** Ручная категория ТОЛЬКО для одной операции (разовый override, без изменения мерчанта). */
export function updateOperationCategory(id: number, input: OperationCategoryInputDto): Promise<OperationDto> {
    return request<OperationDto>(`/operations/${id}/category`, { method: 'PUT', body: JSON.stringify(input) });
}

// --- Дашборд ---

export function fetchDashboard(from?: IsoDate, to?: IsoDate, signal?: AbortSignal): Promise<DashboardDto> {
    if (from === undefined || to === undefined) {
        return request<DashboardDto>('/dashboard', { signal });
    }
    return request<DashboardDto>(`/dashboard?from=${from}&to=${to}`, { signal });
}

// --- Финансовые цели ---

export function fetchGoals(signal?: AbortSignal): Promise<GoalDto[]> {
    return request<GoalDto[]>('/goals', { signal });
}

export function createGoal(input: GoalInputDto): Promise<GoalDto> {
    return request<GoalDto>('/goals', { method: 'POST', body: JSON.stringify(input) });
}

export function updateGoal(id: number, input: GoalInputDto): Promise<GoalDto> {
    return request<GoalDto>(`/goals/${id}`, { method: 'PUT', body: JSON.stringify(input) });
}

export function deleteGoal(id: number): Promise<void> {
    return request<void>(`/goals/${id}`, { method: 'DELETE' });
}

// --- Категории ---

/**
 * scope='user' — только категории пользователя, без служебной «Без категории» (выбор ЦЕЛЕВОЙ
 * категории, например MerchantsSection). Без scope — те же категории + «Без категории» (фильтр
 * операций — там нужна возможность найти неразмеченные).
 */
export function fetchCategories(signal?: AbortSignal, scope?: 'user'): Promise<string[]> {
    return request<string[]>(`/categories${scope === undefined ? '' : `?scope=${scope}`}`, { signal });
}

/** Единственный способ завести НОВУЮ категорию (CategoryKindsSection) — везде остальные поля целевой категории — select из уже существующих. */
export function createUserCategory(name: string): Promise<{ name: string }> {
    return request<{ name: string }>('/categories', { method: 'POST', body: JSON.stringify({ name }) });
}

/** Удаление категории (кроме служебной «Без категории») — операции, ссылавшиеся только на неё, становятся «Без категории». */
export function deleteUserCategory(name: string): Promise<void> {
    return request<void>(`/categories/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

/** Переименование категории (кроме служебной «Без категории») — ссылки по id, без пересчёта. */
export function renameUserCategory(name: string, newName: string): Promise<{ name: string }> {
    return request<{ name: string }>(`/categories/${encodeURIComponent(name)}`, {
        method: 'PUT',
        body: JSON.stringify({ name: newName }),
    });
}

export function fetchCategoryKinds(signal?: AbortSignal): Promise<CategoryKindDto[]> {
    return request<CategoryKindDto[]>('/categories/kinds', { signal });
}

export function setCategoryKind(category: string, kind: CategoryKind | null): Promise<CategoryKindDto> {
    return request<CategoryKindDto>(`/categories/kinds/${encodeURIComponent(category)}`, {
        method: 'PUT',
        body: JSON.stringify({ kind }),
    });
}

export function fetchCategoryFields(signal?: AbortSignal): Promise<CategoryFieldDto[]> {
    return request<CategoryFieldDto[]>('/categories/fields', { signal });
}

export function setCategoryField(category: string, field: string | null): Promise<CategoryFieldDto> {
    return request<CategoryFieldDto>(`/categories/fields/${encodeURIComponent(category)}`, {
        method: 'PUT',
        body: JSON.stringify({ field }),
    });
}

/** Все существующие сферы (category_abstract) по имени — источник вариантов select в CategoryKindsSection. */
export function fetchCategoryAreas(signal?: AbortSignal): Promise<string[]> {
    return request<string[]>('/categories/areas', { signal });
}

/** Завести новую сферу отдельно от конкретной категории (в отличие от setCategoryField — find-or-create «попутно»). */
export function createCategoryArea(name: string): Promise<{ name: string }> {
    return request<{ name: string }>('/categories/areas', { method: 'POST', body: JSON.stringify({ name }) });
}

/** Переименование сферы — категории ссылаются на неё по id, без пересчёта. */
export function renameCategoryArea(name: string, newName: string): Promise<{ name: string }> {
    return request<{ name: string }>(`/categories/areas/${encodeURIComponent(name)}`, {
        method: 'PUT',
        body: JSON.stringify({ name: newName }),
    });
}

export function fetchCategoryLimits(signal?: AbortSignal): Promise<CategoryLimitDto[]> {
    return request<CategoryLimitDto[]>('/categories/limits', { signal });
}

export function setCategoryLimit(category: string, monthLimitKopecks: number | null): Promise<CategoryLimitDto> {
    return request<CategoryLimitDto>(`/categories/limits/${encodeURIComponent(category)}`, {
        method: 'PUT',
        body: JSON.stringify({ monthLimitKopecks }),
    });
}

// --- Маппинги ---

export function fetchMcMappings(signal?: AbortSignal): Promise<McMappingDto[]> {
    return request<McMappingDto[]>('/categories/mcc-mappings', { signal });
}

/** MCC-коды из реальных операций (mcc + примеры названий мерчантов) — для выбора кода при создании правила. */
export function fetchMccOptions(signal?: AbortSignal): Promise<McCodeOptionDto[]> {
    return request<McCodeOptionDto[]>('/categories/mcc-options', { signal });
}

export function createMcMapping(input: McMappingInputDto): Promise<McMappingDto> {
    return request<McMappingDto>('/categories/mcc-mappings', { method: 'POST', body: JSON.stringify(input) });
}

export function deleteMcMapping(mcc: string): Promise<void> {
    return request<void>(`/categories/mcc-mappings/${encodeURIComponent(mcc)}`, { method: 'DELETE' });
}

export function fetchCustomMappings(signal?: AbortSignal): Promise<CustomMappingDto[]> {
    return request<CustomMappingDto[]>('/categories/custom-mappings', { signal });
}

export function createCustomMapping(input: CustomMappingInputDto): Promise<CustomMappingDto> {
    return request<CustomMappingDto>('/categories/custom-mappings', { method: 'POST', body: JSON.stringify(input) });
}

export function deleteCustomMapping(id: number): Promise<void> {
    return request<void>(`/categories/custom-mappings/${id}`, { method: 'DELETE' });
}

// --- Мерчанты ---

export function fetchMerchants(signal?: AbortSignal): Promise<MerchantSummaryDto[]> {
    return request<MerchantSummaryDto[]>('/merchants', { signal });
}

export function setMerchantCategory(input: MerchantCategoryInputDto): Promise<void> {
    return request<void>('/merchants/category', { method: 'PUT', body: JSON.stringify(input) });
}

// --- Настройки ---

export function fetchSettings(signal?: AbortSignal): Promise<SettingsDto> {
    return request<SettingsDto>('/settings', { signal });
}

export function updateSettings(input: SettingsInputDto): Promise<SettingsDto> {
    return request<SettingsDto>('/settings', { method: 'PUT', body: JSON.stringify(input) });
}

// --- Debug ---

export function fetchDebugTables(signal?: AbortSignal): Promise<DebugTablesDto> {
    return request<DebugTablesDto>('/debug/tables', { signal });
}
