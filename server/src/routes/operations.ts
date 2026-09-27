import type { FastifyInstance } from 'fastify';
import { badRequest, notFound, parseOr400 } from '../http.js';
import { idParamSchema, operationCategoryInputSchema, operationsQuerySchema } from './schemas.js';
import type { OperationDto, OperationsResponse } from '../../../shared/types.js';

/**
 * GET /api/operations — список операций с фильтрами и пагинацией (ARCHITECTURE.md §7.2).
 * analyticsOnly=true (по умолчанию): только status='Ок' AND include_in_analytics=1.
 * Категория — ВСЕГДА через operations_effective (живой JOIN), не «запечённая» колонка.
 */

interface OperationRow {
    id: number;
    datetime_iso: string;
    local_date: string;
    amount_kopecks: number;
    type: string;
    account: string;
    card: string | null;
    currency: string;
    status: string;
    category_default: string;
    category: string;
    mcc: string | null;
    description: string;
    message: string;
    bonuses_kopecks: number;
    include_in_analytics: number;
    source_file: string;
}

function toDto(row: OperationRow): OperationDto {
    return {
        id: row.id,
        datetimeIso: row.datetime_iso,
        localDate: row.local_date,
        amountKopecks: row.amount_kopecks,
        type: row.type as 'income' | 'expense',
        account: row.account,
        card: row.card,
        currency: row.currency,
        status: row.status,
        categoryDefault: row.category_default,
        category: row.category,
        mcc: row.mcc,
        description: row.description,
        message: row.message,
        bonusesKopecks: row.bonuses_kopecks,
        includeInAnalytics: row.include_in_analytics === 1,
        sourceFile: row.source_file,
    };
}

const SELECT_COLUMNS = `
  oe.id, oe.datetime_iso, oe.local_date, oe.amount_kopecks, oe.type, oe.account, oe.card,
  oe.currency, oe.status, oe.category_default, COALESCE(uc.name, 'Без категории') AS category,
  oe.mcc, oe.description, oe.message, oe.bonuses_kopecks, oe.include_in_analytics, oe.source_file
`;
const FROM_CLAUSE = 'FROM operations_effective oe LEFT JOIN user_categories uc ON uc.id = oe.effective_user_category_id';

export async function operationsRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.get('/api/operations', async (request, reply): Promise<OperationsResponse> => {
        const query = parseOr400(operationsQuerySchema, request.query);
        const analyticsOnly = query.analyticsOnly ?? true;
        const page = query.page ?? 1;
        const limit = query.limit ?? 50;
        const offset = (page - 1) * limit;

        const conditions: string[] = [];
        const params: Array<string | number> = [];
        if (analyticsOnly) {
            conditions.push("oe.status = 'Ок'", 'oe.include_in_analytics = 1');
        }
        if (query.from !== undefined) {
            conditions.push('oe.local_date >= ?');
            params.push(query.from);
        }
        if (query.to !== undefined) {
            conditions.push('oe.local_date <= ?');
            params.push(query.to);
        }
        if (query.category !== undefined) {
            conditions.push('COALESCE(uc.name, ?) = ?');
            params.push('Без категории', query.category);
        }
        if (query.categories !== undefined) {
            const list = query.categories
                .split(',')
                .map((c) => c.trim())
                .filter((c) => c !== '');
            if (list.length > 0) {
                conditions.push(`COALESCE(uc.name, 'Без категории') IN (${list.map(() => '?').join(', ')})`);
                params.push(...list);
            }
        }
        if (query.type !== undefined) {
            conditions.push('oe.type = ?');
            params.push(query.type);
        }
        if (query.q !== undefined) {
            conditions.push('(oe.description LIKE ? OR oe.account LIKE ?)');
            const pattern = `%${query.q}%`;
            params.push(pattern, pattern);
        }
        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const totalRow = fastify.db
            .prepare<unknown[], { total: number }>(`SELECT COUNT(*) AS total ${FROM_CLAUSE} ${where}`)
            .get(...params);
        const listParams: unknown[] = [...params, limit, offset];
        const items = fastify.db
            .prepare<unknown[], OperationRow>(
                `SELECT ${SELECT_COLUMNS} ${FROM_CLAUSE} ${where} ORDER BY oe.datetime_iso DESC, oe.id DESC LIMIT ? OFFSET ?`,
            )
            .all(...listParams);

        return await reply.code(200).send({
            items: items.map(toDto),
            total: totalRow?.total ?? 0,
            page,
            limit,
        });
    });

    // Ручная категория ТОЛЬКО для одной операции — разовый override (user_category_override_id),
    // должен совпадать с существующей user_categories.name (строгий список, импорт/правки его
    // не расширяют «на лету»).
    fastify.put('/api/operations/:id/category', async (request, reply) => {
        const { id } = parseOr400(idParamSchema, request.params);
        const input = parseOr400(operationCategoryInputSchema, request.body);
        const userCategory = fastify.db
            .prepare<[string], { id: number }>('SELECT id FROM user_categories WHERE name = ?')
            .get(input.categoryUser);
        if (userCategory === undefined) {
            throw badRequest(`Неизвестная категория "${input.categoryUser}"`);
        }
        const result = fastify.db
            .prepare('UPDATE operations SET user_category_override_id = ? WHERE id = ?')
            .run(userCategory.id, id);
        if (result.changes === 0) {
            throw notFound(`Операция с id=${id} не найдена`);
        }
        const row = fastify.db.prepare<[number], OperationRow>(`SELECT ${SELECT_COLUMNS} ${FROM_CLAUSE} WHERE oe.id = ?`).get(id);
        if (row === undefined) {
            throw notFound(`Операция с id=${id} не найдена`);
        }
        return await reply.code(200).send(toDto(row));
    });
}
