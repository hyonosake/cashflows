import type { FastifyInstance } from 'fastify';
import { parseOr400 } from '../http.js';
import {
    categoriesQuerySchema,
    categoryKindInputSchema,
    categoryLimitInputSchema,
    categoryParamSchema,
    userCategoryInputSchema,
} from './schemas.js';
import {
    createUserCategory,
    deleteUserCategory,
    listCategoryKinds,
    listCategoryLimits,
    listUserCategories,
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
 * GET/PUT /api/categories/kinds — тег постоянная/переменная/резерв (user_categories.type).
 * GET/PUT /api/categories/limits — план на месяц (user_categories.month_limit_kopecks),
 * колонка «План» и «% от плана» в матрице MonthOverview.
 *
 * Маппинги (mcc-mappings/custom-mappings) — routes/categoryMappings.ts;
 * сферы (fields/areas) — routes/categoryAreas.ts.
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

    fastify.get('/api/categories/kinds', async () => {
        return await Promise.resolve(listCategoryKinds(fastify.db));
    });

    fastify.put('/api/categories/kinds/:category', async (request) => {
        const { category } = parseOr400(categoryParamSchema, request.params);
        const { kind } = parseOr400(categoryKindInputSchema, request.body);
        setCategoryKind(fastify.db, category, kind);
        return await Promise.resolve({ category, kind });
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
