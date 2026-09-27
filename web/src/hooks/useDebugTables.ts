import { useApiQuery } from './useApiQuery';
import type { ApiQueryResult } from './useApiQuery';
import { fetchDebugTables } from '../api';
import type { DebugTablesDto } from '../../../shared/types';

/** Дамп всех таблиц БД для debug-страницы; `version` растёт после импорта/CRUD — перезагрузить. */
export function useDebugTables(version: number): ApiQueryResult<DebugTablesDto> {
    return useApiQuery<DebugTablesDto>((signal) => fetchDebugTables(signal), [version], 'Не удалось загрузить таблицы БД');
}
