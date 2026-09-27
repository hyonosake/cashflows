import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useApiQuery } from './useApiQuery';
import { ApiError } from '../api';

/**
 * Тесты универсального хука загрузки: data/error,
 * abort при смене deps (race из ревью!) и unmount, reload().
 * Сети нет: fetcher — замыкание с Deferred-ответами.
 */

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (error: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

/**
 * Хук-обвязка: заготовленные Deferred-ответы + журнал полученных AbortSignal.
 * fetcher берёт deferred ПО ИНДЕКСУ вызова (не shift): после первого вызова
 * queue[0] остаётся доступен тесту для resolve/reject (иначе тест достаёт
 * undefined — вскрыто первым прогоном Этапа R2).
 */
function setupFetcher(): {
    fetcher: (signal: AbortSignal) => Promise<string>;
    signals: AbortSignal[];
    queue: Deferred<string>[];
} {
    const signals: AbortSignal[] = [];
    const queue: Deferred<string>[] = [];
    const fetcher = vi.fn((signal: AbortSignal): Promise<string> => {
        signals.push(signal);
        const deferred = queue[signals.length - 1];
        if (deferred === undefined) throw new Error('нет заготовленного ответа');
        return deferred.promise;
    });
    return { fetcher, signals, queue };
}

describe('useApiQuery', () => {
    it('успешная загрузка: loading true → data, loading false', async () => {
        const { fetcher, queue } = setupFetcher();
        queue.push(createDeferred<string>());
        const { result } = renderHook(() => useApiQuery(fetcher, []));

        expect(result.current.loading).toBe(true);
        expect(result.current.data).toBeNull();
        expect(result.current.error).toBeNull();

        await act(async () => {
            queue[0]?.resolve('данные');
        });

        expect(result.current.loading).toBe(false);
        expect(result.current.data).toBe('данные');
        expect(result.current.error).toBeNull();
        expect(fetcher).toHaveBeenCalledOnce();
    });

    it('ошибка → error c текстом ApiError + details, data не теряется', async () => {
        const { fetcher, queue } = setupFetcher();
        queue.push(createDeferred<string>(), createDeferred<string>());
        const { result } = renderHook(() => useApiQuery(fetcher, []));

        await act(async () => {
            queue[0]?.resolve('старые данные');
        });
        expect(result.current.data).toBe('старые данные');

        act(() => {
            result.current.reload();
        });

        await act(async () => {
            queue[1]?.reject(
                new ApiError(400, 'Ошибка валидации запроса', [{ path: 'name', message: 'обязателен' }]),
            );
        });

        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBe('Ошибка валидации запроса (name: обязателен)');
        // data не обнуляется на время ошибки — компонент решает сам, что показывать.
        expect(result.current.data).toBe('старые данные');
    });

    it('race при смене deps: старый запрос абортится, запоздалый ответ игнорируется', async () => {
        const { fetcher, signals, queue } = setupFetcher();
        queue.push(createDeferred<string>(), createDeferred<string>());
        const { result, rerender } = renderHook(
            ({ dep }: { dep: number }) => useApiQuery((signal) => fetcher(signal), [dep]),
            { initialProps: { dep: 1 } },
        );

        expect(fetcher).toHaveBeenCalledTimes(1);

        // Смена deps → cleanup предыдущего эффекта abort'ит первый запрос.
        rerender({ dep: 2 });
        expect(signals[0]?.aborted).toBe(true);
        expect(signals[1]?.aborted).toBe(false);
        expect(fetcher).toHaveBeenCalledTimes(2);
        expect(result.current.loading).toBe(true);

        // Запоздалый ответ «старого» запроса не перезаписывает состояние.
        await act(async () => {
            queue[0]?.resolve('запоздалый');
        });
        expect(result.current.data).toBeNull();
        expect(result.current.loading).toBe(true);
        expect(result.current.error).toBeNull();

        // Свежий ответ — единственный, который применяется.
        await act(async () => {
            queue[1]?.resolve('свежий');
        });
        expect(result.current.data).toBe('свежий');
        expect(result.current.loading).toBe(false);
    });

    it('race: reject отменённого запроса не превращается в ошибку для пользователя', async () => {
        const { fetcher, signals, queue } = setupFetcher();
        queue.push(createDeferred<string>(), createDeferred<string>());
        const { result, rerender } = renderHook(
            ({ dep }: { dep: number }) => useApiQuery((signal) => fetcher(signal), [dep]),
            { initialProps: { dep: 1 } },
        );

        rerender({ dep: 2 });
        await act(async () => {
            queue[0]?.reject(new Error('запоздалый сбой'));
        });
        expect(signals[0]?.aborted).toBe(true);
        expect(result.current.error).toBeNull();
        expect(result.current.loading).toBe(true);

        await act(async () => {
            queue[1]?.resolve('ок');
        });
        expect(result.current.data).toBe('ок');
        expect(result.current.error).toBeNull();
    });

    it('unmount → активный запрос абортится', async () => {
        const { fetcher, signals, queue } = setupFetcher();
        queue.push(createDeferred<string>());
        const { unmount } = renderHook(() => useApiQuery(fetcher, []));

        expect(signals[0]?.aborted).toBe(false);
        unmount();
        expect(signals[0]?.aborted).toBe(true);

        // Позднее разрешение после unmount не падает и не меняет состояние.
        await act(async () => {
            queue[0]?.resolve('никому не нужное');
        });
    });

    it('reload() → повторный запрос, предыдущий абортится, данные обновляются', async () => {
        const { fetcher, signals, queue } = setupFetcher();
        queue.push(createDeferred<string>(), createDeferred<string>());
        const { result } = renderHook(() => useApiQuery(fetcher, []));

        await act(async () => {
            queue[0]?.resolve('v1');
        });
        expect(result.current.data).toBe('v1');

        act(() => {
            result.current.reload();
        });
        expect(fetcher).toHaveBeenCalledTimes(2);
        expect(signals[0]?.aborted).toBe(true);

        await act(async () => {
            queue[1]?.resolve('v2');
        });
        expect(result.current.data).toBe('v2');
        expect(result.current.loading).toBe(false);
    });

    it('не-Error отклонение → текст из errorLabel (fallback)', async () => {
        const { fetcher, queue } = setupFetcher();
        queue.push(createDeferred<string>());
        const { result } = renderHook(() => useApiQuery(fetcher, [], 'Не удалось загрузить дашборд'));

        await act(async () => {
            queue[0]?.reject('что-то совсем стороннее');
        });
        expect(result.current.error).toBe('Не удалось загрузить дашборд');

        await waitFor(() => expect(result.current.loading).toBe(false));
    });
});
