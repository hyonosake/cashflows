import type { FastifyInstance } from 'fastify';
import type { DebugTablesDto } from '../../../shared/types.js';

const ROW_LIMIT = 10;

/**
 * GET /api/debug/tables — служебный дамп схемы: для каждой таблицы БД — общее число
 * строк + первые ROW_LIMIT «как есть» (сверять данные глазами, без sqlite3 CLI). Имена
 * таблиц берутся из sqlite_master, не от пользователя — интерполяция в SQL безопасна.
 */
export async function debugRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.get('/api/debug/tables', async (): Promise<DebugTablesDto> => {
        const db = fastify.db;
        const tableNames = db
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
            .all() as Array<{ name: string }>;

        const tables = tableNames.map(({ name }) => {
            const totalRows = (db.prepare(`SELECT COUNT(*) AS c FROM "${name}"`).get() as { c: number }).c;
            const rows = db.prepare(`SELECT * FROM "${name}" LIMIT ${ROW_LIMIT}`).all() as Array<Record<string, unknown>>;
            return { name, totalRows, rows };
        });

        return await Promise.resolve({ tables });
    });
}
