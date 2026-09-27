import { useApiQuery } from './useApiQuery';
import type { ApiQueryResult } from './useApiQuery';
import { fetchCategoryAreas } from '../api';

/** Все существующие сферы (category_abstract) по имени; `version` растёт после CRUD. */
export function useCategoryAreas(version: number): ApiQueryResult<string[]> {
    return useApiQuery<string[]>(
        (signal) => fetchCategoryAreas(signal),
        [version],
        'Не удалось загрузить сферы категорий',
    );
}
