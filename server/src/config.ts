import path from 'node:path';

/**
 * Конфигурация сервера: process.env с дефолтами.
 * dotenv не используется — все значения имеют локальные дефолты.
 */

function toInt(value: string | undefined, fallback: number): number {
    const n = value === undefined ? NaN : Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
}

export interface Config {
    port: number;
    dataDir: string;
    dbFile: string;
    webDist: string;
    version: string;
}

export function loadConfig(cwd: string = process.cwd()): Config {
    const dataDir = process.env.DATA_DIR ?? path.resolve(cwd, 'data');
    const dbFile = process.env.DB_FILE ?? path.join(dataDir, 'cashflows.sqlite');
    const webDist = process.env.WEB_DIST ?? path.resolve(cwd, 'web/dist');
    return {
        port: toInt(process.env.PORT, 3000),
        dataDir,
        dbFile,
        webDist,
        version: '0.1.0',
    };
}
