import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { buildFastify } from './app.js';

/**
 * Bootstrap: конфиг → БД → Fastify → listen :3000.
 */
async function main(): Promise<void> {
    const config = loadConfig();
    const db = openDb(config.dbFile);
    const app = await buildFastify(db, config);

    let shuttingDown = false;
    const shutdown = async (signal: string): Promise<void> => {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;
        app.log.info(`Получен ${signal}, останавливаю сервер`);
        await app.close();
        db.close();
        process.exit(0);
    };
    process.on('SIGINT', () => {
        void shutdown('SIGINT');
    });
    process.on('SIGTERM', () => {
        void shutdown('SIGTERM');
    });

    try {
        await app.listen({ port: config.port, host: '127.0.0.1' });
    } catch (error) {
        app.log.error(error);
        process.exit(1);
    }
}

void main();
