/**
 * Глобальный setup для vitest (подключён в vitest.config.ts → setupFiles).
 * - матчитеры jest-dom (toBeInTheDocument и др.) для Vitest;
 * - явный RTL-cleanup: globals: false в vitest.config.ts → @testing-library/react
 *   не может сама зарегистрировать авто-cleanup через глобальный afterEach.
 * Файл лежит внутри web/src → попадает в web/tsconfig.json → module augmentation
 * типов jest-dom виден во всех тестах без правки tsconfig.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
    cleanup();
});
