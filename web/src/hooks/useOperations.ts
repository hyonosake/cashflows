import { useApiQuery } from './useApiQuery';
import type { ApiQueryResult } from './useApiQuery';
import { fetchOperations } from '../api';
import type { OperationsFilters } from '../api';
import type { OperationsResponse } from '../../../shared/types';
import { OPERATIONS_PAGE_SIZE } from '../constants';

/**
 * Страница операций (GET /api/operations). Зависимость — сериализованный ключ
 * фильтров+страницы: перезагрузка только при реальном изменении запроса.
 * `version` растёт после создания правила маппинга прямо со страницы операций
 * (пересчёт категорий меняет `category` у уже загруженных строк) — та же схема
 * инвалидации, что у useDashboard/useMappings.
 */
export function useOperations(query: OperationsFilters, page: number, version: number): ApiQueryResult<OperationsResponse> {
    const key = JSON.stringify({ ...query, page });
    return useApiQuery<OperationsResponse>(
        (signal) => fetchOperations({ ...query, page, limit: OPERATIONS_PAGE_SIZE }, signal),
        [key, version],
        'Не удалось загрузить операции',
    );
}
