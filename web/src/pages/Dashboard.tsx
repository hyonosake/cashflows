import { useState } from 'react';
import type { ImportResultDto } from '../../../shared/types';
import { CategoryBreakdown } from '../components/CategoryBreakdown';
import { ExpenseKindSummary } from '../components/ExpenseKindSummary';
import { GoalList } from '../components/GoalList';
import { ImportPanel } from '../components/ImportPanel';
import { ImportStats } from '../components/ImportStats';
import { MonthOverview } from '../components/MonthOverview';
import { SummaryCards } from '../components/SummaryCards';
import { WeekSwitcher } from '../components/WeekSwitcher';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Spinner } from '../components/ui/Spinner';
import { formatMoney } from '../format';
import { useDashboard } from '../hooks/useDashboard';

/**
 * Главная страница: WeekSwitcher + KPI + графики + обзор месяца +
 * цели + последний импорт. Данные — useDashboard(offset, version) с AbortController
 * (race при быстрой смене недель исключён).
 */

interface Props {
    version: number; // растёт после импорта/CRUD → перезагрузка данных
    lastImport: ImportResultDto | null;
    onDataChanged: () => void;
}

export function DashboardPage({ version, lastImport, onDataChanged }: Props): JSX.Element {
    const [offset, setOffset] = useState(0);

    const dashboardQuery = useDashboard(offset, version);
    const dashboard = dashboardQuery.data;

    return (
        <div>
            <div className="panel">
                <div className="panel-head">
                    <WeekSwitcher offset={offset} onChange={setOffset} />
                    {dashboard !== null && (
                        <span className="income-compact">
                            Доход за период: {formatMoney(dashboard.totals.incomeKopecks)}
                        </span>
                    )}
                </div>
                {dashboardQuery.error !== null && <ErrorBanner message={dashboardQuery.error} />}
                {dashboard === null && dashboardQuery.loading && dashboardQuery.error === null && (
                    <div className="state-box">
                        <Spinner />
                        <span>Загрузка дашборда…</span>
                    </div>
                )}
                {dashboard !== null && <SummaryCards dashboard={dashboard} />}
            </div>

            {dashboard !== null && (
                <>
                    <MonthOverview dashboard={dashboard} version={version} onDataChanged={onDataChanged} />

                    <div className="grid-2">
                        <div className="panel">
                            <h2>Расходы по категориям</h2>
                            <CategoryBreakdown dashboard={dashboard} />
                        </div>
                        <ExpenseKindSummary dashboard={dashboard} />
                    </div>

                    <GoalList dashboard={dashboard} />

                    <ImportPanel onImported={onDataChanged} />

                    <div className="panel">
                        <h2>Последний импорт</h2>
                        {lastImport === null ? (
                            <p className="empty">
                                В этой сессии импорт ещё не выполнялся. CSV можно загрузить в блоке
                                «Импорт CSV» выше или на вкладке «Настройки».
                            </p>
                        ) : (
                            <ImportStats result={lastImport} />
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
