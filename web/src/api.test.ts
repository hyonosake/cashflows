import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ApiError,
    apiErrorText,
    createGoal,
    createMcMapping,
    deleteGoal,
    deleteMcMapping,
    fetchCategoryKinds,
    fetchDashboard,
    fetchGoals,
    fetchMcMappings,
    fetchOperations,
    formatApiErrorDetails,
    importCsv,
    setCategoryKind,
} from './api';

/**
 * Тесты HTTP-клиента на моке global.fetch (vi.stubGlobal):
 * никакой сети, сервер :3000 не трогается. Проверяется разбор ответов:
 * 200 JSON, 204, 400 {error, details[]}, не-JSON тело, network failure, AbortError.
 */

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
    // vi.fn() на уровне модуля: без очистки calls[0] указывал бы на вызов
    // из предыдущего теста (вскрыто первым прогоном Этапа R2).
    fetchMock.mockClear();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status });
}

function stubFetch(): void {
    vi.stubGlobal('fetch', fetchMock);
}

describe('request: успешные ответы', () => {
    it('200 JSON → разобранный payload; URL = /api + path', async () => {
        stubFetch();
        fetchMock.mockResolvedValueOnce(jsonResponse(200, [{ id: 1, name: 'Финансовая подушка', amountKopecks: 100000 }]));
        const data = await fetchGoals();
        expect(data).toEqual([{ id: 1, name: 'Финансовая подушка', amountKopecks: 100000 }]);
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/goals');
    });

    it('204 → undefined (DELETE без тела)', async () => {
        stubFetch();
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
        await expect(deleteGoal(7)).resolves.toBeUndefined();
    });

    it('GET /api/dashboard с диапазоном → query from/to', async () => {
        stubFetch();
        fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
        await fetchDashboard('2026-09-01', '2026-09-08');
        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/dashboard?from=2026-09-01&to=2026-09-08');
    });

    it('GET /api/operations: фильтры в query, пустые значения отброшены', async () => {
        stubFetch();
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [], total: 0, page: 1, limit: 50 }));
        await fetchOperations({ category: 'Метро', type: 'expense', analyticsOnly: false, page: 2, limit: 100, q: '', from: undefined });
        const url = String(fetchMock.mock.calls[0]?.[0]);
        expect(url.startsWith('/api/operations?')).toBe(true);
        const params = new URLSearchParams(url.slice(url.indexOf('?') + 1));
        expect(params.get('category')).toBe('Метро');
        expect(params.get('type')).toBe('expense');
        expect(params.get('analyticsOnly')).toBe('false');
        expect(params.get('page')).toBe('2');
        expect(params.get('limit')).toBe('100');
        expect(params.has('q')).toBe(false);
        expect(params.has('from')).toBe(false);
    });

    it('POST JSON → Content-Type application/json и тело-строка', async () => {
        stubFetch();
        fetchMock.mockResolvedValueOnce(jsonResponse(201, { id: 1, name: 'Подушка', amountKopecks: 1000000 }));
        await createGoal({ name: 'Подушка', amountKopecks: 1000000 });
        const init = fetchMock.mock.calls[0]?.[1];
        expect(init?.method).toBe('POST');
        expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
        expect(init?.body).toBe(JSON.stringify({ name: 'Подушка', amountKopecks: 1000000 }));
    });

    it('GET /api/categories/kinds → список категорий с тегом', async () => {
        stubFetch();
        fetchMock.mockResolvedValueOnce(jsonResponse(200, [{ category: 'Сима', kind: 'fixed' }]));
        const data = await fetchCategoryKinds();
        expect(data).toEqual([{ category: 'Сима', kind: 'fixed' }]);
        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/categories/kinds');
    });

    it('PUT /api/categories/kinds/:category → URL кодирует категорию, тело {kind}', async () => {
        stubFetch();
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { category: 'Еда вне дома', kind: 'variable' }));
        await setCategoryKind('Еда вне дома', 'variable');
        const [url, init] = fetchMock.mock.calls[0] ?? [];
        expect(url).toBe(`/api/categories/kinds/${encodeURIComponent('Еда вне дома')}`);
        expect(init?.method).toBe('PUT');
        expect(init?.body).toBe(JSON.stringify({ kind: 'variable' }));
    });

    it('PUT /api/categories/kinds/:category с kind=null → сброс тега', async () => {
        stubFetch();
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { category: 'Табак', kind: null }));
        await setCategoryKind('Табак', null);
        const init = fetchMock.mock.calls[0]?.[1];
        expect(init?.body).toBe(JSON.stringify({ kind: null }));
    });

    it('GET /api/categories/mcc-mappings → список правил', async () => {
        stubFetch();
        fetchMock.mockResolvedValueOnce(jsonResponse(200, [{ mcc: '5411', targetCategory: 'Продукты + бытовая химия' }]));
        const data = await fetchMcMappings();
        expect(data).toEqual([{ mcc: '5411', targetCategory: 'Продукты + бытовая химия' }]);
        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/categories/mcc-mappings');
    });

    it('POST /api/categories/mcc-mappings → создание правила', async () => {
        stubFetch();
        fetchMock.mockResolvedValueOnce(jsonResponse(201, { mcc: '4814', targetCategory: 'Связь + интернет' }));
        await createMcMapping({ mcc: '4814', targetCategory: 'Связь + интернет' });
        const [url, init] = fetchMock.mock.calls[0] ?? [];
        expect(url).toBe('/api/categories/mcc-mappings');
        expect(init?.method).toBe('POST');
        expect(init?.body).toBe(JSON.stringify({ mcc: '4814', targetCategory: 'Связь + интернет' }));
    });

    it('DELETE /api/categories/mcc-mappings/:mcc → удаление правила', async () => {
        stubFetch();
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
        await expect(deleteMcMapping('4814')).resolves.toBeUndefined();
        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/categories/mcc-mappings/4814');
        expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('DELETE');
    });

    it('POST FormData (импорт CSV) → без Content-Type (границу ставит браузер)', async () => {
        stubFetch();
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { sourceFile: 'x.csv', parsed: 0, inserted: 0, duplicatesSkipped: 0, errors: [] }));
        const file = new File(['a;b'], 'ops.csv', { type: 'text/csv' });
        await importCsv(file);
        const [url, init] = fetchMock.mock.calls[0] ?? [];
        expect(url).toBe('/api/import');
        expect(init?.method).toBe('POST');
        expect(init?.body).toBeInstanceOf(FormData);
        expect(init?.headers).toBeUndefined();
    });
});

