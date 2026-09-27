import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardDto, MonthOverviewDto, OperationDto, OperationsResponse } from '../../../shared/types';
import { MonthOverview } from './MonthOverview';
import { fetchCategories, fetchOperations } from '../api';

/**
 * Обзор месяца (dashboard.monthOverview): заголовок с названием месяца, дни до
 * зарплаты (или подсказка настроить её), матрица категория×неделя трат месяца
 * (План | Неделя 1..N | Потрачено | % от плана), сгруппированная по сфере (categoryAbstract)
 * с заголовком группы и строкой «Итого». Любая сумма — кнопка, открывающая
 * WeekOperationsDialog со списком операций (мокаем fetchOperations/fetchCategories — без
 * сети): недельные — за свою неделю (title="Показать операции"), «Потрачено» — за весь
 * месяц (title="Показать операции за месяц", overview.month.from..to). Разные title
 * нужны, чтобы различать кнопки в тестах — при спентах, совпадающих по значению
 * (например один месяц = одна неделя), запросы по тексту иначе были бы неоднозначны.
 */

vi.mock('../api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../api')>();
    return { ...actual, fetchOperations: vi.fn(), fetchCategories: vi.fn() };
});

const fetchOperationsMock = vi.mocked(fetchOperations);
const fetchCategoriesMock = vi.mocked(fetchCategories);

const ONE_WEEK: MonthOverviewDto['weeks'] = [{ index: 1, from: '2026-09-01', to: '2026-09-06' }];

function makeDashboard(overview: Partial<MonthOverviewDto>): DashboardDto {
    return {
        period: { from: '2026-09-21', to: '2026-09-27', type: 'week' },
        totals: { incomeKopecks: 0, expenseKopecks: 0, operationsCount: 0 },
        prevTotals: { incomeKopecks: 0, expenseKopecks: 0, operationsCount: 0 },
        change: { incomeDeltaKopecks: 0, incomePct: null, expenseDeltaKopecks: 0, expensePct: null },
        byCategory: [],
        monthOverview: {
            month: { from: '2026-09-01', to: '2026-09-30', key: '2026-09' },
            weeks: ONE_WEEK,
            categories: [],
            salaryDays: [],
            nextSalaryDate: null,
            daysUntilSalary: null,
            plannedIncomeKopecks: null,
            expenseKopecks: 0,
            balanceKopecks: null,
            owedToUserKopecks: null,
            ...overview,
        },
        expenseByKind: { fixedKopecks: 0, variableKopecks: 0, reserveKopecks: 0, unclassifiedKopecks: 0 },
        goals: [],
    };
}

function renderOverview(overview: Partial<MonthOverviewDto>, onDataChanged = vi.fn()): ReturnType<typeof render> {
    return render(<MonthOverview dashboard={makeDashboard(overview)} version={0} onDataChanged={onDataChanged} />);
}

beforeEach(() => {
    fetchOperationsMock.mockReset();
    fetchCategoriesMock.mockReset();
    fetchCategoriesMock.mockResolvedValue([]);
});

afterEach(cleanup);

