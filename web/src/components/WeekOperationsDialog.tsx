import { useEffect, useMemo, useState } from 'react';
import type { OperationDto } from '../../../shared/types';
import {
    apiErrorText,
    createCustomMapping,
    createMcMapping,
    fetchCategoryFields,
    fetchOperations,
    setMerchantCategory,
    updateOperationCategory,
} from '../api';
import { useApiQuery } from '../hooks/useApiQuery';
import { formatDate, formatMoneyWhole, pluralizeRu } from '../format';
import { CreateRuleDialog } from './CreateRuleDialog';
import type { CreateRuleInput } from './CreateRuleDialog';
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
    const [ruleSource, setRuleSource] = useState<OperationDto | null>(null);
    const [ruleSaving, setRuleSaving] = useState(false);
    const [ruleError, setRuleError] = useState<string | null>(null);

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

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key === 'Escape' && ruleSource === null) onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [ruleSource, onClose]);

    const data = query.data;
    const items = data?.items ?? [];
    const total = data?.total ?? 0;
    const sumKopecks = items.reduce((sum, op) => sum + Math.abs(op.amountKopecks), 0);

    async function saveRule(input: CreateRuleInput): Promise<void> {
        setRuleSaving(true);
        setRuleError(null);
        try {
            if (input.kind === 'merchant') {
                await setMerchantCategory({ merchant: input.merchant, targetCategory: input.targetCategory });
            } else if (input.kind === 'mcc') {
                await createMcMapping({ mcc: input.mcc, targetCategory: input.targetCategory });
            } else {
                await createCustomMapping({ matchValue: input.matchValue, targetCategory: input.targetCategory });
            }
            setRuleSource(null);
            onDataChanged();
            query.reload();
        } catch (e: unknown) {
            setRuleError(apiErrorText(e));
        } finally {
            setRuleSaving(false);
        }
    }

    async function saveRuleOnce(categoryUser: string): Promise<void> {
        if (ruleSource === null) return;
        setRuleSaving(true);
        setRuleError(null);
        try {
            await updateOperationCategory(ruleSource.id, { categoryUser });
            setRuleSource(null);
            onDataChanged();
            query.reload();
        } catch (e: unknown) {
            setRuleError(apiErrorText(e));
        } finally {
            setRuleSaving(false);
        }
    }

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
                    <OperationsTable items={items} loading={query.loading && data === null} onCreateRule={setRuleSource} />
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
                operation={ruleSource}
                categories={categories}
                categorySpheres={categorySpheres}
                saving={ruleSaving}
                error={ruleError}
                onCancel={() => {
                    setRuleSource(null);
                    setRuleError(null);
                }}
                onSave={(input) => void saveRule(input)}
                onSaveOnce={(categoryUser) => void saveRuleOnce(categoryUser)}
            />
        </>
    );
}
