import { useCallback, useEffect, useState } from 'react';

/**
 * Тема интерфейса: светлая по умолчанию, переключается кнопкой в шапке (App.tsx)
 * и сохраняется в localStorage. Тёмная тема — атрибут data-theme="dark" на <html>
 * (styles.css: :root[data-theme='dark']); index.html выставляет его синхронно до
 * первой отрисовки, чтобы избежать мигания светлой темой при загрузке.
 */

const STORAGE_KEY = 'cashflows-theme';

export type Theme = 'light' | 'dark';

function readInitialTheme(): Theme {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'light' || stored === 'dark') return stored;
    } catch {
        // localStorage недоступен (приватный режим и т.п.) — светлая тема по умолчанию
    }
    return 'light';
}

export function useTheme(): { theme: Theme; toggleTheme: () => void } {
    const [theme, setTheme] = useState<Theme>(readInitialTheme);

    useEffect(() => {
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch {
            // тема просто не сохранится между сессиями — не критично
        }
    }, [theme]);

    const toggleTheme = useCallback(() => {
        setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
    }, []);

    return { theme, toggleTheme };
}
