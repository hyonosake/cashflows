import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Vite-конфиг веб-приложения (ARCHITECTURE.md §9).
 * Корень — web/, прод-сборка — web/dist (раздаётся сервером через @fastify/static),
 * dev-прокси /api → http://localhost:3000 (CORS не нужен: dev — через прокси,
 * прод — единый origin).
 */
export default defineConfig({
    root: 'web',
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        // Вынос вендоров в отдельные чанки: код приложения (~40 kB) кешируется
        // независимо от крупных стабильных библиотек (react, recharts),
        // и чанки укладываются в лимит 500 kB без warning.
        rollupOptions: {
            output: {
                manualChunks(id: string) {
                    if (!id.includes('node_modules')) return undefined;
                    if (
                        /[\\/]node_modules[\\/](recharts|d3-|victory-vendor|react-smooth|recompose|internmap|decimal\.js-light|fast-equals)/.test(
                            id,
                        )
                    ) {
                        return 'charts';
                    }
                    return 'vendor';
                },
            },
        },
    },
});
