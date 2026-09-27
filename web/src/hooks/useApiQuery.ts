import { useCallback, useEffect, useRef, useState } from 'react';
import type { DependencyList } from 'react';
import { apiErrorText } from '../api';

/**
 * Универсальный хук загрузки GET-данных:
 * - AbortController в cleanup — запросы отменяются при unmount и при смене
 *   зависимостей (race conditions: устаревший ответ не перезапишет свежий,
 *   StrictMode double-mount не даёт двойных «живых» запросов);
 * - data не обнуляется на время перезагрузки — компонент сам решает, показывать
 *   ли спиннер с нуля или старые данные поверх загрузки;
 * - reload() — принудительная перезагрузка (например после CRUD).
 */

export interface ApiQueryState<T> {
    data: T | null;
    loading: boolean;
    error: string | null;
}

export interface ApiQueryResult<T> extends ApiQueryState<T> {
    reload: () => void;
}

export function useApiQuery<T>(
    fetcher: (signal: AbortSignal) => Promise<T>,
    deps: DependencyList,
    errorLabel?: string,
): ApiQueryResult<T> {
    const [state, setState] = useState<ApiQueryState<T>>({ data: null, loading: true, error: null });
    const [reloadTick, setReloadTick] = useState(0);

    // Свежие fetcher/errorLabel через ref: не попадают в deps (стабильность массива),
    // но в запросе всегда используются актуальные замыкания.
    const fetcherRef = useRef(fetcher);
    fetcherRef.current = fetcher;
    const errorLabelRef = useRef(errorLabel);
    errorLabelRef.current = errorLabel;

    useEffect(() => {
        const controller = new AbortController();
        setState((prev) => ({ data: prev.data, loading: true, error: null }));
        fetcherRef
            .current(controller.signal)
            .then((data) => {
                if (!controller.signal.aborted) {
                    setState({ data, loading: false, error: null });
                }
            })
            .catch((error: unknown) => {
                // Отменённый запрос (unmount / новая загрузка) — не ошибка для пользователя.
                if (controller.signal.aborted) return;
                setState((prev) => ({
                    data: prev.data,
                    loading: false,
                    error: apiErrorText(error, errorLabelRef.current),
                }));
            });
        return () => {
            controller.abort();
        };
        // deps формируются обёртками (useDashboard/useOperations/…): для каждого места
        // вызова размер массива стабилен; fetcher берётся из ref.
    }, [...deps, reloadTick]);

    const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);

    return { data: state.data, loading: state.loading, error: state.error, reload };
}
