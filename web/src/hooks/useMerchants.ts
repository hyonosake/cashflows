import { useApiQuery } from './useApiQuery';
import type { ApiQueryResult } from './useApiQuery';
import { fetchMerchants } from '../api';
import type { MerchantSummaryDto } from '../../../shared/types';

/**
 * Мерчанты с суммой трат за всё время и текущей категорией (GET /api/merchants,
 * MerchantsSection в «Настройках»). `version` растёт после смены категории мерчанта
 * или любого другого CRUD/импорта — та же схема инвалидации, что у остальных хуков данных.
 */
export function useMerchants(version: number): ApiQueryResult<MerchantSummaryDto[]> {
    return useApiQuery<MerchantSummaryDto[]>((signal) => fetchMerchants(signal), [version]);
}
