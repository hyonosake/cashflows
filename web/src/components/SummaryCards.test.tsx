import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DashboardDto } from '../../../shared/types';
import { SummaryCards } from './SummaryCards';

/**
 * KPI-карточка из DashboardDto-фикстуры: деньги форматируются из копеек, дельта —
 * стрелки ▲/▼ с классом good/bad (для расходов «меньше — хорошо»), при prev = 0 →
 * «нет данных за прошлую неделю». Доход и Баланс недели в SummaryCards больше не
 * отображаются: доход свёрнут в income-compact на Dashboard.tsx, а Баланс недели убран
 * совсем — при зарплате раз в 1-2 недели реальный доход почти в каждой неделе
 * околонулевой, так что «баланс» получался пугающе отрицательным не из-за
 * перерасхода, а просто потому что зарплата в эту неделю не попала (план/факт/баланс
 * месяца — в «Обзоре месяца», MonthOverview → MonthBudgetSummary). Остаётся только
 * карточка «Расходы».
 *
 * Важно: getByText нормализует whitespace DOM-узлов (NBSP → обычный пробел),
 * но не строку запроса, поэтому в запросах — обычный пробел вместо NBSP.
 * Точный вывод formatMoney (именно NBSP U+00A0 как разделитель тысяч и
 * типографский минус U+2212) зафиксирован в unit-тестах format.test.ts.
 */

const MINUS = '−';

/** Минимально валидный DashboardDto с управляемыми суммами. */
function makeDashboard(overrides: {
    totals?: Partial<DashboardDto['totals']>;
    change?: Partial<DashboardDto['change']>;
}): DashboardDto {
    return {
        period: { from: '2026-09-21', to: '2026-09-27', type: 'week' },
        totals: { incomeKopecks: 100_000, expenseKopecks: 40_000, operationsCount: 12, ...overrides.totals },
        prevTotals: { incomeKopecks: 50_000, expenseKopecks: 50_000, operationsCount: 10 },
        change: {
            incomeDeltaKopecks: 50_000,
            incomePct: 100,
            expenseDeltaKopecks: -10_000,
            expensePct: -20,
            ...overrides.change,
        },
        byCategory: [],
        monthOverview: {
            month: { from: '2026-09-01', to: '2026-09-30', key: '2026-09' },
            weeks: [],
            categories: [],
            salaryDays: [],
            nextSalaryDate: null,
            daysUntilSalary: null,
            plannedIncomeKopecks: null,
            expenseKopecks: 0,
            balanceKopecks: null,
            owedToUserKopecks: null,
        },
        expenseByKind: { fixedKopecks: 0, variableKopecks: 0, reserveKopecks: 0, unclassifiedKopecks: 0 },
        goals: [],
    };
}

afterEach(cleanup);

describe('SummaryCards: суммы', () => {
    it('расходы — целые рубли, без копеек', () => {
        render(<SummaryCards dashboard={makeDashboard({})} />);
        expect(screen.getByText('400 ₽')).toBeInTheDocument();
        expect(screen.getByText('12 операций в аналитике')).toBeInTheDocument();
    });

    it('не показывает карточку «Баланс»', () => {
        render(<SummaryCards dashboard={makeDashboard({})} />);
        expect(screen.queryByText('Баланс')).not.toBeInTheDocument();
    });
});

describe('SummaryCards: дельты', () => {
    it('расходы выросли: ▲, но это плохо → красный (higherIsBetter=false)', () => {
        render(<SummaryCards dashboard={makeDashboard({ change: { expensePct: 25 } })} />);
        const badge = screen.getByText('▲ +25 %');
        expect(badge.className).toContain('kpi-delta-down');
    });

    it('расходы снизились: ▼, но это хорошо → зелёный', () => {
        render(<SummaryCards dashboard={makeDashboard({ change: { expensePct: -20 } })} />);
        const badge = screen.getByText(`▼ ${MINUS}20 %`);
        expect(badge.className).toContain('kpi-delta-up');
    });

    it('дельта 0 → «без изменений» без стрелки', () => {
        render(<SummaryCards dashboard={makeDashboard({ change: { expensePct: 0 } })} />);
        expect(screen.getByText('без изменений')).toBeInTheDocument();
    });

    it('prev = 0 → «нет данных за прошлую неделю»', () => {
        render(<SummaryCards dashboard={makeDashboard({ change: { expensePct: null } })} />);
        expect(screen.getByText('нет данных за прошлую неделю')).toBeInTheDocument();
    });
});
