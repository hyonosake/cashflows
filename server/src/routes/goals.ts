import type { FastifyInstance } from 'fastify';
import { createGoal, deleteGoal, getGoalOr404, listGoals, updateGoal } from '../domain/goals.js';
import { parseOr400 } from '../http.js';
import { goalInputSchema, idParamSchema } from './schemas.js';

/**
 * CRUD /api/goals: GET список, POST создание (201),
 * PUT /:id обновление, DELETE /:id (204). Невалидное тело / неизвестный id → 400/404.
 */
export async function goalRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.get('/api/goals', async () => {
        return await Promise.resolve(listGoals(fastify.db));
    });

    fastify.post('/api/goals', async (request, reply) => {
        const input = parseOr400(goalInputSchema, request.body);
        const created = createGoal(fastify.db, input);
        return await reply.code(201).send(created);
    });

    fastify.put('/api/goals/:id', async (request, reply) => {
        const { id } = parseOr400(idParamSchema, request.params);
        const input = parseOr400(goalInputSchema, request.body);
        const updated = updateGoal(fastify.db, id, input);
        return await reply.code(200).send(updated);
    });

    fastify.delete('/api/goals/:id', async (request, reply) => {
        const { id } = parseOr400(idParamSchema, request.params);
        deleteGoal(fastify.db, id);
        return await reply.code(204).send();
    });

    fastify.get('/api/goals/:id', async (request) => {
        const { id } = parseOr400(idParamSchema, request.params);
        return await Promise.resolve(getGoalOr404(fastify.db, id));
    });
}
