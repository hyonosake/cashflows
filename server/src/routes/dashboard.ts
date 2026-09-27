import type { FastifyInstance } from 'fastify';
import { buildDashboard } from '../domain/dashboard.js';
import { badRequest } from '../http.js';
import { isoDateSchema } from './schemas.js';

/**
 * GET /api/dashboard — агрегаты дашборда (ARCHITECTURE.md §7.2, §8).
 * `?from&to` (оба или ни одного; без параметров — текущая московская неделя Пн..Вс).
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
        if ((fromIso === undefined) !== (toIso === undefined)) {
            throw badRequest('Параметры from и to должны быть заданы одновременно');
        }
        if (fromIso !== undefined && toIso !== undefined && fromIso > toIso) {
            throw badRequest('Параметр from не может быть больше to');
        }

        let window: { from: string; to: string };
        if (fromIso === undefined || toIso === undefined) {
            // Текущая московская неделя Пн..Вс (ARCHITECTURE.md §8.1)
            const todayIso = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
            const dowRaw = new Date(`${todayIso}T00:00:00Z`).getUTCDay();
            const dow = dowRaw === 0 ? 7 : dowRaw;
            const mondayMs = Date.parse(`${todayIso}T00:00:00Z`) - (dow - 1) * 86_400_000;
            const monday = new Date(mondayMs).toISOString().slice(0, 10);
            const sunday = new Date(mondayMs + 6 * 86_400_000).toISOString().slice(0, 10);
            window = { from: monday, to: sunday };
        } else {
            window = { from: fromIso, to: toIso };
        }

        const dashboard = buildDashboard(fastify.db, window.from, window.to);
        return await reply.code(200).send(dashboard);
    });
}
