import type { FastifyInstance } from 'fastify';
import type { Db } from '../db.js';
import {
    getOwedToUserKopecks,
    getSalaryAmountKopecks,
    getSalaryDays,
    setOwedToUserKopecks,
    setSalaryAmountKopecks,
    setSalaryDays,
} from '../domain/settings.js';
import { parseOr400 } from '../http.js';
import { settingsInputSchema } from './schemas.js';
import type { SettingsDto } from '../../../shared/types.js';

/**
 * GET/PUT /api/settings — общие настройки приложения: `salaryDays` (дни зарплаты 1..31,
 * для «дней до ЗП» в обзоре месяца; массив — зарплата может приходить несколько раз в месяц),
 * `salaryAmountKopecks` (доход за ОДИН день зарплаты — план дохода месяца =
 * salaryAmountKopecks × salaryDays.length, используется для «Баланс» в обзоре месяца) и
 * `owedToUserKopecks` (займы — сколько должны пользователю другие люди, ручная справочная
 * цифра рядом с Доход/Расходы/Баланс, не из операций). Настроек одна на приложение —
 * не CRUD-список, PUT перезаписывает целиком.
 */
function readSettings(db: Db): SettingsDto {
    return {
        salaryDays: getSalaryDays(db),
        salaryAmountKopecks: getSalaryAmountKopecks(db),
        owedToUserKopecks: getOwedToUserKopecks(db),
    };
}

export async function settingsRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.get('/api/settings', async () => {
        return await Promise.resolve(readSettings(fastify.db));
    });

    fastify.put('/api/settings', async (request, reply) => {
        const input = parseOr400(settingsInputSchema, request.body);
        setSalaryDays(fastify.db, input.salaryDays);
        setSalaryAmountKopecks(fastify.db, input.salaryAmountKopecks);
        setOwedToUserKopecks(fastify.db, input.owedToUserKopecks);
        return await reply.code(200).send(readSettings(fastify.db));
    });
}
