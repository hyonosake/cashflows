import { useApiQuery } from './useApiQuery';
import type { ApiQueryResult } from './useApiQuery';
import { fetchMcMappings } from '../api';
import type { McMappingDto } from '../../../shared/types';

/** Список правил по MCC-коду; `version` растёт после CRUD/импорта. */
export function useMcMappings(version: number): ApiQueryResult<McMappingDto[]> {
    return useApiQuery<McMappingDto[]>((signal) => fetchMcMappings(signal), [version], 'Не удалось загрузить правила по MCC');
}
