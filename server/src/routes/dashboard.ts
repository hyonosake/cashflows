import type { FastifyInstance } from 'fastify';
import { buildDashboard } from '../domain/dashboard.js';
import { badRequest } from '../http.js';
import { resolveDashboardRange } from '../domain/periodResolution.js';
import { isoDateSchema } from './schemas.js';

/**
 * GET /api/dashboard — агрегаты дашборда.
 * `?from&to` (оба или ни одного; без параметров — текущая московская неделя Пн..Вс, см.
 * domain/periods.ts → resolveDashboardRange).
 */
export async function dashboardRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.get('/api/dashboard', async (request, reply) => {
        const rawQuery = request.query as Record<string, unknown>;
        const from = rawQuery['from'];
        const to = rawQuery['to'];

        let fromIso: string | undefined;
        let toIso: string | undefined;
        if (from !== undefined) {
            const parsed = isoDateSchema.safeParse(from);
            if (!parsed.success) {
                throw badRequest('Параметр from должен иметь формат YYYY-MM-DD');
            }
            fromIso = parsed.data;
        }
        if (to !== undefined) {
            const parsed = isoDateSchema.safeParse(to);
            if (!parsed.success) {
                throw badRequest('Параметр to должен иметь формат YYYY-MM-DD');
            }
            toIso = parsed.data;
        }

        let window: { from: string; to: string };
        try {
            // resolveDashboardRange никогда не возвращает null: без from/to — текущая неделя,
            // иначе — заданное окно (или бросает, если оно некорректно).
            window = resolveDashboardRange(fromIso, toIso)!;
        } catch (error) {
            throw badRequest(error instanceof Error ? error.message : 'Некорректные параметры from/to');
        }

        const dashboard = buildDashboard(fastify.db, window.from, window.to);
        return await reply.code(200).send(dashboard);
    });
}
