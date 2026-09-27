import { useApiQuery } from './useApiQuery';
import type { ApiQueryResult } from './useApiQuery';
import { fetchCategoryKinds } from '../api';
import type { CategoryKindDto } from '../../../shared/types';

/** Категории с тегом постоянная/переменная (или null); `version` растёт после CRUD. */
export function useCategoryKinds(version: number): ApiQueryResult<CategoryKindDto[]> {
    return useApiQuery<CategoryKindDto[]>(
        (signal) => fetchCategoryKinds(signal),
        [version],
        'Не удалось загрузить категории',
    );
}
