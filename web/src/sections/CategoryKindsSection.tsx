import { useMemo, useState } from 'react';
import type { CategoryKind, CategoryKindDto } from '../../../shared/types';
import {
    apiErrorText,
    createCategoryArea,
    createUserCategory,
    deleteUserCategory,
    setCategoryField,
    setCategoryKind,
    setCategoryLimit,
} from '../api';
import { kopecksToRublesInput, parseRublesToKopecks } from '../format';
import { useCategoryAreas } from '../hooks/useCategoryAreas';
import { useCategoryFields } from '../hooks/useCategoryFields';
import { useCategoryKinds } from '../hooks/useCategoryKinds';
import { useCategoryLimits } from '../hooks/useCategoryLimits';
import { useConfirmDelete } from '../hooks/useConfirmDelete';
import { CollapsibleSection } from '../components/ui/CollapsibleSection';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Spinner } from '../components/ui/Spinner';
import { CategoryRow } from './category-kinds/CategoryRow';
import { InlineNameForm } from './category-kinds/InlineNameForm';

/**
 * Секция «Настройки категорий» — тег «постоянная/переменная» на категорию (для разбивки
 * расходов на дашборде, ExpenseKindSummary), CategoryField — более абстрактная
 * категория поверх категории пользователя, например «Еда и повседневное» объединяет
 * «Продукты и быт»/«Еда вне дома»/«Табак» (группировка строк матрицы в MonthOverview),
 * и план на месяц (user_categories.month_limit_kopecks — столбцы «План»/«% от плана»
 * той же матрицы). Список категорий для тега/плана — useCategoryKinds(version)/
 * useCategoryLimits(version) (все эффективные категории с расходом, одинаковый набор);
 * CategoryField можно задать только категориям пользователя (useCategoryFields(version) —
 * ровно то, что размечено в «Обзоре месяца»), у остальных строк это поле не показывается.
 *
 * «Новая категория» вверху — ЕДИНСТВЕННОЕ место в приложении, где заводится новая
 * user_categories.name (POST /api/categories, domain/categories.ts → createUserCategory).
 * Везде, где категория выбирается как ЦЕЛЬ (маппинги, мерчанты), это строгий select из уже
 * существующих — вписать новое имя прямо в том поле нельзя, сначала завести здесь.
 *
 * «Новая сфера» — аналогично, единственное место, где заводится НОВАЯ category_abstract
 * без привязки к конкретной категории (POST /api/categories/areas, useCategoryAreas(version));
 * назначение сферы категории — строгий SearchableSelect из уже существующих сфер (setCategoryField
 * ниже всё равно умеет find-or-create по имени на сервере, но UI больше не даёт вписать новое
 * имя прямо в поле категории — сначала завести сферу здесь, как и с категориями).
 *
 * «Удалить» у категории — DELETE /api/categories/:category (domain/categories.ts →
 * deleteUserCategory), подтверждается ConfirmDialog (необратимо влияет на много операций
 * разом). Служебную «Без категории» удалить нельзя (её нет в этом списке — см. listCategoryKinds).
 * Операции/мерчанты/mcc- и custom-правила, ссылавшиеся ТОЛЬКО на удалённую категорию,
 * становятся «Без категории» сами — через живой VIEW operations_effective, пересчитывать
 * вручную не нужно (инвариант 5); если операция подходит под другое правило (например, у
 * мерчанта было ещё и MCC-правило на другую категорию), сработает оно.
 */

interface Props {
    version: number;
    onDataChanged: () => void;
}

