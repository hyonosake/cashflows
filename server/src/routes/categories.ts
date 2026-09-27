import type { FastifyInstance } from 'fastify';
import { parseOr400 } from '../http.js';
import {
    categoriesQuerySchema,
    categoryAreaInputSchema,
    categoryFieldInputSchema,
    categoryKindInputSchema,
    categoryLimitInputSchema,
    categoryParamSchema,
    customMappingInputSchema,
    idParamSchema,
    mccParamSchema,
    mcMappingInputSchema,
    userCategoryInputSchema,
} from './schemas.js';
import {
    createCategoryArea,
    createCustomMapping,
    createMccMapping,
    createUserCategory,
    deleteCustomMapping,
    deleteMccMapping,
    deleteUserCategory,
    listCategoryAbstracts,
    listCategoryAreaNames,
    listCategoryKinds,
    listCategoryLimits,
    listCustomMappings,
    listMccMappings,
    listMccOptions,
    listUserCategories,
    setCategoryAbstract,
    setCategoryKind,
    setCategoryLimit,
} from '../domain/categories.js';

/**
 * GET /api/categories — без ?scope: все категории пользователя + служебная «Без категории»
 * (для фильтра операций); ?scope=user — только категории пользователя (для выбора ЦЕЛЕВОЙ
 * категории, например MerchantsSection). POST /api/categories — ЕДИНСТВЕННОЕ место, где
 * заводится НОВАЯ категория (CategoryKindsSection, «Новая категория»); везде, где категория
 * выбирается как цель (маппинги, мерчанты), это строгий select из уже существующих, без
 * возможности вписать новое имя тут же — заводить новую категорию нужно сначала здесь.
 * DELETE /api/categories/:category — удаление категории (нельзя удалить «Без категории»);
 * все ссылки на неё разрываются одной транзакцией (domain/categories.ts →
 * deleteUserCategory) — override операций и merchants.user_category_id обнуляются,
 * mcc/custom-правила на неё удаляются; операции, ссылавшиеся ТОЛЬКО на неё, становятся
 * «Без категории» сами — через живой VIEW, пересчитывать не нужно (инвариант 5).
 * GET/POST/DELETE /api/categories/mcc-mappings — правила по банковскому MCC-коду.
 * GET /api/categories/mcc-options — MCC-коды из РЕАЛЬНЫХ операций с примерами названий
 * мерчантов и счётчиком (MappingsSection выбирает код из этого списка, а не вслепую).
 * GET/POST/DELETE /api/categories/custom-mappings — правила по подстроке в «Сообщении».
 * GET/PUT /api/categories/kinds — тег постоянная/переменная/резерв (user_categories.type).
 * GET/PUT /api/categories/fields — сфера (category_abstract) поверх категории пользователя.
 * GET/POST /api/categories/areas — сферы (category_abstract) как самостоятельный список: все
 * существующие имена + создание новой БЕЗ привязки к конкретной категории (в отличие от
 * PUT /fields/:category, которая заводит сферу «попутно», find-or-create по имени).
 * GET/PUT /api/categories/limits — план на месяц (user_categories.month_limit_kopecks),
 * колонка «План» и «% от плана» в матрице MonthOverview.
 */
export async function categoryRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.get('/api/categories', async (request) => {
        const query = parseOr400(categoriesQuerySchema, request.query);
        return await Promise.resolve(listUserCategories(fastify.db, query.scope !== 'user'));
    });

    fastify.post('/api/categories', async (request, reply) => {
        const { name } = parseOr400(userCategoryInputSchema, request.body);
        const dto = createUserCategory(fastify.db, name);
        return await reply.code(201).send(dto);
    });

    fastify.delete('/api/categories/:category', async (request, reply) => {
        const { category } = parseOr400(categoryParamSchema, request.params);
        deleteUserCategory(fastify.db, category);
        return await reply.code(204).send();
    });

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

    fastify.get('/api/categories/kinds', async () => {
        return await Promise.resolve(listCategoryKinds(fastify.db));
    });

    fastify.put('/api/categories/kinds/:category', async (request) => {
        const { category } = parseOr400(categoryParamSchema, request.params);
        const { kind } = parseOr400(categoryKindInputSchema, request.body);
        setCategoryKind(fastify.db, category, kind);
        return await Promise.resolve({ category, kind });
    });

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

    fastify.get('/api/categories/limits', async () => {
        return await Promise.resolve(listCategoryLimits(fastify.db));
    });

    fastify.put('/api/categories/limits/:category', async (request) => {
        const { category } = parseOr400(categoryParamSchema, request.params);
        const { monthLimitKopecks } = parseOr400(categoryLimitInputSchema, request.body);
        setCategoryLimit(fastify.db, category, monthLimitKopecks);
        return await Promise.resolve({ category, monthLimitKopecks });
    });
}
