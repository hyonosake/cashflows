import { useApiQuery } from './useApiQuery';
import type { ApiQueryResult } from './useApiQuery';
import { fetchGoals } from '../api';
import type { GoalDto } from '../../../shared/types';

/** Список целей накопления; `version` растёт после CRUD/импорта (см. App.tsx). */
export function useGoals(version: number): ApiQueryResult<GoalDto[]> {
    return useApiQuery<GoalDto[]>((signal) => fetchGoals(signal), [version], 'Не удалось загрузить цели');
}
