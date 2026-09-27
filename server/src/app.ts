import fs from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import type { Db } from './db.js';
import type { Config } from './config.js';
import { HttpError } from './http.js';
import { healthRoutes } from './routes/health.js';
import { importRoutes } from './routes/import.js';
import { operationsRoutes } from './routes/operations.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { categoryRoutes } from './routes/categories.js';
import { categoryMappingRoutes } from './routes/categoryMappings.js';
import { categoryAreaRoutes } from './routes/categoryAreas.js';
import { goalRoutes } from './routes/goals.js';
import { merchantRoutes } from './routes/merchants.js';
import { settingsRoutes } from './routes/settings.js';
import { debugRoutes } from './routes/debug.js';

/**
 * Фабрика приложения: декорации db/config, плагины,
 * регистрация роутов, единые обработчики ошибок (400/404/500 с JSON {error, details}).
 */
export async function buildFastify(db: Db, config: Config): Promise<FastifyInstance> {
    const fastify = Fastify({
        logger: true,
        bodyLimit: 2 * 1024 * 1024,
    });

    fastify.decorate('db', db);
    fastify.decorate('config', config);

    // Обработчики ошибок — ДО регистрации роутов: дети наследуют их в момент
    // создания контекста (иначе роуты отвечают дефолтным форматом Fastify).
    fastify.setNotFoundHandler(async (request, reply) => {
        await reply.code(404).send({ error: `Маршрут не найден: ${request.method} ${request.url}` });
    });

    fastify.setErrorHandler(async (error, request, reply) => {
        if (error instanceof HttpError) {
            return await reply
                .code(error.statusCode)
                .send({ error: error.message, details: error.details });
        }
        // Fastify передаёт не только FastifyError, поэтому structural typing.
        interface ErrorWithStatusCode {
            statusCode?: number;
            message?: string;
        }
        const withCode = error as ErrorWithStatusCode;
        const statusCode = typeof withCode.statusCode === 'number' ? withCode.statusCode : 500;
        if (statusCode >= 500) {
            request.log.error(error);
        }
        return await reply.code(statusCode).send({
            error:
                statusCode >= 500
                    ? 'Внутренняя ошибка сервера'
                    : (withCode.message ?? 'Ошибка запроса'),
        });
    });

    await fastify.register(multipart, {
        limits: { fileSize: 20 * 1024 * 1024, files: 1 },
    });

    // Прод-раздача веб-сборки (Этап 3); на Этапе 2 web/dist ещё не существует.
    if (fs.existsSync(config.webDist)) {
        await fastify.register(fastifyStatic, { root: config.webDist, prefix: '/' });
    }

    await fastify.register(healthRoutes);
    await fastify.register(importRoutes);
    await fastify.register(operationsRoutes);
    await fastify.register(dashboardRoutes);
    await fastify.register(categoryRoutes);
    await fastify.register(categoryMappingRoutes);
    await fastify.register(categoryAreaRoutes);
    await fastify.register(goalRoutes);
    await fastify.register(merchantRoutes);
    await fastify.register(settingsRoutes);
    await fastify.register(debugRoutes);

    return fastify;
}
