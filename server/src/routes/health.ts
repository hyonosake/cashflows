import type { FastifyInstance } from 'fastify';

/** GET /api/health — живость (ARCHITECTURE.md §7.2). */
export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.get('/api/health', async () => {
        return await Promise.resolve({ ok: true, version: fastify.config.version });
    });
}