describe('request: ошибки { error, details? } (§7)', () => {
    it('400 c details[] zod → ApiError statusCode/message/details', async () => {
        stubFetch();
        fetchMock.mockResolvedValueOnce(
            jsonResponse(400, {
                error: 'Ошибка валидации запроса',
                details: [
                    { path: 'amountKopecks', message: 'amountKopecks должен быть > 0' },
                    { path: 'name', message: 'name обязателен и не может быть пустым' },
                ],
            }),
        );
        const promise = fetchGoals();
        await expect(promise).rejects.toBeInstanceOf(ApiError);
        const error = (await promise.catch((e: unknown) => e)) as ApiError;
        expect(error.statusCode).toBe(400);
        expect(error.message).toBe('Ошибка валидации запроса');
        expect(error.details).toEqual([
            { path: 'amountKopecks', message: 'amountKopecks должен быть > 0' },
            { path: 'name', message: 'name обязателен и не может быть пустым' },
        ]);
    });

    it('400 c details[] → apiErrorText «path: message», склеенно через «;»', async () => {
        stubFetch();
        fetchMock.mockResolvedValueOnce(
            jsonResponse(400, {
                error: 'Ошибка валидации запроса',
                details: [
                    { path: 'amountKopecks', message: 'amountKopecks должен быть > 0' },
                    { path: 'name', message: 'name обязателен' },
                ],
            }),
        );
        // ApiError.message содержит только {error}; details добавляет apiErrorText().
        const error = await fetchGoals().catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ApiError);
        expect(apiErrorText(error)).toBe(
            'Ошибка валидации запроса (amountKopecks: amountKopecks должен быть > 0; name: name обязателен)',
        );
    });

    it('{error} без details → ApiError c message без дополнений', async () => {
        stubFetch();
        fetchMock.mockResolvedValueOnce(jsonResponse(404, { error: 'Маршрут не найден: GET /api/nope' }));
        const error = (await fetchGoals().catch((e: unknown) => e)) as ApiError;
        expect(error).toBeInstanceOf(ApiError);
        expect(error.statusCode).toBe(404);
        expect(error.message).toBe('Маршрут не найден: GET /api/nope');
        expect(error.details).toBeUndefined();
        expect(apiErrorText(error)).toBe('Маршрут не найден: GET /api/nope');
    });

    it('не-JSON тело ошибки (HTML-заглушка прокси) → текст тела становится message', async () => {
        stubFetch();
        fetchMock.mockResolvedValueOnce(new Response('<html>502 Bad Gateway</html>', { status: 502 }));
        const error = (await fetchGoals().catch((e: unknown) => e)) as ApiError;
        expect(error).toBeInstanceOf(ApiError);
        expect(error.statusCode).toBe(502);
        expect(error.message).toBe('<html>502 Bad Gateway</html>');
    });

    it('ошибка без поля error (произвольный JSON) → «HTTP <status>»', async () => {
        stubFetch();
        fetchMock.mockResolvedValueOnce(jsonResponse(500, { unexpected: true }));
        const error = (await fetchGoals().catch((e: unknown) => e)) as ApiError;
        expect(error.statusCode).toBe(500);
        expect(error.message).toBe('HTTP 500');
    });

    it('network failure (fetch отклонился) → ApiError 0 «Сервер недоступен»', async () => {
        stubFetch();
        fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        const error = (await fetchGoals().catch((e: unknown) => e)) as ApiError;
        expect(error).toBeInstanceOf(ApiError);
        expect(error.statusCode).toBe(0);
        expect(error.message).toBe('Сервер недоступен. Убедитесь, что бекенд запущен на :3000');
    });

    it('AbortError пробрасывается как есть (не маскируется «Сервер недоступен»)', async () => {
        stubFetch();
        const abort = new DOMException('The operation was aborted.', 'AbortError');
        fetchMock.mockRejectedValueOnce(abort);
        await expect(fetchGoals()).rejects.toBe(abort);
    });
});

