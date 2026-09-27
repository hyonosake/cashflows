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
import { formatMoneyWhole, kopecksToRublesInput, parseRublesToKopecks } from '../format';
import { useCategoryAreas } from '../hooks/useCategoryAreas';
import { useCategoryFields } from '../hooks/useCategoryFields';
import { useCategoryKinds } from '../hooks/useCategoryKinds';
import { useCategoryLimits } from '../hooks/useCategoryLimits';
import { CollapsibleSection } from '../components/ui/CollapsibleSection';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { Spinner } from '../components/ui/Spinner';

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

const OPTIONS: Array<{ value: CategoryKind | null; label: string }> = [
    { value: 'fixed', label: 'Постоянная' },
    { value: 'variable', label: 'Переменная' },
    { value: 'reserve', label: 'Резерв' },
    { value: null, label: '—' },
];

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
    const [pendingDeleteCategory, setPendingDeleteCategory] = useState<string | null>(null);
    const [deletingCategory, setDeletingCategory] = useState(false);
    const [error, setError] = useState<string | null>(null);

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

    const handleSet = async (category: string, kind: CategoryKind | null): Promise<void> => {
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
        setDeletingCategory(true);
        setError(null);
        try {
            await deleteUserCategory(category);
            setPendingDeleteCategory(null);
            onDataChanged();
        } catch (e: unknown) {
            setError(apiErrorText(e, 'Не удалось удалить категорию'));
        } finally {
            setDeletingCategory(false);
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

            <form
                className="form-grid"
                style={{ marginBottom: 16, alignItems: 'end' }}
                onSubmit={(e) => {
                    e.preventDefault();
                    void handleCreateCategory();
                }}
            >
                <div className="field">
                    <label htmlFor="new-category-name">Новая категория</label>
                    <input
                        id="new-category-name"
                        className="input-control"
                        value={newCategoryName}
                        disabled={creatingCategory}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="Например «Подарки»"
                    />
                </div>
                <button type="submit" className="btn btn-primary" disabled={creatingCategory}>
                    Добавить категорию
                </button>
            </form>

            <form
                className="form-grid"
                style={{ marginBottom: 16, alignItems: 'end' }}
                onSubmit={(e) => {
                    e.preventDefault();
                    void handleCreateArea();
                }}
            >
                <div className="field">
                    <label htmlFor="new-area-name">Новая сфера</label>
                    <input
                        id="new-area-name"
                        className="input-control"
                        value={newAreaName}
                        disabled={creatingArea}
                        onChange={(e) => setNewAreaName(e.target.value)}
                        placeholder="Например «Еда и повседневное»"
                    />
                </div>
                <button type="submit" className="btn btn-primary" disabled={creatingArea}>
                    Добавить сферу
                </button>
            </form>

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
                                    <div className="entity-item" key={item.category}>
                                        <div className="entity-main">
                                            <div className="entity-title">{item.category}</div>
                                            {hasField && (
                                                <div className="category-field-row">
                                                    <SearchableSelect
                                                        value={savedField ?? ''}
                                                        options={areaOptions}
                                                        disabled={busyFieldCategory === item.category}
                                                        aria-label={`Сфера категории ${item.category}`}
                                                        onChange={(next) => void handleSetField(item.category, next)}
                                                    />
                                                </div>
                                            )}
                                            <div className="category-field-row">
                                                <input
                                                    className="input-control"
                                                    placeholder="План на месяц, ₽ (напр. «15000»)"
                                                    value={limitDraft}
                                                    disabled={busyLimitCategory === item.category}
                                                    onChange={(e) =>
                                                        setLimitDrafts((prev) => ({ ...prev, [item.category]: e.target.value }))
                                                    }
                                                />
                                                {limitChanged && (
                                                    <button
                                                        type="button"
                                                        className="btn btn-small"
                                                        disabled={busyLimitCategory === item.category}
                                                        onClick={() => void handleSaveLimit(item.category)}
                                                    >
                                                        Сохранить
                                                    </button>
                                                )}
                                                {savedLimit !== null && !limitChanged && (
                                                    <span className="muted">{formatMoneyWhole(savedLimit)}/мес</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="entity-actions">
                                            {OPTIONS.map((option) => (
                                                <button
                                                    key={option.label}
                                                    type="button"
                                                    className={`btn btn-small${item.kind === option.value ? ' btn-primary' : ''}`}
                                                    disabled={busyCategory === item.category}
                                                    onClick={() => void handleSet(item.category, option.value)}
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                            <button
                                                type="button"
                                                className="btn btn-small btn-danger"
                                                disabled={deletingCategory}
                                                onClick={() => setPendingDeleteCategory(item.category)}
                                            >
                                                Удалить
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}

            <ConfirmDialog
                open={pendingDeleteCategory !== null}
                title={`Удалить категорию «${pendingDeleteCategory ?? ''}»?`}
                description="Операции, мерчанты и правила (MCC/сообщение), ссылавшиеся только на эту категорию, станут «Без категории». Действие необратимо."
                confirmLabel="Удалить"
                busy={deletingCategory}
                onCancel={() => setPendingDeleteCategory(null)}
                onConfirm={() => {
                    if (pendingDeleteCategory !== null) void handleDeleteCategory(pendingDeleteCategory);
                }}
            />
        </CollapsibleSection>
    );
}
