import type { OperationDto } from '../../../shared/types';
import { formatDateTime, formatMoney } from '../format';

/**
 * Таблица операций: дата (по Москве), описание, категория, сумма со знаком и цветом.
 * Внутренние переводы (includeInAnalytics=false) помечены бейджем.
 */

interface Props {
    items: OperationDto[];
    loading: boolean;
    onCreateRule: (operation: OperationDto) => void;
}

export function OperationsTable({ items, loading, onCreateRule }: Props): JSX.Element {
    if (loading) {
        return (
            <div className="state-box">
                <div className="spinner" />
                <span>Загрузка операций…</span>
            </div>
        );
    }

    if (items.length === 0) {
        return <p className="empty">Операций по выбранным фильтрам не найдено.</p>;
    }

    return (
        <div className="table-wrap">
            <table className="table">
                <thead>
                    <tr>
                        <th>Дата</th>
                        <th>Описание</th>
                        <th>Категория</th>
                        <th>Счёт</th>
                        <th className="table-amount-right">Сумма</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((op) => (
                        <tr key={op.id}>
                            <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(op.datetimeIso)}</td>
                            <td className="cell-description" title={op.description}>
                                {op.description === '' ? <span className="muted">—</span> : op.description}
                                {!op.includeInAnalytics && (
                                    <>
                                        {' '}
                                        <span className="table-badge table-badge-off" title="Исключено из аналитики">
                                            вне аналитики
                                        </span>
                                    </>
                                )}
                            </td>
                            <td>
                                <span className="table-badge">{op.category}</span>
                            </td>
                            <td className="muted">{op.account}</td>
                            <td className={`table-amount-right ${op.amountKopecks < 0 ? 'amount-expense' : 'amount-income'}`}>
                                {op.amountKopecks < 0 ? '−' : '+'}
                                {formatMoney(Math.abs(op.amountKopecks))}
                            </td>
                            <td>
                                <button type="button" className="btn btn-small" onClick={() => onCreateRule(op)}>
                                    Создать правило
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
