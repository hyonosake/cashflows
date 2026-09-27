import { useCallback, useState } from 'react';
import type { ImportResultDto } from '../../shared/types';
import { DashboardPage } from './pages/Dashboard';
import { OperationsPage } from './pages/Operations';
import { SettingsPage } from './pages/Settings';
import { DebugPage } from './pages/Debug';
import { useActiveTab } from './hooks/useActiveTab';
import { useTheme } from './hooks/useTheme';

/**
 * Корневой компонент SPA: навигация табами через локальный state,
 * без роутера и стейт-менеджера. Активная вкладка — useActiveTab (localStorage), чтобы
 * обновление страницы (F5) не сбрасывало пользователя на «Дашборд». `version` — счётчик
 * изменений данных: импорт и CRUD бюджетов/планов увеличивают его, страницы перезагружают
 * данные.
 */

export type TabName = 'dashboard' | 'operations' | 'settings' | 'debug';

const TABS: Array<{ id: TabName; label: string }> = [
    { id: 'dashboard', label: 'Дашборд' },
    { id: 'operations', label: 'Операции' },
    { id: 'settings', label: 'Настройки' },
    { id: 'debug', label: 'Debug' },
];

export function App(): JSX.Element {
    const { theme, toggleTheme } = useTheme();
    const [tab, setTab] = useActiveTab();
    const [version, setVersion] = useState(0);
    const [lastImport, setLastImport] = useState<ImportResultDto | null>(null);

    const refreshData = useCallback(() => setVersion((v) => v + 1), []);

    const handleImported = useCallback((result: ImportResultDto) => {
        setLastImport(result);
        setVersion((v) => v + 1); // дашборд обновится сразу после успешного импорта
    }, []);

    return (
        <div className="app">
            <header className="app-header">
                <div className="app-title">
                    <span className="app-logo">₽</span>
                    <h1>Cashflows</h1>
                </div>
                <div className="app-header-right">
                    <nav className="tabs">
                        {TABS.map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                className={`tab${tab === t.id ? ' tab-active' : ''}`}
                                onClick={() => setTab(t.id)}
                            >
                                {t.label}
                            </button>
                        ))}
                    </nav>
                    <button
                        type="button"
                        className="theme-toggle"
                        onClick={toggleTheme}
                        aria-label="Переключить тему"
                        title={theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему'}
                    >
                        {theme === 'light' ? '🌙' : '☀️'}
                    </button>
                </div>
            </header>
            <main className="app-main">
                {tab === 'dashboard' && (
                    <DashboardPage version={version} lastImport={lastImport} onDataChanged={refreshData} />
                )}
                {tab === 'operations' && <OperationsPage version={version} onDataChanged={refreshData} />}
                {tab === 'settings' && (
                    <SettingsPage
                        version={version}
                        lastImport={lastImport}
                        onImported={handleImported}
                        onDataChanged={refreshData}
                    />
                )}
                {tab === 'debug' && <DebugPage version={version} />}
            </main>
            <footer className="app-footer">
                Недели Пн–Вс по Москве · деньги в копейках · единый API на :3000
            </footer>
        </div>
    );
}
