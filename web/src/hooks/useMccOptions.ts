import { useApiQuery } from './useApiQuery';
import type { ApiQueryResult } from './useApiQuery';
import { fetchMccOptions } from '../api';
import type { McCodeOptionDto } from '../../../shared/types';

/** MCC-коды из реальных операций (примеры названий + счётчик), по убыванию частоты; `version` растёт после импорта. */
export function useMccOptions(version: number): ApiQueryResult<McCodeOptionDto[]> {
    return useApiQuery<McCodeOptionDto[]>((signal) => fetchMccOptions(signal), [version], 'Не удалось загрузить MCC-коды операций');
}
