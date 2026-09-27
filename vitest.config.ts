import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Конфигурация тестов (Этап R2) — ОТДЕЛЬНЫЙ файл от vite.config.ts:
 * - vitest сам предпочитает vitest.config.ts, поэтому `npm run test` использует его;
 * - vite dev/build читают только vite.config.ts → прод-сборка не затронута;
 * - два test.projects: "web" (jsdom + @testing-library/react, setupFiles с jest-dom/RTL
 *   cleanup) и "server" (node — better-sqlite3 нативный модуль, DOM тут не нужен и
 *   мешал бы; тесты домена гоняют in-memory SQLite, testDb.ts → openDb(':memory:'));
 * - глобали НЕ включаем (globals: false): тесты импортируют describe/it/expect
 *   из 'vitest' явно — существующий `tsc -p web/tsconfig.json --noEmit`/
 *   `tsc -p server/tsconfig.json --noEmit` остаётся чистым без правки types.
 * Сеть не используется нигде: api.ts в веб-тестах мокается через vi.stubGlobal('fetch') /
 * vi.mock, домен-тесты бэкенда — in-memory SQLite; сервер :3000 не трогается.
 */
export default defineConfig({
    test: {
        projects: [
            {
                plugins: [react()],
                test: {
                    name: 'web',
                    environment: 'jsdom',
                    globals: false,
                    setupFiles: ['./web/src/test/setup.ts'],
                    include: ['web/src/**/*.test.{ts,tsx}'],
                    css: false,
                },
            },
            {
                test: {
                    name: 'server',
                    environment: 'node',
                    globals: false,
                    include: ['server/src/**/*.test.ts'],
                },
            },
        ],
    },
});
