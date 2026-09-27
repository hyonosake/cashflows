import { useMemo, useState } from 'react';
import type { OperationDto, OperationsResponse } from '../../../shared/types';
import { apiErrorText, createCustomMapping, createMcMapping, setMerchantCategory, updateOperationCategory } from '../api';
import { CreateRuleDialog } from '../components/CreateRuleDialog';
import type { CreateRuleInput } from '../components/CreateRuleDialog';
import { OperationsFiltersBar } from '../components/OperationsFiltersBar';
import type { OperationsFilterState } from '../components/OperationsFiltersBar';
import { OperationsPager } from '../components/OperationsPager';
import { OperationsTable } from '../components/OperationsTable';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { useCategories } from '../hooks/useCategories';
import { useCategoryFields } from '../hooks/useCategoryFields';
import { useOperations } from '../hooks/useOperations';
import { formatDate } from '../format';
import type { OperationsFilters } from '../api';

/**
 * Страница «Операции» — контейнер: черновик фильтров + применённые фильтры +
 * страница пагинации. Загрузка — useOperations (AbortController внутри); категории для
 * фильтра — useCategories(version) (полный список + «Без категории»); категории для
 * CreateRuleDialog (целевая категория ПРАВИЛА) — useCategoryFields(version), тот же
 * набор, что useCategories(version, 'user'), но сразу со сферой каждой категории
 * (categorySpheres — дополняет подпись варианта в SearchableSelect, «Психолог (Сима)»,
 * иначе похожие по названию категории неразличимы в списке; переиспользуется и в
 * OperationsFiltersBar). Декомпозиция: FiltersBar / Table / Pager в components/*.
 *
 * «Создать правило» у строки операции (PLANS.md, «Умный маппинг категорий», п.1):
 * та же связка createMapping + recalculateCategories, что в MappingsSection (Настройки),
 * только без перехода на другую вкладку — форма предзаполняется из самой операции.
 * `version` растёт после сохранения правила, чтобы обновились и эта страница
 * (см. useOperations), и Дашборд/Настройки при следующем открытии.
 */

interface Props {
    version: number;
    onDataChanged: () => void;
}

function initialFilters(): OperationsFilterState {
    return { from: '', to: '', category: '', type: '', q: '', analyticsOnly: true };
}

/** Черновик → параметры GET /api/operations ('' → параметр не передаётся). */
function toQuery(f: OperationsFilterState): OperationsFilters {
    return {
        from: f.from === '' ? undefined : f.from,
        to: f.to === '' ? undefined : f.to,
        category: f.category === '' ? undefined : f.category,
        type: f.type === '' ? undefined : f.type,
        q: f.q === '' ? undefined : f.q,
        analyticsOnly: f.analyticsOnly,
    };
}

function totalPagesOf(data: OperationsResponse | null, fallbackPage: number): { totalPages: number; page: number } {
    if (data === null) return { totalPages: 1, page: fallbackPage };
    return { totalPages: Math.max(1, Math.ceil(data.total / data.limit)), page: data.page };
}

export function OperationsPage({ version, onDataChanged }: Props): JSX.Element {
    const [filters, setFilters] = useState<OperationsFilterState>(initialFilters);
    const [applied, setApplied] = useState<OperationsFilterState>(initialFilters);
    const [page, setPage] = useState(1);
    const [ruleSource, setRuleSource] = useState<OperationDto | null>(null);
    const [ruleSaving, setRuleSaving] = useState(false);
    const [ruleError, setRuleError] = useState<string | null>(null);

    const categoriesQuery = useCategories(version);
    const categories = categoriesQuery.data ?? [];
    const categoryFieldsQuery = useCategoryFields(version);
    const categoryFields = categoryFieldsQuery.data ?? [];
    const userCategories = useMemo(() => categoryFields.map((f) => f.category), [categoryFields]);
    const categorySpheres = useMemo(() => new Map(categoryFields.map((f) => [f.category, f.field])), [categoryFields]);

    const query = useMemo(() => toQuery(applied), [applied]);
    const operationsQuery = useOperations(query, page, version);
    const data = operationsQuery.data;

    const { totalPages, page: shownPage } = totalPagesOf(data, page);

    function applyFilters(): void {
        setPage(1);
        setApplied({ ...filters });
    }

    function resetFilters(): void {
        const reset = initialFilters();
        setFilters(reset);
        setPage(1);
        setApplied(reset);
    }

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
        } catch (e: unknown) {
            setRuleError(apiErrorText(e));
        } finally {
            setRuleSaving(false);
        }
    }

    /** «Использовать и для прошлых, и для будущих» выключен — категория только этой операции. */
    async function saveRuleOnce(categoryUser: string): Promise<void> {
        if (ruleSource === null) return;
        setRuleSaving(true);
        setRuleError(null);
        try {
            await updateOperationCategory(ruleSource.id, { categoryUser });
            setRuleSource(null);
            onDataChanged();
        } catch (e: unknown) {
            setRuleError(apiErrorText(e));
        } finally {
            setRuleSaving(false);
        }
    }

    return (
        <div className="panel">
            <h2>Операции</h2>

            <OperationsFiltersBar
                filters={filters}
                categories={categories}
                categorySpheres={categorySpheres}
                onChange={setFilters}
                onApply={applyFilters}
                onReset={resetFilters}
            />

            {(applied.from !== '' || applied.to !== '') && (
                <p className="muted">
                    Период: {applied.from === '' ? '…' : formatDate(applied.from)} —{' '}
                    {applied.to === '' ? '…' : formatDate(applied.to)}
                </p>
            )}

            {operationsQuery.error !== null && <ErrorBanner message={operationsQuery.error} />}

            <OperationsTable
                items={data?.items ?? []}
                loading={operationsQuery.loading && data === null}
                onCreateRule={setRuleSource}
            />

            <OperationsPager
                total={data?.total ?? 0}
                page={shownPage}
                totalPages={totalPages}
                loading={operationsQuery.loading}
                onPageChange={setPage}
            />

            <CreateRuleDialog
                operation={ruleSource}
                categories={userCategories}
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
        </div>
    );
}
