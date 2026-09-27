import { openDb, type Db } from '../db.js';

/**
 * In-memory БД для тестов домена: та же схема/VIEW, что и в проде (openDb), плюс служебная
 * «Без категории» — в реальной БД она создаётся один раз вручную (см. AGENTS.md, «известные
 * ограничения») и предполагается существующей везде; здесь сеется явно, иначе
 * operations_effective.effective_user_category_id уходил бы в NULL для операций без правила.
 */
export function openTestDb(): Db {
    const db = openDb(':memory:');
    db.prepare('INSERT INTO user_categories (name, created_at) VALUES (?, ?)').run('Без категории', new Date().toISOString());
    return db;
}
