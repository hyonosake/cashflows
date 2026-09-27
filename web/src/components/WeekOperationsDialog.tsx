import { useEffect, useMemo } from 'react';
import { fetchCategoryFields, fetchOperations } from '../api';
import { useApiQuery } from '../hooks/useApiQuery';
import { useCreateRule } from '../hooks/useCreateRule';
import { formatDate, formatMoneyWhole, pluralizeRu } from '../format';
import { CreateRuleDialog } from './CreateRuleDialog';
import { OperationsTable } from './OperationsTable';
import { ErrorBanner } from './ui/ErrorBanner';

/**
 * Попап «операции за ячейкой» — клик по сумме в матрице MonthOverview (неделя категории
 * или строка «Итого» группы) открывает список вошедших в неё операций (GET /api/operations
 * с categories=... + from/to той же недели). Смена категории операции — тот же
 * CreateRuleDialog, что на странице «Операции» (создание правила ИЛИ разовая категория).
 * Монтируется родителем ТОЛЬКО когда есть открытая ячейка (cell не пуст) — категории и
 * операции не запрашиваются впустую, пока попап закрыт.
 */

export interface WeekCell {
    title: string; // «Табак · Неделя 2» / «Еда и повседневное · Неделя 2»
    categories: string[];
    from: string;
    to: string;
}

interface Props {
    cell: WeekCell;
    version: number;
    onClose: () => void;
    onDataChanged: () => void;
}

const LIMIT = 200;

export function WeekOperationsDialog({ cell, version, onClose, onDataChanged }: Props): JSX.Element {
    const key = `${cell.categories.join(',')}|${cell.from}|${cell.to}`;
    const query = useApiQuery(
        (signal) => fetchOperations({ categories: cell.categories, from: cell.from, to: cell.to, limit: LIMIT }, signal),
        [key, version],
        'Не удалось загрузить операции',
    );
    const categoryFieldsQuery = useApiQuery((signal) => fetchCategoryFields(signal), [version], 'Не удалось загрузить категории');
    const categoryFields = categoryFieldsQuery.data ?? [];
    const categories = useMemo(() => categoryFields.map((f) => f.category), [categoryFields]);
    const categorySpheres = useMemo(() => new Map(categoryFields.map((f) => [f.category, f.field])), [categoryFields]);
    const createRule = useCreateRule(() => {
        onDataChanged();
        query.reload();
    });

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key === 'Escape' && createRule.source === null) onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [createRule.source, onClose]);

    const data = query.data;
    const items = data?.items ?? [];
    const total = data?.total ?? 0;
    const sumKopecks = items.reduce((sum, op) => sum + Math.abs(op.amountKopecks), 0);

    return (
        <>
            <div className="modal-overlay" role="presentation" onClick={onClose}>
                <div
                    className="modal modal-wide"
                    role="dialog"
                    aria-modal="true"
                    aria-label={cell.title}
                    onClick={(e) => e.stopPropagation()}
                >
                    <h3 className="modal-title">{cell.title}</h3>
                    <p className="modal-description">
                        {formatDate(cell.from)} – {formatDate(cell.to)}
                        {data !== null && (
                            <>
                                {' '}
                                · {formatMoneyWhole(sumKopecks)} · {total} {pluralizeRu(total, ['операция', 'операции', 'операций'])}
                            </>
                        )}
                    </p>
                    {query.error !== null && <ErrorBanner message={query.error} />}
                    <OperationsTable items={items} loading={query.loading && data === null} onCreateRule={createRule.open} />
                    {total > items.length && (
                        <p className="muted">
                            Показаны первые {items.length} из {total}.
                        </p>
                    )}
                    <div className="modal-actions">
                        <button type="button" className="btn" onClick={onClose}>
                            Закрыть
                        </button>
                    </div>
                </div>
            </div>

            <CreateRuleDialog
                operation={createRule.source}
                categories={categories}
                categorySpheres={categorySpheres}
                saving={createRule.saving}
                error={createRule.error}
                onCancel={createRule.cancel}
                onSave={createRule.save}
                onSaveOnce={createRule.saveOnce}
            />
        </>
    );
}
