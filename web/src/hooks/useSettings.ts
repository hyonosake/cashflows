import { useApiQuery } from './useApiQuery';
import type { ApiQueryResult } from './useApiQuery';
import { fetchSettings } from '../api';
import type { SettingsDto } from '../../../shared/types';

/** Общие настройки приложения (пока — только день зарплаты); `version` растёт после сохранения. */
export function useSettings(version: number): ApiQueryResult<SettingsDto> {
    return useApiQuery<SettingsDto>((signal) => fetchSettings(signal), [version], 'Не удалось загрузить настройки');
}
