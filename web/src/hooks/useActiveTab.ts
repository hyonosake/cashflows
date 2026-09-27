import { useEffect, useState } from 'react';
import type { TabName } from '../App';

/**
 * Активная вкладка (App.tsx): сохраняется в localStorage, чтобы обновление страницы (F5)
 * открывало ту же вкладку, а не всегда «Дашборд» — тот же паттерн, что useTheme.
 */

const STORAGE_KEY = 'cashflows-active-tab';
const VALID_TABS: TabName[] = ['dashboard', 'operations', 'settings', 'debug'];

function readInitialTab(): TabName {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (VALID_TABS.includes(stored as TabName)) return stored as TabName;
    } catch {
        // localStorage недоступен (приватный режим и т.п.) — открываем «Дашборд» по умолчанию
    }
    return 'dashboard';
}

export function useActiveTab(): [TabName, (tab: TabName) => void] {
    const [tab, setTab] = useState<TabName>(readInitialTab);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, tab);
        } catch {
            // активная вкладка просто не сохранится между сессиями — не критично
        }
    }, [tab]);

    return [tab, setTab];
}
