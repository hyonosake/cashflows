import type { Db } from './db.js';
import type { Config } from './config.js';

/**
 * Module augmentation: экземпляр Fastify получает декорации db/config
 * (файл — минимальное дополнение к структуре ARCHITECTURE.md §4).
 */
declare module 'fastify' {
    interface FastifyInstance {
        db: Db;
        config: Config;
    }
}
