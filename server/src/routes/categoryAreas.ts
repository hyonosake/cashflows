import type { FastifyInstance } from 'fastify';
import { parseOr400 } from '../http.js';
import { areaParamSchema, categoryAreaInputSchema, categoryFieldInputSchema, categoryParamSchema } from './schemas.js';
import {
    createCategoryArea,
    listCategoryAbstracts,
    listCategoryAreaNames,
    renameCategoryArea,
    setCategoryAbstract,
} from '../domain/categoryAreas.js';

/**
 * GET/PUT /api/categories/fields — сфера (category_abstract) поверх категории пользователя.
 * GET/POST /api/categories/areas — сферы (category_abstract) как самостоятельный список: все
 * существующие имена + создание новой БЕЗ привязки к конкретной категории (в отличие от
 * PUT /fields/:category, которая заводит сферу «попутно», find-or-create по имени).
 * PUT /api/categories/areas/:area — переименование сферы; категории ссылаются на неё по id,
 * каскад не нужен.
 */
export async function categoryAreaRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.get('/api/categories/fields', async () => {
        return await Promise.resolve(listCategoryAbstracts(fastify.db));
    });

    fastify.put('/api/categories/fields/:category', async (request) => {
        const { category } = parseOr400(categoryParamSchema, request.params);
        const { field } = parseOr400(categoryFieldInputSchema, request.body);
        setCategoryAbstract(fastify.db, category, field);
        return await Promise.resolve({ category, field });
    });

    fastify.get('/api/categories/areas', async () => {
        return await Promise.resolve(listCategoryAreaNames(fastify.db));
    });

    fastify.post('/api/categories/areas', async (request, reply) => {
        const { name } = parseOr400(categoryAreaInputSchema, request.body);
        const dto = createCategoryArea(fastify.db, name);
        return await reply.code(201).send(dto);
    });

    fastify.put('/api/categories/areas/:area', async (request) => {
        const { area } = parseOr400(areaParamSchema, request.params);
        const { name } = parseOr400(categoryAreaInputSchema, request.body);
        return await Promise.resolve(renameCategoryArea(fastify.db, area, name));
    });
}
