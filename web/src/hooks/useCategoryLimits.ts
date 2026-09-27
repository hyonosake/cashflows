import { useApiQuery } from './useApiQuery';
import type { ApiQueryResult } from './useApiQuery';
import { fetchCategoryLimits } from '../api';
import type { CategoryLimitDto } from '../../../shared/types';

/** Категории пользователя с планом на месяц (или null); `version` растёт после CRUD. */
export function useCategoryLimits(version: number): ApiQueryResult<CategoryLimitDto[]> {
    return useApiQuery<CategoryLimitDto[]>(
        (signal) => fetchCategoryLimits(signal),
        [version],
        'Не удалось загрузить планы категорий',
    );
}
