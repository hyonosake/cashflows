import { useMemo, useState } from 'react';
import type { CategoryKindDto } from '../../../shared/types';
import {
    apiErrorText,
    createCategoryArea,
    createUserCategory,
    deleteUserCategory,
    renameCategoryArea,
    renameUserCategory,
    setCategoryField,
    setCategoryKind,
    setCategoryLimit,
} from '../api';
import { useCategoryAreas } from '../hooks/useCategoryAreas';
import { useCategoryFields } from '../hooks/useCategoryFields';
import { useCategoryKinds } from '../hooks/useCategoryKinds';
import { useCategoryLimits } from '../hooks/useCategoryLimits';
import { useConfirmDelete } from '../hooks/useConfirmDelete';
import { CollapsibleSection } from '../components/ui/CollapsibleSection';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Spinner } from '../components/ui/Spinner';
import { AreaGroupHeader } from './category-kinds/AreaGroupHeader';
import { CategoryRow } from './category-kinds/CategoryRow';
import type { EditCategoryInput } from './category-kinds/EditCategoryDialog';
import { EditCategoryDialog } from './category-kinds/EditCategoryDialog';
import { EditAreaDialog } from './category-kinds/EditAreaDialog';
import { InlineNameForm } from './category-kinds/InlineNameForm';

