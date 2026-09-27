import { useApiQuery } from './useApiQuery';
import type { ApiQueryResult } from './useApiQuery';
import { fetchCustomMappings } from '../api';
import type { CustomMappingDto } from '../../../shared/types';

/** Список правил по подстроке в «Сообщении»; `version` растёт после CRUD/импорта. */
export function useCustomMappings(version: number): ApiQueryResult<CustomMappingDto[]> {
    return useApiQuery<CustomMappingDto[]>(
        (signal) => fetchCustomMappings(signal),
        [version],
        'Не удалось загрузить правила по сообщению',
    );
}
