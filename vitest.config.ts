import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Конфигурация тестов (Этап R2) — ОТДЕЛЬНЫЙ файл от vite.config.ts:
 * - vitest сам предпочитает vitest.config.ts, поэтому `npm run test` использует его;
 * - vite dev/build читают только vite.config.ts → прод-сборка не затронута;
 * - окружение jsdom для @testing-library/react;
 * - глобали НЕ включаем (globals: false): тесты импортируют describe/it/expect
 *   из 'vitest' явно — существующий `tsc -p web/tsconfig.json --noEmit` остаётся
 *   чистым без правки types (AGENTS.md: не ломать typecheck).
 * Сеть не используется: api.ts в тестах мокается через vi.stubGlobal('fetch') /
 * vi.mock — сервер :3000 не трогается.
 */
export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: false,
        setupFiles: ['./web/src/test/setup.ts'],
        include: ['web/src/**/*.test.{ts,tsx}'],
        css: false,
    },
});