/**
 * Секция «Настройки категорий» — плоский список категорий (сгруппированный по сфере
 * заголовками, как в MonthOverview) + отдельный список сфер как заголовков групп. Строка
 * категории показывает только название и сводку (тег/сфера/план) в одну строку; все
 * редактируемые поля — тег «постоянная/переменная/резерв» (для ExpenseKindSummary), сфера
 * (CategoryField — более абстрактная категория поверх категории пользователя, группирует
 * строки MonthOverview) и план на месяц (user_categories.month_limit_kopecks — столбцы
 * «План»/«% от плана» той же матрицы) — редактируются одной формой в попапе EditCategoryDialog
 * по кнопке «Изменить» (не инлайн построчно, как раньше). Список категорий для тега/плана —
 * useCategoryKinds(version)/useCategoryLimits(version) (все эффективные категории с расходом,
 * одинаковый набор); CategoryField можно задать только категориям пользователя
 * (useCategoryFields(version) — ровно то, что размечено в «Обзоре месяца»).
 *
 * «Новая категория» вверху — ЕДИНСТВЕННОЕ место в приложении, где заводится новая
 * user_categories.name (POST /api/categories, domain/categories.ts → createUserCategory).
 * Везде, где категория выбирается как ЦЕЛЬ (маппинги, мерчанты), это строгий select из уже
 * существующих — вписать новое имя прямо в том поле нельзя, сначала завести здесь.
 *
 * «Новая сфера» — аналогично, единственное место, где заводится НОВАЯ category_abstract
 * без привязки к конкретной категории (POST /api/categories/areas, useCategoryAreas(version));
 * переименование сферы — попап EditAreaDialog по кнопке «Изменить» в заголовке группы
 * (AreaGroupHeader), у сферы единственное редактируемое поле — имя.
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

    const [editingCategory, setEditingCategory] = useState<CategoryKindDto | null>(null);
    const [savingCategoryEdit, setSavingCategoryEdit] = useState(false);
    const [categoryEditError, setCategoryEditError] = useState<string | null>(null);
    const [editingArea, setEditingArea] = useState<string | null>(null);
    const [savingAreaEdit, setSavingAreaEdit] = useState(false);
    const [areaEditError, setAreaEditError] = useState<string | null>(null);
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

    const handleDeleteCategory = async (category: string): Promise<void> => {
        try {
            await deleteUserCategory(category);
            onDataChanged();
        } catch (e: unknown) {
            setError(apiErrorText(e, 'Не удалось удалить категорию'));
            throw e;
        }
    };

    const handleSaveCategoryEdit = async (input: EditCategoryInput): Promise<void> => {
        if (editingCategory === null) return;
        setSavingCategoryEdit(true);
        setCategoryEditError(null);
        try {
            const originalName = editingCategory.category;
            const targetName = input.name !== originalName ? input.name : originalName;
            if (input.name !== originalName) await renameUserCategory(originalName, input.name);
            await setCategoryField(targetName, input.field === '' ? null : input.field);
            await setCategoryKind(targetName, input.kind);
            await setCategoryLimit(targetName, input.limitKopecks);
            onDataChanged();
            setEditingCategory(null);
        } catch (e: unknown) {
            setCategoryEditError(apiErrorText(e, 'Не удалось сохранить категорию'));
        } finally {
            setSavingCategoryEdit(false);
        }
    };

    const handleSaveAreaEdit = async (newName: string): Promise<void> => {
        if (editingArea === null) return;
        setSavingAreaEdit(true);
        setAreaEditError(null);
        try {
            await renameCategoryArea(editingArea, newName);
            onDataChanged();
            setEditingArea(null);
        } catch (e: unknown) {
            setAreaEditError(apiErrorText(e, 'Не удалось переименовать сферу'));
        } finally {
            setSavingAreaEdit(false);
        }
    };

    const listLoading = kindsQuery.loading && kinds.length === 0;

    return (
        <CollapsibleSection title="Настройки категорий" defaultOpen={false}>
            <p className="muted" style={{ marginTop: -6, marginBottom: 12 }}>
                Кнопка «Изменить» у категории открывает попап с названием, сферой, тегом
                («постоянная/переменная/резерв» — определяет разбивку расходов на дашборде)
                и планом на месяц (столбцы «План»/«% от плана» в «Обзоре месяца»). Сфера —
                более абстрактная категория поверх категории пользователя (например «Еда и
                повседневное» объединяет несколько категорий, группирует строки в «Обзоре
                месяца») — выбирается из уже созданных сфер (заводится отдельно, полем «Новая
                сфера» ниже).
            </p>
            {error !== null && <ErrorBanner message={error} />}
            {kindsQuery.error !== null && <ErrorBanner message={kindsQuery.error} />}
            {fieldsQuery.error !== null && <ErrorBanner message={fieldsQuery.error} />}
            {limitsQuery.error !== null && <ErrorBanner message={limitsQuery.error} />}
            {areasQuery.error !== null && <ErrorBanner message={areasQuery.error} />}

            <div className="grid-2">
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
            </div>

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
                            <AreaGroupHeader
                                sphere={group.sphere}
                                onEdit={() => {
                                    if (group.sphere !== null) setEditingArea(group.sphere);
                                }}
                            />
                            {group.items.map((item) => (
                                <CategoryRow
                                    key={item.category}
                                    item={item}
                                    field={fieldByCategory.get(item.category) ?? ''}
                                    limitKopecks={limitByCategory.get(item.category) ?? null}
                                    deleteBusy={categoryDelete.busy}
                                    onEdit={() => setEditingCategory(item)}
                                    onRequestDelete={() => categoryDelete.requestDelete(item.category)}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            )}

            <EditCategoryDialog
                item={editingCategory}
                initialField={editingCategory !== null ? fieldByCategory.get(editingCategory.category) ?? '' : ''}
                initialLimitKopecks={editingCategory !== null ? limitByCategory.get(editingCategory.category) ?? null : null}
                areaOptions={areaOptions}
                saving={savingCategoryEdit}
                error={categoryEditError}
                onCancel={() => setEditingCategory(null)}
                onSave={(input) => void handleSaveCategoryEdit(input)}
            />

            <EditAreaDialog
                area={editingArea}
                saving={savingAreaEdit}
                error={areaEditError}
                onCancel={() => setEditingArea(null)}
                onSave={(newName) => void handleSaveAreaEdit(newName)}
            />

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
