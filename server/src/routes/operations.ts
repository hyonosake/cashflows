import type { FastifyInstance } from 'fastify';
import { parseOr400 } from '../http.js';
import { idParamSchema, operationCategoryInputSchema, operationsQuerySchema } from './schemas.js';
import { listOperations, setOperationCategoryOverride } from '../domain/operations.js';
import type { OperationsResponse } from '../../../shared/types.js';

export async function operationsRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.get('/api/operations', async (request, reply): Promise<OperationsResponse> => {
        const query = parseOr400(operationsQuerySchema, request.query);
        const page = listOperations(fastify.db, query);
        return await reply.code(200).send(page);
    });

    // Ручная категория ТОЛЬКО для одной операции — разовый override (user_category_override_id),
    // должен совпадать с существующей user_categories.name (строгий список, импорт/правки его
    // не расширяют «на лету»).
    fastify.put('/api/operations/:id/category', async (request, reply) => {
        const { id } = parseOr400(idParamSchema, request.params);
        const input = parseOr400(operationCategoryInputSchema, request.body);
        const dto = setOperationCategoryOverride(fastify.db, id, input.categoryUser);
        return await reply.code(200).send(dto);
    });
}