export function CategoryKindsSection({ version, onDataChanged }: Props): JSX.Element {
    const kindsQuery = useCategoryKinds(version);
    const kinds = kindsQuery.data ?? [];
    const fieldsQuery = useCategoryFields(version);
    const fieldByCategory = useMemo(
        () => new Map((fieldsQuery.data ?? []).map((f) => [f.category, f.field])),
        [fieldsQuery.data],
    );
    const limitsQuery = useCategoryLimits(version);
    const limitByCategory = useMemo(
        () => new Map((limitsQuery.data ?? []).map((l) => [l.category, l.monthLimitKopecks])),
        [limitsQuery.data],
    );
    const areasQuery = useCategoryAreas(version);
    const areas = areasQuery.data ?? [];
    const areaOptions = useMemo(
        () => [{ value: '', label: '— (без сферы)' }, ...areas.map((a) => ({ value: a, label: a }))],
        [areas],
    );

    // Группировка строк по сфере (category_abstract) — как в MonthOverview: группы по алфавиту
    // названия сферы, категории без сферы — отдельным блоком «Без сферы» в конце.
    const groups = useMemo(() => {
        const bySphere = new Map<string, CategoryKindDto[]>();
        const withoutSphere: CategoryKindDto[] = [];
        for (const item of kinds) {
            const sphere = fieldByCategory.get(item.category);
            if (sphere === undefined || sphere === null || sphere === '') {
                withoutSphere.push(item);
                continue;
            }
            if (!bySphere.has(sphere)) bySphere.set(sphere, []);
            bySphere.get(sphere)?.push(item);
        }
        const result: Array<{ sphere: string | null; items: CategoryKindDto[] }> = Array.from(bySphere.keys())
            .sort((a, b) => a.localeCompare(b, 'ru'))
            .map((sphere) => ({ sphere, items: bySphere.get(sphere) ?? [] }));
        if (withoutSphere.length > 0) result.push({ sphere: null, items: withoutSphere });
        return result;
    }, [kinds, fieldByCategory]);

    const [limitDrafts, setLimitDrafts] = useState<Record<string, string>>({});
    const [busyCategory, setBusyCategory] = useState<string | null>(null);
    const [busyFieldCategory, setBusyFieldCategory] = useState<string | null>(null);
    const [busyLimitCategory, setBusyLimitCategory] = useState<string | null>(null);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [creatingCategory, setCreatingCategory] = useState(false);
    const [newAreaName, setNewAreaName] = useState('');
    const [creatingArea, setCreatingArea] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const categoryDelete = useConfirmDelete<string>();

    const handleCreateCategory = async (): Promise<void> => {
        const name = newCategoryName.trim();
        if (name === '') {
            setError('Введите название новой категории');
            return;
        }
        setCreatingCategory(true);
        setError(null);
        try {
            await createUserCategory(name);
            setNewCategoryName('');
            onDataChanged();
        } catch (e: unknown) {
            setError(apiErrorText(e, 'Не удалось создать категорию'));
        } finally {
            setCreatingCategory(false);
        }
    };

    const handleCreateArea = async (): Promise<void> => {
        const name = newAreaName.trim();
        if (name === '') {
            setError('Введите название новой сферы');
            return;
        }
        setCreatingArea(true);
        setError(null);
        try {
            await createCategoryArea(name);
            setNewAreaName('');
            onDataChanged();
        } catch (e: unknown) {
            setError(apiErrorText(e, 'Не удалось создать сферу'));
        } finally {
            setCreatingArea(false);
        }
    };

    const handleSetKind = async (category: string, kind: CategoryKind | null): Promise<void> => {
        setBusyCategory(category);
        setError(null);
        try {
            await setCategoryKind(category, kind);
            onDataChanged();
        } catch (e: unknown) {
            setError(apiErrorText(e, 'Не удалось сохранить тег категории'));
        } finally {
            setBusyCategory(null);
        }
    };

    const handleSetField = async (category: string, field: string): Promise<void> => {
        setBusyFieldCategory(category);
        setError(null);
        try {
            await setCategoryField(category, field === '' ? null : field);
            onDataChanged();
        } catch (e: unknown) {
            setError(apiErrorText(e, 'Не удалось сохранить сферу категории'));
        } finally {
            setBusyFieldCategory(null);
        }
    };

    const handleDeleteCategory = async (category: string): Promise<void> => {
        try {
            await deleteUserCategory(category);
            onDataChanged();
        } catch (e: unknown) {
            setError(apiErrorText(e, 'Не удалось удалить категорию'));
            throw e;
        }
    };

    const handleSaveLimit = async (category: string): Promise<void> => {
        const draft = (limitDrafts[category] ?? '').trim();
        if (draft === '') {
            setBusyLimitCategory(category);
            setError(null);
            try {
                await setCategoryLimit(category, null);
                onDataChanged();
            } catch (e: unknown) {
                setError(apiErrorText(e, 'Не удалось сохранить план категории'));
            } finally {
                setBusyLimitCategory(null);
            }
            return;
        }
        const monthLimitKopecks = parseRublesToKopecks(draft);
        if (monthLimitKopecks === null || monthLimitKopecks <= 0) {
            setError('План должен быть положительным числом, например «15000»');
            return;
        }
        setBusyLimitCategory(category);
        setError(null);
        try {
            await setCategoryLimit(category, monthLimitKopecks);
            onDataChanged();
        } catch (e: unknown) {
            setError(apiErrorText(e, 'Не удалось сохранить план категории'));
        } finally {
            setBusyLimitCategory(null);
        }
    };

    const listLoading = kindsQuery.loading && kinds.length === 0;

    return (
        <CollapsibleSection title="Настройки категорий" defaultOpen={false}>
            <p className="muted" style={{ marginTop: -6, marginBottom: 12 }}>
                Тег определяет разбивку расходов на дашборде. Категории без тега считаются
                «не размечено». Сфера — более абстрактная категория поверх категории
                пользователя (например «Еда и повседневное» объединяет несколько категорий,
                группирует строки в «Обзоре месяца») — доступна только для категорий,
                размеченных в «Обзоре месяца», и выбирается из уже созданных сфер (заводится
                отдельно, полем «Новая сфера» ниже). План на месяц — столбцы «План»/«% от плана»
                в той же матрице; пустое значение — план не задан.
            </p>
            {error !== null && <ErrorBanner message={error} />}
            {kindsQuery.error !== null && <ErrorBanner message={kindsQuery.error} />}
            {fieldsQuery.error !== null && <ErrorBanner message={fieldsQuery.error} />}
            {limitsQuery.error !== null && <ErrorBanner message={limitsQuery.error} />}
            {areasQuery.error !== null && <ErrorBanner message={areasQuery.error} />}

            <InlineNameForm
                id="new-category-name"
                label="Новая категория"
                placeholder="Например «Подарки»"
                value={newCategoryName}
                onChange={setNewCategoryName}
                submitting={creatingCategory}
                submitLabel="Добавить категорию"
                onSubmit={() => void handleCreateCategory()}
            />

            <InlineNameForm
                id="new-area-name"
                label="Новая сфера"
                placeholder="Например «Еда и повседневное»"
                value={newAreaName}
                onChange={setNewAreaName}
                submitting={creatingArea}
                submitLabel="Добавить сферу"
                onSubmit={() => void handleCreateArea()}
            />

            {listLoading ? (
                <div className="state-box">
                    <Spinner />
                    <span>Загрузка категорий…</span>
                </div>
            ) : (
                <div className="entity-list">
                    {kinds.length === 0 && <p className="empty">Категорий пока нет — сначала импортируйте операции.</p>}
                    {groups.map((group) => (
                        <div key={group.sphere ?? '\u0000without-sphere'}>
                            <div className="entity-group-header">{group.sphere ?? 'Без сферы'}</div>
                            {group.items.map((item) => {
                                const hasField = fieldByCategory.has(item.category);
                                const savedField = fieldByCategory.get(item.category) ?? '';
                                const savedLimit = limitByCategory.get(item.category) ?? null;
                                const limitDraft =
                                    limitDrafts[item.category] ?? (savedLimit === null ? '' : kopecksToRublesInput(savedLimit));
                                const savedLimitDraft = savedLimit === null ? '' : kopecksToRublesInput(savedLimit);
                                const limitChanged = limitDraft.trim() !== savedLimitDraft;

                                return (
                                    <CategoryRow
                                        key={item.category}
                                        item={item}
                                        hasField={hasField}
                                        savedField={savedField ?? ''}
                                        areaOptions={areaOptions}
                                        fieldBusy={busyFieldCategory === item.category}
                                        onSetField={(field) => void handleSetField(item.category, field)}
                                        savedLimit={savedLimit}
                                        limitDraft={limitDraft}
                                        limitChanged={limitChanged}
                                        limitBusy={busyLimitCategory === item.category}
                                        onLimitDraftChange={(value) =>
                                            setLimitDrafts((prev) => ({ ...prev, [item.category]: value }))
                                        }
                                        onSaveLimit={() => void handleSaveLimit(item.category)}
                                        kindBusy={busyCategory === item.category}
                                        onSetKind={(kind) => void handleSetKind(item.category, kind)}
                                        deleteBusy={categoryDelete.busy}
                                        onRequestDelete={() => categoryDelete.requestDelete(item.category)}
                                    />
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}

            <ConfirmDialog
                open={categoryDelete.pending !== null}
                title={`Удалить категорию «${categoryDelete.pending ?? ''}»?`}
                description="Операции, мерчанты и правила (MCC/сообщение), ссылавшиеся только на эту категорию, станут «Без категории». Действие необратимо."
                confirmLabel="Удалить"
                busy={categoryDelete.busy}
                onCancel={categoryDelete.cancel}
                onConfirm={() => void categoryDelete.confirm(handleDeleteCategory)}
            />
        </CollapsibleSection>
    );
}
