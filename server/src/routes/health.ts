import type { FastifyInstance } from 'fastify';

/** GET /api/health — живость. */
export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.get('/api/health', async () => {
        return await Promise.resolve({ ok: true, version: fastify.config.version });
    });
}
