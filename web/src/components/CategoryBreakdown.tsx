import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { CategorySliceDto, DashboardDto } from '../../../shared/types';
import { formatMoney, formatPercent } from '../format';
import { CATEGORY_TOP_COUNT } from '../constants';

/**
 * Донат по категориям (byCategory): топ-N расходов + «Прочее».
 * N и цвета — константы/CSS-переменные (--chart-* из styles.css), не магические литералы.
 */

interface Props {
    dashboard: DashboardDto;
}

const PALETTE = [
    'var(--chart-1)',
    'var(--chart-2)',
    'var(--chart-3)',
    'var(--chart-4)',
    'var(--chart-5)',
    'var(--chart-6)',
    'var(--chart-7)',
    'var(--chart-8)',
] as const;
const REST_COLOR = 'var(--chart-rest)';

interface Slice {
    name: string;
    value: number; // копейки
    color: string;
}

function buildSlices(byCategory: CategorySliceDto[]): Slice[] {
    const top = byCategory.slice(0, CATEGORY_TOP_COUNT);
    const rest = byCategory.slice(CATEGORY_TOP_COUNT);
    const slices: Slice[] = top.map((c, i) => ({
        name: c.category,
        value: c.expenseKopecks,
        color: PALETTE[i % PALETTE.length] ?? REST_COLOR,
    }));
    if (rest.length > 0) {
        const restSum = rest.reduce((acc, c) => acc + c.expenseKopecks, 0);
        slices.push({ name: `Прочее (${rest.length})`, value: restSum, color: REST_COLOR });
    }
    return slices.filter((s) => s.value !== 0 || top.length === 0);
}

export function CategoryBreakdown({ dashboard }: Props): JSX.Element {
    const slices = buildSlices(dashboard.byCategory);
    const totalExpenses = dashboard.totals.expenseKopecks;

    if (slices.length === 0) {
        return <p className="empty">В этом периоде расходов нет.</p>;
    }

    return (
        <div className="donut-wrap">
            <div style={{ width: 240, height: 240, flexShrink: 0 }}>
                <ResponsiveContainer>
                    <PieChart>
                        <Pie
                            data={slices}
                            dataKey="value"
                            nameKey="name"
                            innerRadius="58%"
                            outerRadius="92%"
                            paddingAngle={2}
                            stroke="none"
                        >
                            {slices.map((s) => (
                                <Cell key={s.name} fill={s.color} />
                            ))}
                        </Pie>
                        <Tooltip
                            formatter={(value: number | string, name: string) => [formatMoney(Number(value)), name]}
                            contentStyle={{
                                background: 'var(--bg-panel-2)',
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                                color: 'var(--text)',
                            }}
                        />
                    </PieChart>
                </ResponsiveContainer>
            </div>
            <div className="donut-legend">
                {slices.map((s) => {
                    const share = totalExpenses > 0 ? (s.value / totalExpenses) * 100 : 0;
                    return (
                        <div className="legend-item" key={s.name}>
                            <span className="legend-dot" style={{ background: s.color }} />
                            <div className="legend-text">
                                <span className="legend-name">{s.name}</span>
                                <span className="legend-value">
                                    {formatMoney(s.value)} · {formatPercent(share)}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
