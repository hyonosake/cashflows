import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DashboardDto, GoalDto } from '../../../shared/types';
import { GoalList } from './GoalList';

// getByText нормализует whitespace DOM-узлов (NBSP → обычный пробел), но не строку
// запроса — поэтому здесь обычный пробел вместо NBSP (см. SummaryCards.test.tsx).

/**
 * Финансовые цели (dashboard.goals) — минимальный вид без автопрогресса: пустой список →
 * CTA в «Настройки», иначе имя + сумма для каждой цели.
 */

function makeDashboard(goals: GoalDto[]): DashboardDto {
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
        expenseByKind: { fixedKopecks: 0, variableKopecks: 0, reserveKopecks: 0, unclassifiedKopecks: 0 },
        goals,
    };
}

afterEach(cleanup);

describe('GoalList', () => {
    it('пустой список → CTA в «Настройки»', () => {
        render(<GoalList dashboard={makeDashboard([])} />);
        expect(screen.getByText('Целей пока нет. Создайте их в «Настройках».')).toBeInTheDocument();
    });

    it('рендерит имя и сумму цели', () => {
        render(<GoalList dashboard={makeDashboard([{ id: 1, name: 'Финансовая подушка', amountKopecks: 100_000_000 }])} />);
        expect(screen.getByText('Финансовая подушка')).toBeInTheDocument();
        expect(screen.getByText('1 000 000,00 ₽')).toBeInTheDocument();
    });

    it('рендерит несколько целей', () => {
        render(
            <GoalList
                dashboard={makeDashboard([
                    { id: 1, name: 'Финансовая подушка', amountKopecks: 100_000_000 },
                    { id: 2, name: 'Шкаф в прихожую', amountKopecks: 20_000_000 },
                ])}
            />,
        );
        expect(screen.getByText('Финансовая подушка')).toBeInTheDocument();
        expect(screen.getByText('Шкаф в прихожую')).toBeInTheDocument();
    });
});
