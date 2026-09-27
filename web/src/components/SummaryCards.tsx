import type { DashboardDto } from '../../../shared/types';
import { formatMoneyWhole, formatSignedPercent, pluralizeRu } from '../format';

/**
 * KPI-карточка: Расходы недели с дельтой к прошлой неделе (change из API, стрелки
 * ▲/▼, зелёный/красный). Доход фиксирован из месяца в месяц — отдельной карточки
 * не заслуживает, показывается компактной строкой рядом с WeekSwitcher (Dashboard.tsx,
 * класс income-compact). Баланс недели (доход недели минус расход недели) убран —
 * при зарплате раз в 1-2 недели реальный доход почти в каждой неделе околонулевой,
 * так что «баланс» получался пугающе отрицательным не из-за перерасхода, а просто
 * потому что зарплата в эту неделю не попала; месячный план/факт/баланс — в
 * «Обзоре месяца» (MonthOverview → MonthBudgetSummary), где это осмысленно.
 */

interface Props {
    dashboard: DashboardDto;
}

function DeltaBadge({ pct, higherIsBetter }: { pct: number | null; higherIsBetter: boolean }): JSX.Element | null {
    if (pct === null) {
        return <span className="kpi-delta kpi-delta-flat">нет данных за прошлую неделю</span>;
    }
    const rounded = Math.round(pct * 10) / 10;
    if (rounded === 0) {
        return <span className="kpi-delta kpi-delta-flat">без изменений</span>;
    }
    const up = rounded > 0;
    const good = higherIsBetter ? up : !up;
    return (
        <span className={`kpi-delta ${good ? 'kpi-delta-up' : 'kpi-delta-down'}`}>
            {up ? '▲' : '▼'} {formatSignedPercent(pct)}
        </span>
    );
}

export function SummaryCards({ dashboard }: Props): JSX.Element {
    const { totals, change } = dashboard;

    return (
        <div className="kpi-row">
            <div className="kpi">
                <div className="kpi-label">Расходы</div>
                <div className="kpi-value kpi-value-expense">{formatMoneyWhole(totals.expenseKopecks)}</div>
                <div className="kpi-sub">
                    {totals.operationsCount}{' '}
                    {pluralizeRu(totals.operationsCount, ['операция', 'операции', 'операций'])} в аналитике
                </div>
                <DeltaBadge pct={change.expensePct} higherIsBetter={false} />
            </div>
        </div>
    );
}
