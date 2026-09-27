import type { FastifyInstance } from 'fastify';
import '@fastify/multipart';
import { importCsvBuffer } from '../domain/import.js';
import { badRequest } from '../http.js';

/**
 * POST /api/import — multipart с полем `file` (CSV) (ARCHITECTURE.md §7.2).
 * Ошибка всего файла (битый/пустой CSV, нет заголовков) → 400 с внятным JSON.
 * Построчные ошибки → 200 с errors[] (импорт продолжается).
 */
export async function importRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.post('/api/import', async (request, reply) => {
        if (!request.isMultipart()) {
            throw badRequest('Ожидается multipart/form-data с полем file (CSV-файл)');
        }
        const file = await request.file({
            limits: {
                fileSize: 20 * 1024 * 1024, // 20 МБ — достаточно для месячных выгрузок
                files: 1,
            },
        });
        if (file === undefined) {
            throw badRequest("Не найдено файловое поле 'file' в multipart-запросе");
        }
        try {
            const buffer = await file.toBuffer();
            const sourceFile = file.filename.length > 0 ? file.filename : 'upload.csv';
            const result = importCsvBuffer(fastify.db, buffer, sourceFile);
            return await reply.code(200).send(result);
        } catch (error) {
            if (error instanceof Error && error.name === 'CsvFileError') {
                throw badRequest(`CSV-файл не соответствует формату: ${error.message}`);
            }
            throw error;
        }
    });
}