describe('MonthOverview', () => {
    it('название месяца из monthKey', () => {
        renderOverview({});
        expect(screen.getByText(/Сентябрь 2026/)).toBeInTheDocument();
    });

    it('подсказка настроить день зарплаты, если она не задана', () => {
        renderOverview({});
        expect(screen.getByText(/День зарплаты не задан/)).toBeInTheDocument();
    });

    it('дни до зарплаты со склонением и датой', () => {
        renderOverview({ salaryDays: [5], nextSalaryDate: '2026-10-05', daysUntilSalary: 11 });
        expect(screen.getByText(/До зарплаты 11 дней · 05.10.2026/)).toBeInTheDocument();
    });

    it('без категорий пользователя — подсказка вместо таблицы', () => {
        renderOverview({});
        expect(screen.getByText(/Нет категорий пользователя/)).toBeInTheDocument();
    });

    it('план дохода не задан — подсказка вместо Доход/Расходы/Баланс', () => {
        renderOverview({});
        expect(screen.getByText(/Задайте доход за день зарплаты в «Настройках»/)).toBeInTheDocument();
    });

    it('план дохода/расходы/баланс месяца — целые рубли, доход это план по зарплате, не факт операций', () => {
        renderOverview({ plannedIncomeKopecks: 44_000_000, expenseKopecks: 12_345_601, balanceKopecks: 31_654_399 });
        expect(screen.getByText('Доход (план)')).toBeInTheDocument();
        expect(screen.getByText('440 000 ₽')).toBeInTheDocument();
        expect(screen.getByText('Расходы')).toBeInTheDocument();
        expect(screen.getByText('123 457 ₽')).toBeInTheDocument(); // 123 456,01 → вверх
        expect(screen.getByText('Баланс')).toBeInTheDocument();
        expect(screen.getByText('316 544 ₽')).toBeInTheDocument(); // 316 543,99 → вверх
    });

    it('займы — серая справочная карточка, показывается даже без плана дохода', () => {
        renderOverview({ owedToUserKopecks: 5_000_000 });
        expect(screen.queryByText(/Задайте доход за день зарплаты/)).not.toBeInTheDocument();
        expect(screen.getByText('Займы')).toBeInTheDocument();
        const value = screen.getByText('50 000 ₽');
        expect(value.className).toContain('kpi-value-muted');
        expect(screen.getByText('сколько должны нам')).toBeInTheDocument();
        // Доход не задан — трёх карточек плана нет, только «Займы».
        expect(screen.queryByText('Доход (план)')).not.toBeInTheDocument();
    });

    it('столбцы недель по числу weeks и заголовок «Неделя N»', () => {
        renderOverview({
            weeks: [
                { index: 1, from: '2026-09-01', to: '2026-09-06' },
                { index: 2, from: '2026-09-07', to: '2026-09-13' },
            ],
            categories: [
                {
                    name: 'Табак',
                    categoryAbstract: null,
                    limitKopecks: null,
                    weeklySpentKopecks: [300_000, 600_000],
                    spentKopecks: 900_000,
                },
            ],
        });
        expect(screen.getByText('Неделя 1')).toBeInTheDocument();
        expect(screen.getByText('Неделя 2')).toBeInTheDocument();
        expect(screen.getByText('3 000 ₽')).toBeInTheDocument();
        expect(screen.getByText('6 000 ₽')).toBeInTheDocument();
        // Итого за месяц по категории (9 000 ₽) в матрице не показывается отдельно —
        // только по неделям + план/статус.
        expect(screen.getByText('Табак')).toBeInTheDocument();
    });

    it('столбец «Потрачено» показывает сумму за месяц, а не отдельную неделю', () => {
        renderOverview({
            weeks: [
                { index: 1, from: '2026-09-01', to: '2026-09-06' },
                { index: 2, from: '2026-09-07', to: '2026-09-13' },
            ],
            categories: [
                {
                    name: 'Табак',
                    categoryAbstract: null,
                    limitKopecks: null,
                    weeklySpentKopecks: [300_000, 600_000],
                    spentKopecks: 900_000,
                },
            ],
        });
        expect(screen.getByText('Потрачено')).toBeInTheDocument();
        expect(screen.getByText('3 000 ₽')).toBeInTheDocument(); // неделя 1
        expect(screen.getByText('6 000 ₽')).toBeInTheDocument(); // неделя 2
        expect(screen.getByText('9 000 ₽')).toBeInTheDocument(); // «Потрачено» за месяц
    });

    it('клик по «Потрачено» открывает попап за весь месяц, а не за одну неделю', async () => {
        fetchOperationsMock.mockResolvedValueOnce({ items: [], total: 0, page: 1, limit: 200 });
        const user = userEvent.setup();
        renderOverview({
            categories: [
                { name: 'Табак', categoryAbstract: null, limitKopecks: null, weeklySpentKopecks: [300_000], spentKopecks: 300_000 },
            ],
        });

        await user.click(screen.getByTitle('Показать операции за месяц'));

        expect(fetchOperationsMock).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ categories: ['Табак'], from: '2026-09-01', to: '2026-09-30' }),
            expect.anything(),
        );
        expect(await screen.findByText('Табак · Весь месяц')).toBeInTheDocument();
    });

    it('план и % от плана; «—», если план не задан', () => {
        renderOverview({
            categories: [
                {
                    name: 'Продукты',
                    categoryAbstract: null,
                    limitKopecks: 1_000_000,
                    weeklySpentKopecks: [1_200_000],
                    spentKopecks: 1_200_000,
                },
                {
                    name: 'Табак',
                    categoryAbstract: null,
                    limitKopecks: null,
                    weeklySpentKopecks: [900_000],
                    spentKopecks: 900_000,
                },
            ],
        });
        expect(screen.getByText('10 000 ₽')).toBeInTheDocument(); // план «Продукты»
        expect(screen.getByText('120 %')).toBeInTheDocument(); // % от плана «Продукты»

        const tabakRow = screen.getByText('Табак').closest('tr') as HTMLElement;
        expect(tabakRow.textContent).toContain('—'); // план не задан → «—»
    });

    it('группирует категории по сфере с заголовком группы и строкой «Итого»', () => {
        renderOverview({
            categories: [
                {
                    name: 'Психолог Маши',
                    categoryAbstract: 'Психология и здоровье',
                    limitKopecks: null,
                    weeklySpentKopecks: [2_200_000],
                    spentKopecks: 2_200_000,
                },
                {
                    name: 'Психолог Лёхи',
                    categoryAbstract: 'Психология и здоровье',
                    limitKopecks: null,
                    weeklySpentKopecks: [1_606_800],
                    spentKopecks: 1_606_800,
                },
                {
                    name: 'Табак',
                    categoryAbstract: null,
                    limitKopecks: null,
                    weeklySpentKopecks: [900_000],
                    spentKopecks: 900_000,
                },
            ],
        });

        expect(screen.getByText('Психология и здоровье')).toBeInTheDocument();
        expect(screen.getByText('Итого')).toBeInTheDocument();
        // 22 000 + 16 068 = 38 068 ₽ (сумма недельных трат группы за единственную неделю —
        // при одной неделе в месяце совпадает и с недельной ячейкой, и со столбцом «Потрачено»).
        expect(screen.getAllByText('38 068 ₽')).toHaveLength(2);

        // У категории без сферы («Табак») своего заголовка группы/строки «Итого» нет.
        const tabakRow = screen.getByText('Табак').closest('tr') as HTMLElement;
        expect(tabakRow.className).not.toContain('month-overview-subtotal-row');
        const groupHeaders = document.querySelectorAll('.month-overview-group-header');
        expect([...groupHeaders].some((el) => el.textContent?.includes('Табак'))).toBe(false);
    });

    it('нулевая недельная сумма — тоже кнопка (кликабельна наравне с остальными), но приглушена', () => {
        renderOverview({
            categories: [
                { name: 'Табак', categoryAbstract: null, limitKopecks: null, weeklySpentKopecks: [0], spentKopecks: 0 },
            ],
        });
        // По названию '0 ₽' теперь два элемента (неделя + «Потрачено» за месяц, тоже 0) —
        // недельную ячейку отличает title, у месячной он другой.
        const cell = screen.getByTitle('Показать операции');
        expect(cell.tagName).toBe('BUTTON');
        expect(cell.textContent).toBe('0 ₽');
        expect(cell.className).toContain('month-overview-zero');
    });

    it('клик по нулевой сумме недели тоже открывает попап (пустой список — корректный ответ)', async () => {
        fetchOperationsMock.mockResolvedValueOnce({ items: [], total: 0, page: 1, limit: 200 });
        const user = userEvent.setup();
        renderOverview({
            categories: [
                { name: 'Табак', categoryAbstract: null, limitKopecks: null, weeklySpentKopecks: [0], spentKopecks: 0 },
            ],
        });

        await user.click(screen.getByTitle('Показать операции'));

        expect(fetchOperationsMock).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ categories: ['Табак'], from: '2026-09-01', to: '2026-09-06' }),
            expect.anything(),
        );
        expect(await screen.findByText('Табак · Неделя 1')).toBeInTheDocument();
    });

    it('клик по ненулевой сумме недели открывает попап с операциями этой категории/недели', async () => {
        const operations: OperationDto[] = [
            {
                id: 1,
                datetimeIso: '2026-09-03T10:00:00Z',
                localDate: '2026-09-03',
                amountKopecks: -30000,
                type: 'expense',
                account: 'общий',
                card: null,
                currency: 'RUB',
                status: 'Ок',
                categoryDefault: 'Табак',
                category: 'Табак',
                mcc: '5993',
                description: 'Табачная лавка',
                message: '',
                bonusesKopecks: 0,
                includeInAnalytics: true,
                sourceFile: 'test.csv',
            },
        ];
        const response: OperationsResponse = { items: operations, total: 1, page: 1, limit: 200 };
        fetchOperationsMock.mockResolvedValueOnce(response);

        const user = userEvent.setup();
        renderOverview({
            categories: [
                { name: 'Табак', categoryAbstract: null, limitKopecks: null, weeklySpentKopecks: [300_000], spentKopecks: 300_000 },
            ],
        });

        await user.click(screen.getByTitle('Показать операции'));

        expect(fetchOperationsMock).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ categories: ['Табак'], from: '2026-09-01', to: '2026-09-06' }),
            expect.anything(),
        );
        expect(await screen.findByText('Табак · Неделя 1')).toBeInTheDocument();
        expect(await screen.findByText('Табачная лавка')).toBeInTheDocument();
    });
});
