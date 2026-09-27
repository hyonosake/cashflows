import { useApiQuery } from './useApiQuery';
import type { ApiQueryResult } from './useApiQuery';
import { fetchCategories } from '../api';

/**
 * Категории (GET /api/categories). Без scope — все текущие эффективные категории операций,
 * для фильтров и чекбоксов бюджетов (там нужны и незамапленные банковские — иначе такие
 * операции нечем будет найти). scope='user' — только категории пользователя, без банковских
 * заглушек (MerchantsSection — см. api.ts). `version` (по умолчанию 0 — без перезагрузки)
 * растёт там, где новое правило/бюджет может добавить категорию, которой ещё не было в списке.
 */
export function useCategories(version = 0, scope?: 'user'): ApiQueryResult<string[]> {
    return useApiQuery<string[]>((signal) => fetchCategories(signal, scope), [version, scope]);
}
