import type { FastifyInstance } from 'fastify';
import { parseOr400 } from '../http.js';
import { customMappingInputSchema, idParamSchema, mccParamSchema, mcMappingInputSchema } from './schemas.js';
import {
    createCustomMapping,
    createMccMapping,
    deleteCustomMapping,
    deleteMccMapping,
    listCustomMappings,
    listMccMappings,
    listMccOptions,
} from '../domain/categoryMappings.js';

/**
 * GET/POST/DELETE /api/categories/mcc-mappings — правила по банковскому MCC-коду.
 * GET /api/categories/mcc-options — MCC-коды из РЕАЛЬНЫХ операций с примерами названий
 * мерчантов и счётчиком (MappingsSection выбирает код из этого списка, а не вслепую).
 * GET/POST/DELETE /api/categories/custom-mappings — правила по подстроке в «Сообщении».
 */
export async function categoryMappingRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.get('/api/categories/mcc-mappings', async () => {
        return await Promise.resolve(listMccMappings(fastify.db));
    });

    fastify.post('/api/categories/mcc-mappings', async (request, reply) => {
        const input = parseOr400(mcMappingInputSchema, request.body);
        const dto = createMccMapping(fastify.db, input);
        return await reply.code(201).send(dto);
    });

    fastify.delete('/api/categories/mcc-mappings/:mcc', async (request, reply) => {
        const { mcc } = parseOr400(mccParamSchema, request.params);
        deleteMccMapping(fastify.db, mcc);
        return await reply.code(204).send();
    });

    fastify.get('/api/categories/mcc-options', async () => {
        return await Promise.resolve(listMccOptions(fastify.db));
    });

    fastify.get('/api/categories/custom-mappings', async () => {
        return await Promise.resolve(listCustomMappings(fastify.db));
    });

    fastify.post('/api/categories/custom-mappings', async (request, reply) => {
        const input = parseOr400(customMappingInputSchema, request.body);
        const dto = createCustomMapping(fastify.db, input);
        return await reply.code(201).send(dto);
    });

    fastify.delete('/api/categories/custom-mappings/:id', async (request, reply) => {
        const { id } = parseOr400(idParamSchema, request.params);
        deleteCustomMapping(fastify.db, id);
        return await reply.code(204).send();
    });
}
