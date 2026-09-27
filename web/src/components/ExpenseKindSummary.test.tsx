import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DashboardDto } from '../../../shared/types';
import { ExpenseKindSummary } from './ExpenseKindSummary';

/**
 * Разбивка расходов на постоянные/переменные/не размечено (dashboard.expenseByKind):
 * суммы/доли в легенде, подсказка про разметку только при unclassified > 0,
 * пустой период → «В этом периоде расходов нет.».
 */

function makeDashboard(expenseByKind: DashboardDto['expenseByKind']): DashboardDto {
    return {
        period: { from: '2026-09-21', to: '2026-09-27', type: 'week' },
        totals: { incomeKopecks: 0, expenseKopecks: 0, operationsCount: 0 },
        prevTotals: { incomeKopecks: 0, expenseKopecks: 0, operationsCount: 0 },
        change: { incomeDeltaKopecks: 0, incomePct: null, expenseDeltaKopecks: 0, expensePct: null },
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
        expenseByKind,
        goals: [],
    };
}

afterEach(cleanup);

describe('ExpenseKindSummary', () => {
    it('суммы и доли постоянных/переменных/не размеченных расходов', () => {
        render(
            <ExpenseKindSummary
                dashboard={makeDashboard({ fixedKopecks: 60_000, variableKopecks: 30_000, reserveKopecks: 0, unclassifiedKopecks: 10_000 })}
            />,
        );
        expect(screen.getByText('Постоянные')).toBeInTheDocument();
        expect(screen.getByText('600,00 ₽ · 60 %')).toBeInTheDocument();
        expect(screen.getByText('Переменные')).toBeInTheDocument();
        expect(screen.getByText('300,00 ₽ · 30 %')).toBeInTheDocument();
        expect(screen.getByText('Не размечено')).toBeInTheDocument();
        expect(screen.getByText('100,00 ₽ · 10 %')).toBeInTheDocument();
    });

    it('подсказка про разметку категорий показывается, только если есть не размеченные расходы', () => {
        render(
            <ExpenseKindSummary
                dashboard={makeDashboard({ fixedKopecks: 100_000, variableKopecks: 0, reserveKopecks: 0, unclassifiedKopecks: 0 })}
            />,
        );
        expect(screen.queryByText(/не размечена/)).not.toBeInTheDocument();
        expect(screen.queryByText('Переменные')).not.toBeInTheDocument(); // нулевые сегменты не рендерятся
    });

    it('расходов в периоде нет → пустое состояние', () => {
        render(
            <ExpenseKindSummary
                dashboard={makeDashboard({ fixedKopecks: 0, variableKopecks: 0, reserveKopecks: 0, unclassifiedKopecks: 0 })}
            />,
        );
        expect(screen.getByText('В этом периоде расходов нет.')).toBeInTheDocument();
    });
});
