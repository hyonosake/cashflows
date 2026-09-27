import { Fragment, useState } from 'react';
import type { DashboardDto, MonthOverviewCategoryDto, MonthOverviewDto, MonthOverviewWeekDto } from '../../../shared/types';
import { formatDate, formatMoneyWhole, formatPercent, pluralizeRu } from '../format';
import { WeekOperationsDialog } from './WeekOperationsDialog';
import type { WeekCell } from './WeekOperationsDialog';

/**
 * Обзор календарного месяца, содержащего выбранную неделю (dashboard.monthOverview) —
 * дни до зарплаты + Доход(план)/Расходы/Баланс месяца (MonthBudgetSummary — доход это ПЛАН
 * по расписанию зарплаты из «Настроек», не факт из income-операций) + матрица категория×неделя трат месяца
 * (столбцы: План | Неделя 1..N | Потрачено | % от плана), сгруппированная по сфере (category_abstract).
 * План — user_categories.month_limit_kopecks (необязательное поле, настраивается в
 * «Настройках» → CategoryKindsSection); «Потрачено» — spentKopecks за весь месяц (та же сумма,
 * что участвует в «% от плана» = spentKopecks/limitKopecks, «—», если план не задан, — просто
 * показана отдельным столбцом как абсолютное число, а не только в процентах). Каждая граница
 * столбца (Категория|План, План|Неделя 1, между соседними неделями, Неделя N|Потрачено) — своя
 * вертикальная линия, чтобы недели не сливались друг с другом и с планом/итогом при сканировании
 * строки глазами; «Потрачено»/«% от плана» — одна смысловая пара, без разделителя между ними.
 * Любая недельная сумма кликабельна, включая «0 ₽» и строку «Итого» группы — открывает
 * WeekOperationsDialog со списком вошедших в неё операций (пустой список для «0 ₽» — тоже
 * корректный ответ); «Потрачено» кликабельна так же, но открывает операции за ВЕСЬ месяц
 * (overview.month.from..to), а не за одну неделю — другой title у кнопки, чтобы отличать
 * в тестах/тултипе от недельных ячеек. Вся строка (не только «% от плана») заливается красным
 * по нарастающей с ростом % от плана — planRowBackground(); ниже 50% заливки нет, план не
 * задан — тоже нет.
 */

interface CategoryGroup {
    field: string | null;
    items: MonthOverviewCategoryDto[];
}

/** Порядок групп — по первому появлению categoryAbstract в исходном списке (уже порядок по имени). */
function groupByField(categories: MonthOverviewCategoryDto[]): CategoryGroup[] {
    const order: Array<string | null> = [];
    const byField = new Map<string | null, MonthOverviewCategoryDto[]>();
    for (const item of categories) {
        if (!byField.has(item.categoryAbstract)) {
            order.push(item.categoryAbstract);
            byField.set(item.categoryAbstract, []);
        }
        byField.get(item.categoryAbstract)?.push(item);
    }
    return order.map((field) => ({ field, items: byField.get(field) ?? [] }));
}

