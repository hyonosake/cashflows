import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportResultDto } from '../../../shared/types';
import { useImport } from './useImport';
import { ApiError, importCsv } from '../api';

/**
 * useImport — состояние загрузки CSV: idle → loading → result | error.
 * Модуль ../api мокается (vi.mock) — сети нет, сервер :3000 не трогается;
 * ApiError оставляем настоящим (importOriginal), чтобы ветка instanceof работала.
 */

vi.mock('../api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../api')>();
    return { ...actual, importCsv: vi.fn() };
});

const importCsvMock = vi.mocked(importCsv);

const result: ImportResultDto = {
    sourceFile: 'ops.csv',
    parsed: 117,
    inserted: 99,
    duplicatesSkipped: 16,
    errors: [{ line: 5, reason: 'Некорректная дата' }],
};

beforeEach(() => {
    importCsvMock.mockReset();
});

describe('useImport', () => {
    it('успешная загрузка: loading → result, onImported вызван с результатом', async () => {
        importCsvMock.mockResolvedValueOnce(result);
        const onImported = vi.fn();
        const { result: hook } = renderHook(() => useImport(onImported));

        expect(hook.current.state).toEqual({ kind: 'idle' });
        expect(hook.current.busy).toBe(false);

        const file = new File(['a;b'], 'ops.csv', { type: 'text/csv' });
        let uploadPromise: Promise<void> | undefined;
        act(() => {
            uploadPromise = hook.current.upload(file);
        });
        expect(hook.current.state).toEqual({ kind: 'loading' });
        expect(hook.current.busy).toBe(true);
        expect(importCsvMock).toHaveBeenCalledExactlyOnceWith(file);

        await act(async () => {
            await uploadPromise;
        });

        expect(hook.current.state).toEqual({ kind: 'result', result });
        expect(hook.current.busy).toBe(false);
        expect(onImported).toHaveBeenCalledExactlyOnceWith(result);
    });

    it('ApiError c details[] → error: message + читаемая строка деталей', async () => {
        importCsvMock.mockRejectedValueOnce(
            new ApiError(400, 'Ошибка валидации запроса', [{ path: 'file', message: 'обязателен' }]),
        );
        const onImported = vi.fn();
        const { result: hook } = renderHook(() => useImport(onImported));

        await act(async () => {
            await hook.current.upload(new File(['x'], 'x.csv')).catch(() => undefined);
        });

        expect(hook.current.state).toEqual({
            kind: 'error',
            message: 'Ошибка валидации запроса',
            details: 'file: обязателен',
        });
        expect(onImported).not.toHaveBeenCalled();
    });

    it('ApiError без details → error без поля details', async () => {
        importCsvMock.mockRejectedValueOnce(new ApiError(400, 'CSV-файл не соответствует формату: нет заголовков'));
        const { result: hook } = renderHook(() => useImport(vi.fn()));

        await act(async () => {
            await hook.current.upload(new File(['x'], 'x.csv')).catch(() => undefined);
        });

        expect(hook.current.state).toEqual({
            kind: 'error',
            message: 'CSV-файл не соответствует формату: нет заголовков',
        });
    });

    it('не-ApiError (сбой сети) → общий текст «Не удалось загрузить файл»', async () => {
        importCsvMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        const { result: hook } = renderHook(() => useImport(vi.fn()));

        await act(async () => {
            await hook.current.upload(new File(['x'], 'x.csv')).catch(() => undefined);
        });

        expect(hook.current.state).toEqual({ kind: 'error', message: 'Не удалось загрузить файл' });
    });

    it('после ошибки повторная загрузка сбрасывает состояние и может завершиться успехом', async () => {
        importCsvMock
            .mockRejectedValueOnce(new ApiError(400, 'битый файл'))
            .mockResolvedValueOnce(result);
        const { result: hook } = renderHook(() => useImport(vi.fn()));
        const file = new File(['x'], 'x.csv');

        await act(async () => {
            await hook.current.upload(file).catch(() => undefined);
        });
        expect(hook.current.state.kind).toBe('error');

        await act(async () => {
            await hook.current.upload(file);
        });

        await waitFor(() => expect(hook.current.state).toEqual({ kind: 'result', result }));
    });
});
