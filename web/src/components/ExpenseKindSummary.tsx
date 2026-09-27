import type { DashboardDto } from '../../../shared/types';
import { formatMoney, formatPercent } from '../format';

/**
 * Разбивка расходов периода на постоянные/переменные/не размечено
 * (dashboard.expenseByKind, тег на категорию — Settings → CategoryKindsSection).
 * 100%-стек-бар (форма выбрана как для part-of-whole с фиксированным малым числом
 * категорий) + легенда с прямыми подписями сумм/долей — цвет не единственный
 * носитель смысла. Категориальные цвета — chart-1 (постоянные) / chart-8 (переменные),
 * фиксированный порядок, проверено validate_palette.js (dataviz skill): все проверки
 * pass для #4c8dff/#9e6a03 на тёмной поверхности. «Не размечено» — не полноценная
 * категория, а состояние ожидания разметки: chart-rest + штриховка, а не сплошной цвет.
 */

interface Props {
    dashboard: DashboardDto;
}

interface Segment {
    key: 'fixed' | 'variable' | 'reserve' | 'unclassified';
    label: string;
    kopecks: number;
    className: string;
}

export function ExpenseKindSummary({ dashboard }: Props): JSX.Element {
    const { fixedKopecks, variableKopecks, reserveKopecks, unclassifiedKopecks } = dashboard.expenseByKind;
    const total = fixedKopecks + variableKopecks + reserveKopecks + unclassifiedKopecks;

    const allSegments: Segment[] = [
        { key: 'fixed', label: 'Постоянные', kopecks: fixedKopecks, className: 'kind-bar-segment-fixed' },
        { key: 'variable', label: 'Переменные', kopecks: variableKopecks, className: 'kind-bar-segment-variable' },
        { key: 'reserve', label: 'Резерв', kopecks: reserveKopecks, className: 'kind-bar-segment-reserve' },
        {
            key: 'unclassified',
            label: 'Не размечено',
            kopecks: unclassifiedKopecks,
            className: 'kind-bar-segment-unclassified',
        },
    ];
    const segments = allSegments.filter((s) => s.kopecks > 0);

    return (
        <div className="panel">
            <h2>Постоянные / переменные расходы</h2>
            {total === 0 ? (
                <p className="empty">В этом периоде расходов нет.</p>
            ) : (
                <>
                    <div className="kind-bar">
                        {segments.map((s) => (
                            <div
                                key={s.key}
                                className={`kind-bar-segment ${s.className}`}
                                style={{ width: `${(s.kopecks / total) * 100}%` }}
                                title={`${s.label}: ${formatMoney(s.kopecks)}`}
                            />
                        ))}
                    </div>
                    <div className="kind-legend">
                        {segments.map((s) => (
                            <div className="kind-legend-item" key={s.key}>
                                <span className={`kind-legend-swatch ${s.className}`} />
                                <div className="legend-text">
                                    <span className="legend-name">{s.label}</span>
                                    <span className="legend-value">
                                        {formatMoney(s.kopecks)} · {formatPercent((s.kopecks / total) * 100)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                    {unclassifiedKopecks > 0 && (
                        <p className="kind-hint">
                            Часть расходов не размечена — задайте тег категориям на вкладке
                            «Настройки», чтобы разбивка была точнее.
                        </p>
                    )}
                </>
            )}
        </div>
    );
}
