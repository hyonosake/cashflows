import { useApiQuery } from './useApiQuery';
import type { ApiQueryResult } from './useApiQuery';
import { fetchDashboard } from '../api';
import type { DashboardDto } from '../../../shared/types';
import { weekRangeFromOffset } from '../periods';

/**
 * Данные дашборда для недели со сдвигом `offset` (0 — текущая). `version` растёт
 * после импорта/CRUD → дашборд перезагружается (см. App.tsx).
 */
export function useDashboard(offset: number, version: number): ApiQueryResult<DashboardDto> {
    return useApiQuery<DashboardDto>(
        (signal) => {
            const range = weekRangeFromOffset(offset);
            return fetchDashboard(range.from, range.to, signal);
        },
        [offset, version],
        'Не удалось загрузить дашборд',
    );
}