describe('formatApiErrorDetails', () => {
    it.each([
        [undefined, undefined],
        [null, undefined],
        ['битый CSV-файл', 'битый CSV-файл'],
        [
            [{ path: 'amountKopecks', message: 'должен быть > 0' }],
            'amountKopecks: должен быть > 0',
        ],
        [
            [
                { path: 'name', message: 'обязателен' },
                { path: 'periodType', message: 'недопустимое значение' },
            ],
            'name: обязателен; periodType: недопустимое значение',
        ],
        [[{ line: 3, message: 'Некорректная дата' }], 'строка 3: Некорректная дата'],
        [['первая', 'вторая'], 'первая; вторая'],
        [[{ path: 'a', message: 'x' }, 'сырая строка'], 'a: x; сырая строка'],
        [[], ''],
        [{ code: 42 }, '{"code":42}'],
    ] as const)('details %j → %j', (details, expected) => {
        expect(formatApiErrorDetails(details)).toBe(expected);
    });
});

describe('apiErrorText', () => {
    it('ApiError с details → «message (details)»', () => {
        expect(
            apiErrorText(new ApiError(400, 'Ошибка валидации запроса', [{ path: 'name', message: 'обязателен' }])),
        ).toBe('Ошибка валидации запроса (name: обязателен)');
    });

    it('ApiError с пустыми details → только message', () => {
        expect(apiErrorText(new ApiError(400, 'Битый файл', []))).toBe('Битый файл');
    });

    it('обычный Error → message (fallback не используется)', () => {
        expect(apiErrorText(new Error('бум'), 'Не удалось загрузить')).toBe('бум');
    });

    it('не-Error значение → fallback', () => {
        expect(apiErrorText('строка-вместо-ошибки', 'Метка ошибки')).toBe('Метка ошибки');
        expect(apiErrorText(undefined)).toBe('Неизвестная ошибка');
    });
});
