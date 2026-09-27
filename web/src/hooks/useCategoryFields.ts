import { useApiQuery } from './useApiQuery';
import type { ApiQueryResult } from './useApiQuery';
import { fetchCategoryFields } from '../api';
import type { CategoryFieldDto } from '../../../shared/types';

/** Категории пользователя с CategoryField (или null); `version` растёт после CRUD. */
export function useCategoryFields(version: number): ApiQueryResult<CategoryFieldDto[]> {
    return useApiQuery<CategoryFieldDto[]>(
        (signal) => fetchCategoryFields(signal),
        [version],
        'Не удалось загрузить группы категорий',
    );
}
