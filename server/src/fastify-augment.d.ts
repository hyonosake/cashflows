import type { Db } from './db.js';
import type { Config } from './config.js';

/**
 * Module augmentation: экземпляр Fastify получает декорации db/config.
 */
declare module 'fastify' {
    interface FastifyInstance {
        db: Db;
        config: Config;
    }
}
