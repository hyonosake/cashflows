import type { ZodError, ZodTypeAny, z } from 'zod';

/**
 * Мини-хелперы HTTP-слоя: типизированная ошибка с кодом ответа и
 * валидация входных данных через zod (400 — ошибка валидации с деталями).
 * Общий код для всех роутов.
 */

export class HttpError extends Error {
    readonly statusCode: number;
    readonly details?: unknown;

    constructor(statusCode: number, message: string, details?: unknown) {
        super(message);
        this.name = 'HttpError';
        this.statusCode = statusCode;
        this.details = details;
    }
}

export function badRequest(message: string, details?: unknown): HttpError {
    return new HttpError(400, message, details);
}

export function notFound(message: string): HttpError {
    return new HttpError(404, message);
}

/** Бросает HttpError(400), если payload не соответствует zod-схеме. */
export function parseOr400<S extends ZodTypeAny>(schema: S, payload: unknown): z.output<S> {
    const result = schema.safeParse(payload);
    if (!result.success) {
        throw badRequest('Ошибка валидации запроса', zodDetails(result.error));
    }
    return result.data;
}

export function zodDetails(error: ZodError): unknown {
    return error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
    }));
}