const MONTH_NAMES = [
    'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
    'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

function monthLabel(monthKey: string): string {
    const [yearStr, monthStr] = monthKey.split('-');
    const name = MONTH_NAMES[Number(monthStr) - 1];
    if (name === undefined) return monthKey;
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${yearStr}`;
}

/** Процент от плана (0..∞), null — план не задан. */
function planPct(spentKopecks: number, limitKopecks: number | null): number | null {
    if (limitKopecks === null || limitKopecks === 0) return null;
    return (spentKopecks / limitKopecks) * 100;
}

/**
 * Заливка ВСЕЙ строки категории/«Итого» — непрерывный красный градиент по % от плана
 * (не пара цветов со скачком на 100%, а один канал, плавно усиливающийся с ростом %):
 * ниже 50% — нет заливки, дальше плотность растёт линейно, потолок — чтобы текст не
 * терялся под насыщенным фоном на всю ширину строки. null (план не задан) — без заливки.
 */
function planRowBackground(pct: number | null): string | undefined {
    if (pct === null) return undefined;
    const intensity = Math.min(0.35, Math.max(0, pct - 50) * 0.0023);
    if (intensity <= 0) return undefined;
    return `color-mix(in srgb, var(--expense) ${Math.round(intensity * 100)}%, transparent)`;
}

function sumWeek(items: MonthOverviewCategoryDto[], weekIndex: number): number {
    return items.reduce((sum, item) => sum + (item.weeklySpentKopecks[weekIndex] ?? 0), 0);
}

function sumLimit(items: MonthOverviewCategoryDto[]): number | null {
    let hasAny = false;
    let total = 0;
    for (const item of items) {
        if (item.limitKopecks !== null) {
            hasAny = true;
            total += item.limitKopecks;
        }
    }
    return hasAny ? total : null;
}

function sumSpent(items: MonthOverviewCategoryDto[]): number {
    return items.reduce((sum, item) => sum + item.spentKopecks, 0);
}

interface GroupHeaderRowProps {
    field: string;
    colSpan: number;
}

function GroupHeaderRow({ field, colSpan }: GroupHeaderRowProps): JSX.Element {
    return (
        <tr className="month-overview-group-header">
            <td colSpan={colSpan}>{field}</td>
        </tr>
    );
}

/**
 * Недельная сумма — всегда кликабельная кнопка (в т.ч. «0 ₽»: попап просто покажет
 * «операций не найдено», это тоже корректный ответ на вопрос «что здесь»). Нулевая
 * сумма приглушена цветом, чтобы ненулевые траты не терялись в цепочке «0 ₽» по строке,
 * но остаётся кликабельной наравне с любой другой ячейкой, включая строку «Итого».
 */
interface WeekAmountCellProps {
    kopecks: number;
    onOpen: () => void;
    rowBackground?: string;
    className: string;
    title?: string;
}

function WeekAmountCell({ kopecks, onOpen, rowBackground, className, title = 'Показать операции' }: WeekAmountCellProps): JSX.Element {
    return (
        <td
            className={`table-amount-right ${className}`}
            style={rowBackground === undefined ? undefined : { backgroundColor: rowBackground }}
        >
            <button
                type="button"
                className={`month-overview-cell-btn${kopecks === 0 ? ' month-overview-zero' : ''}`}
                onClick={onOpen}
                title={title}
            >
                {formatMoneyWhole(kopecks)}
            </button>
        </td>
    );
}

interface SubtotalRowProps {
    field: string;
    items: MonthOverviewCategoryDto[];
    weeks: MonthOverviewWeekDto[];
    month: { from: string; to: string };
    onOpenCell: (cell: WeekCell) => void;
}

function SubtotalRow({ field, items, weeks, month, onOpenCell }: SubtotalRowProps): JSX.Element {
    const limit = sumLimit(items);
    const spent = sumSpent(items);
    const pct = planPct(spent, limit);
    const rowBackground = planRowBackground(pct);
    const rowStyle = rowBackground === undefined ? undefined : { backgroundColor: rowBackground };
    const over = pct !== null && pct >= 100;
    const categories = items.map((item) => item.name);
    return (
        <tr className="month-overview-subtotal-row">
            <td className="month-overview-col-identity" style={rowStyle}>
                Итого
            </td>
            <td className="table-amount-right month-overview-col-plan month-overview-col-identity" style={rowStyle}>
                {limit === null ? '—' : formatMoneyWhole(limit)}
            </td>
            {weeks.map((week) => (
                <WeekAmountCell
                    key={week.index}
                    kopecks={sumWeek(items, week.index - 1)}
                    rowBackground={rowBackground}
                    className={`month-overview-col-week${week.index === 1 ? ' month-overview-col-week-start' : ''}`}
                    onOpen={() =>
                        onOpenCell({ title: `${field} · Неделя ${week.index}`, categories, from: week.from, to: week.to })
                    }
                />
            ))}
            <WeekAmountCell
                kopecks={spent}
                rowBackground={rowBackground}
                className="month-overview-col-total"
                title="Показать операции за месяц"
                onOpen={() => onOpenCell({ title: `${field} · Весь месяц`, categories, from: month.from, to: month.to })}
            />
            <td
                className={`table-amount-right month-overview-col-status${over ? ' month-overview-plan-status-over' : ''}`}
                style={rowStyle}
            >
                {formatPercent(pct)}
            </td>
        </tr>
    );
}

interface CategoryRowProps {
    item: MonthOverviewCategoryDto;
    weeks: MonthOverviewWeekDto[];
    month: { from: string; to: string };
    grouped: boolean;
    onOpenCell: (cell: WeekCell) => void;
}

function CategoryRow({ item, weeks, month, grouped, onOpenCell }: CategoryRowProps): JSX.Element {
    const pct = planPct(item.spentKopecks, item.limitKopecks);
    const rowBackground = planRowBackground(pct);
    const rowStyle = rowBackground === undefined ? undefined : { backgroundColor: rowBackground };
    const over = pct !== null && pct >= 100;
    return (
        <tr className={grouped ? 'month-overview-row-grouped' : undefined}>
            <td className="month-overview-col-identity" style={rowStyle}>
                {item.name}
            </td>
            <td className="table-amount-right month-overview-col-plan month-overview-col-identity" style={rowStyle}>
                {item.limitKopecks === null ? '—' : formatMoneyWhole(item.limitKopecks)}
            </td>
            {weeks.map((week) => (
                <WeekAmountCell
                    key={week.index}
                    kopecks={item.weeklySpentKopecks[week.index - 1] ?? 0}
                    rowBackground={rowBackground}
                    className={`month-overview-col-week${week.index === 1 ? ' month-overview-col-week-start' : ''}`}
                    onOpen={() =>
                        onOpenCell({
                            title: `${item.name} · Неделя ${week.index}`,
                            categories: [item.name],
                            from: week.from,
                            to: week.to,
                        })
                    }
                />
            ))}
            <WeekAmountCell
                kopecks={item.spentKopecks}
                rowBackground={rowBackground}
                className="month-overview-col-total"
                title="Показать операции за месяц"
                onOpen={() =>
                    onOpenCell({ title: `${item.name} · Весь месяц`, categories: [item.name], from: month.from, to: month.to })
                }
            />
            <td
                className={`table-amount-right month-overview-col-status${over ? ' month-overview-plan-status-over' : ''}`}
                style={rowStyle}
            >
                {formatPercent(pct)}
            </td>
        </tr>
    );
}

/**
 * Доход/Расходы/Баланс месяца: доход — ПЛАН по расписанию зарплаты (salaryAmountKopecks ×
 * число дней зарплаты в настройках), не факт из income-операций (зарплата могла ещё не
 * прийти на момент просмотра); расходы — факт за календарный месяц; баланс = план дохода
 * минус факт расходов. Займы — сколько должны пользователю другие люди: чисто справочная
 * ручная цифра (нет сущности «займы» в схеме), серым, независимо от того, задан ли доход.
 * Без обеих настроек — подсказка вместо карточек.
 */
function MonthBudgetSummary({ overview }: { overview: MonthOverviewDto }): JSX.Element {
    const { plannedIncomeKopecks, expenseKopecks, balanceKopecks, owedToUserKopecks } = overview;
    if (plannedIncomeKopecks === null && owedToUserKopecks === null) {
        return (
            <p className="muted" style={{ marginBottom: 14 }}>
                Задайте доход за день зарплаты в «Настройках», чтобы видеть план дохода и баланс месяца.
            </p>
        );
    }
    const balance = balanceKopecks ?? 0;
    return (
        <div className="kpi-row" style={{ marginBottom: 14 }}>
            {plannedIncomeKopecks !== null && (
                <>
                    <div className="kpi">
                        <div className="kpi-label">Доход (план)</div>
                        <div className="kpi-value kpi-value-income">{formatMoneyWhole(plannedIncomeKopecks)}</div>
                    </div>
                    <div className="kpi">
                        <div className="kpi-label">Расходы</div>
                        <div className="kpi-value kpi-value-expense">{formatMoneyWhole(expenseKopecks)}</div>
                    </div>
                    <div className="kpi">
                        <div className="kpi-label">Баланс</div>
                        <div className={`kpi-value ${balance >= 0 ? 'kpi-value-income' : 'kpi-value-expense'}`}>
                            {formatMoneyWhole(balance)}
                        </div>
                    </div>
                </>
            )}
            {owedToUserKopecks !== null && (
                <div className="kpi">
                    <div className="kpi-label">Займы</div>
                    <div className="kpi-value kpi-value-muted">{formatMoneyWhole(owedToUserKopecks)}</div>
                    <div className="kpi-sub">сколько должны нам</div>
                </div>
            )}
        </div>
    );
}

interface Props {
    dashboard: DashboardDto;
    version: number;
    onDataChanged: () => void;
}

export function MonthOverview({ dashboard, version, onDataChanged }: Props): JSX.Element {
    const overview = dashboard.monthOverview;
    const weeks = overview.weeks;
    const colSpan = weeks.length + 4; // Категория + План + недели + Потрачено + % от плана
    const [cell, setCell] = useState<WeekCell | null>(null);

    return (
        <div className="panel">
            <div className="panel-head">
                <h2>Обзор месяца · {monthLabel(overview.month.key)}</h2>
                {overview.daysUntilSalary !== null && overview.nextSalaryDate !== null ? (
                    <span className="income-compact">
                        До зарплаты{' '}
                        {overview.daysUntilSalary === 0
                            ? 'сегодня'
                            : `${overview.daysUntilSalary} ${pluralizeRu(overview.daysUntilSalary, ['день', 'дня', 'дней'])}`}{' '}
                        · {formatDate(overview.nextSalaryDate)}
                    </span>
                ) : (
                    <span className="income-compact">День зарплаты не задан — укажите в «Настройках»</span>
                )}
            </div>

            <MonthBudgetSummary overview={overview} />

            {overview.categories.length === 0 ? (
                <p className="empty">Нет категорий пользователя — разметьте их в «Настройках».</p>
            ) : (
                <div className="table-wrap">
                    <table className="table">
                        <thead>
                            <tr>
                                <th className="month-overview-col-identity">Категория</th>
                                <th className="table-amount-right month-overview-col-plan month-overview-col-identity">План</th>
                                {weeks.map((week) => (
                                    <th
                                        key={week.index}
                                        className={`table-amount-right month-overview-col-week${week.index === 1 ? ' month-overview-col-week-start' : ''}`}
                                    >
                                        Неделя {week.index}
                                    </th>
                                ))}
                                <th className="table-amount-right month-overview-col-total">Потрачено</th>
                                <th className="table-amount-right month-overview-col-status">% от плана</th>
                            </tr>
                        </thead>
                        <tbody>
                            {groupByField(overview.categories).map((group) => (
                                <Fragment key={group.field ?? '__none__'}>
                                    {group.field !== null && <GroupHeaderRow field={group.field} colSpan={colSpan} />}
                                    {group.items.map((item) => (
                                        <CategoryRow
                                            key={item.name}
                                            item={item}
                                            weeks={weeks}
                                            month={overview.month}
                                            grouped={group.field !== null}
                                            onOpenCell={setCell}
                                        />
                                    ))}
                                    {group.field !== null && group.items.length > 1 && (
                                        <SubtotalRow
                                            field={group.field}
                                            items={group.items}
                                            weeks={weeks}
                                            month={overview.month}
                                            onOpenCell={setCell}
                                        />
                                    )}
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {cell !== null && (
                <WeekOperationsDialog cell={cell} version={version} onClose={() => setCell(null)} onDataChanged={onDataChanged} />
            )}
        </div>
    );
}
