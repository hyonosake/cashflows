import type { FastifyInstance } from 'fastify';
import { parseOr400 } from '../http.js';
import { merchantCategoryInputSchema } from './schemas.js';
import { listMerchants, setMerchantCategory } from '../domain/merchants.js';
import type { MerchantSummaryDto } from '../../../shared/types.js';

/**
 * GET /api/merchants — все мерчанты с суммой трат ЗА ВСЁ ВРЕМЯ и текущей категорией,
 * по убыванию суммы. PUT .../category — прямой FK merchants.user_category_id, живой
 * JOIN подхватывает изменение сразу, без пересчёта (domain/merchants.ts).
 */
export async function merchantRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.get('/api/merchants', async (): Promise<MerchantSummaryDto[]> => {
        return await Promise.resolve(listMerchants(fastify.db));
    });

    fastify.put('/api/merchants/category', async (request, reply) => {
        const input = parseOr400(merchantCategoryInputSchema, request.body);
        setMerchantCategory(fastify.db, input.merchant, input.targetCategory);
        return await reply.code(204).send();
    });
}
