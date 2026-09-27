import { useMemo, useState } from 'react';
import { apiErrorText, createCustomMapping, createMcMapping, deleteCustomMapping, deleteMcMapping } from '../api';
import { useCategoryFields } from '../hooks/useCategoryFields';
import { useMcMappings } from '../hooks/useMcMappings';
import { useMccOptions } from '../hooks/useMccOptions';
import { useCustomMappings } from '../hooks/useCustomMappings';
import { CollapsibleSection } from '../components/ui/CollapsibleSection';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { Spinner } from '../components/ui/Spinner';
import { categoryOptionLabel } from '../format';

/**
 * Секция «Настройки» — «Специальные правила категоризации»: два правила ПОМИМО мерчанта
 * (см. MerchantsSection — самое частое, обычное правило категоризации, редактируется на
 * отдельной вкладке, не здесь). Порядок применения при разрешении эффективной категории
 * (operations_effective, db.ts — живой JOIN, правило действует сразу, пересчёт не нужен),
 * сверху вниз — приоритет:
 *   1. разовый override операции (вне этой секции — PUT /api/operations/:id/category);
 *   2. подстрока в «Сообщении» перевода → категория (custom_mappings) — секция ниже;
 *   3. мерчант целиком → категория (MerchantsSection, отдельная вкладка) — между этой
 *      секцией и MCC, здесь не редактируется;
 *   4. MCC-код (банковский код операции) → категория (mcc_mappings) — самый общий
 *      запасной вариант, применяется, только если 1–3 не сработали.
 * Секции ниже расположены в этом же порядке (сообщение → MCC), а не как раньше (MCC первым),
 * чтобы порядок в UI совпадал с порядком применения; правило на мерчанта (шаг 3) в этом
 * списке физически пропущено — раньше здесь была поясняющая заметка «2. …», её убрали как
 * шум (мерчант — не «специальное» правило, а основной путь, объяснён в MerchantsSection).
 *
 * Целевая категория ОБОИХ правил — строгий select из useCategoryFields(version) (тот же набор
 * категорий, что и useCategories(version, 'user') у MerchantsSection/CreateRuleDialog, но сразу
 * со сферой каждой категории — подпись варианта дополняется сферой, например «Психолог (Сима)»,
 * иначе похожие по названию категории неразличимы в списке), не свободный текст: опечатка
 * в имени категории создавала бы «висячее» правило на несуществующую категорию. Создание
 * НОВОЙ категории — отдельная настройка (CategoryKindsSection → «Новая категория»), не через
 * это поле.
 */

interface Props {
    version: number;
    onDataChanged: () => void;
}

export function MappingsSection({ version, onDataChanged }: Props): JSX.Element {
    const mcQuery = useMcMappings(version);
    const mcMappings = mcQuery.data ?? [];
    const mcOptionsQuery = useMccOptions(version);
    const mcOptions = mcOptionsQuery.data ?? [];
    const customQuery = useCustomMappings(version);
    const customMappings = customQuery.data ?? [];
    const categoryFieldsQuery = useCategoryFields(version);
    const categoryFields = categoryFieldsQuery.data ?? [];
    const categories = useMemo(() => categoryFields.map((f) => f.category), [categoryFields]);
    const sphereByCategory = useMemo(() => new Map(categoryFields.map((f) => [f.category, f.field])), [categoryFields]);

    const [mccForm, setMccForm] = useState({ mcc: '', targetCategory: '' });
    const [customForm, setCustomForm] = useState({ matchValue: '', targetCategory: '' });
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [pendingDeleteMcc, setPendingDeleteMcc] = useState<string | null>(null);
    const [pendingDeleteCustomId, setPendingDeleteCustomId] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);

    const saveMcc = async (): Promise<void> => {
        if (mccForm.mcc.trim() === '' || mccForm.targetCategory.trim() === '') {
            setError('Заполните MCC-код и целевую категорию');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await createMcMapping({ mcc: mccForm.mcc.trim(), targetCategory: mccForm.targetCategory.trim() });
            setMccForm({ mcc: '', targetCategory: '' });
            onDataChanged();
        } catch (e: unknown) {
            setError(apiErrorText(e));
        } finally {
            setSaving(false);
        }
    };

    const saveCustom = async (): Promise<void> => {
        if (customForm.matchValue.trim() === '' || customForm.targetCategory.trim() === '') {
            setError('Заполните подстроку и целевую категорию');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await createCustomMapping({ matchValue: customForm.matchValue.trim(), targetCategory: customForm.targetCategory.trim() });
            setCustomForm({ matchValue: '', targetCategory: '' });
            onDataChanged();
        } catch (e: unknown) {
            setError(apiErrorText(e));
        } finally {
            setSaving(false);
        }
    };

    const removeMcc = async (mcc: string): Promise<void> => {
        setPendingDeleteMcc(null);
        setBusy(true);
        setError(null);
        try {
            await deleteMcMapping(mcc);
            onDataChanged();
        } catch (e: unknown) {
            setError(apiErrorText(e));
        } finally {
            setBusy(false);
        }
    };

    const removeCustom = async (id: number): Promise<void> => {
        setPendingDeleteCustomId(null);
        setBusy(true);
        setError(null);
        try {
            await deleteCustomMapping(id);
            onDataChanged();
        } catch (e: unknown) {
            setError(apiErrorText(e));
        } finally {
            setBusy(false);
        }
    };

    const exampleByMcc = new Map(mcOptions.map((o) => [o.mcc, o.examples]));

    return (
        <CollapsibleSection title="Специальные правила категоризации" defaultOpen={false}>
            {error !== null && <ErrorBanner message={error} />}

            <h3>1. По сообщению перевода</h3>
            <p className="muted" style={{ marginTop: -6, marginBottom: 12 }}>
                Подстрока в «Сообщении» — например, по имени конкретного отправителя. Проверяется
                первым, до мерчанта и MCC.
            </p>
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    void saveCustom();
                }}
            >
                <div className="form-grid">
                    <div className="field">
                        <label htmlFor="custom-value">Подстрока в сообщении</label>
                        <input
                            id="custom-value"
                            value={customForm.matchValue}
                            onChange={(e) => setCustomForm({ ...customForm, matchValue: e.target.value })}
                            placeholder="за занятия"
                        />
                    </div>
                    <div className="field">
                        <label htmlFor="custom-target">Целевая категория</label>
                        <SearchableSelect
                            id="custom-target"
                            value={customForm.targetCategory}
                            onChange={(next) => setCustomForm({ ...customForm, targetCategory: next })}
                            options={[
                                { value: '', label: 'Выберите категорию…' },
                                ...categories.map((c) => ({ value: c, label: categoryOptionLabel(c, sphereByCategory.get(c)) })),
                            ]}
                        />
                    </div>
                </div>
                <div className="form-actions">
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                        Добавить правило
                    </button>
                </div>
            </form>
            {categoryFieldsQuery.error !== null && <ErrorBanner message={categoryFieldsQuery.error} />}
            {customQuery.error !== null && <ErrorBanner message={customQuery.error} />}
            {customQuery.loading && customMappings.length === 0 ? (
                <div className="state-box">
                    <Spinner />
                </div>
            ) : (
                <div className="entity-list">
                    {customMappings.length === 0 && <p className="empty">Правил по сообщению пока нет.</p>}
                    {customMappings.map((m) => (
                        <div className="entity-item" key={m.id}>
                            <div className="entity-main">
                                <div className="entity-title">{m.targetCategory}</div>
                                <div className="entity-sub">содержит «{m.matchValue}»</div>
                            </div>
                            <div className="entity-actions">
                                <button
                                    type="button"
                                    className="btn btn-small btn-danger"
                                    disabled={busy}
                                    onClick={() => setPendingDeleteCustomId(m.id)}
                                >
                                    Удалить
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <h3>2. По MCC-коду</h3>
            <p className="muted" style={{ marginTop: -6, marginBottom: 12 }}>
                Банковский код операции (объективный, но общий на много разных мерчантов) —
                самый общий запасной вариант, срабатывает, только если не подошли ни правило
                по сообщению выше, ни правило на мерчанта (вкладка «Мерчанты»). Код
                выбирается из реально встречавшихся в ваших операциях — вслепую по памяти
                вводить его бессмысленно, поэтому выбор строится по примерам названий,
                которые уже были под этим кодом.
            </p>
            {mcOptionsQuery.error !== null && <ErrorBanner message={mcOptionsQuery.error} />}
            {mcOptions.length === 0 && !mcOptionsQuery.loading ? (
                <p className="empty">
                    В операциях пока нет MCC-кодов — сначала импортируйте CSV, тогда здесь появятся коды с примерами
                    мерчантов для выбора.
                </p>
            ) : (
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        void saveMcc();
                    }}
                >
                    <div className="form-grid">
                        <div className="field">
                            <label htmlFor="mcc-value">MCC (по примеру мерчанта)</label>
                            <SearchableSelect
                                id="mcc-value"
                                value={mccForm.mcc}
                                onChange={(next) => setMccForm({ ...mccForm, mcc: next })}
                                options={[
                                    { value: '', label: 'Выберите код…' },
                                    ...mcOptions.map((opt) => ({
                                        value: opt.mcc,
                                        label: `${opt.mcc} — ${opt.examples.join(', ') || 'без примера'} (${opt.operationsCount})`,
                                    })),
                                ]}
                            />
                        </div>
                        <div className="field">
                            <label htmlFor="mcc-target">Целевая категория</label>
                            <SearchableSelect
                                id="mcc-target"
                                value={mccForm.targetCategory}
                                onChange={(next) => setMccForm({ ...mccForm, targetCategory: next })}
                                options={[
                                    { value: '', label: 'Выберите категорию…' },
                                    ...categories.map((c) => ({ value: c, label: categoryOptionLabel(c, sphereByCategory.get(c)) })),
                                ]}
                            />
                        </div>
                    </div>
                    <div className="form-actions">
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            Добавить правило
                        </button>
                    </div>
                </form>
            )}
            {mcQuery.error !== null && <ErrorBanner message={mcQuery.error} />}
            {mcQuery.loading && mcMappings.length === 0 ? (
                <div className="state-box">
                    <Spinner />
                </div>
            ) : (
                <div className="entity-list">
                    {mcMappings.length === 0 && <p className="empty">Правил по MCC пока нет.</p>}
                    {mcMappings.map((m) => {
                        const examples = exampleByMcc.get(m.mcc) ?? [];
                        return (
                            <div className="entity-item" key={m.mcc}>
                                <div className="entity-main">
                                    <div className="entity-title">{m.targetCategory}</div>
                                    <div className="entity-sub">
                                        MCC {m.mcc}
                                        {examples.length > 0 && <> — например «{examples[0]}»</>}
                                    </div>
                                </div>
                                <div className="entity-actions">
                                    <button
                                        type="button"
                                        className="btn btn-small btn-danger"
                                        disabled={busy}
                                        onClick={() => setPendingDeleteMcc(m.mcc)}
                                    >
                                        Удалить
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <ConfirmDialog
                open={pendingDeleteMcc !== null}
                title={`Удалить правило MCC ${pendingDeleteMcc ?? ''}?`}
                confirmLabel="Удалить"
                busy={busy}
                onCancel={() => setPendingDeleteMcc(null)}
                onConfirm={() => {
                    if (pendingDeleteMcc !== null) void removeMcc(pendingDeleteMcc);
                }}
            />
            <ConfirmDialog
                open={pendingDeleteCustomId !== null}
                title="Удалить правило по сообщению?"
                confirmLabel="Удалить"
                busy={busy}
                onCancel={() => setPendingDeleteCustomId(null)}
                onConfirm={() => {
                    if (pendingDeleteCustomId !== null) void removeCustom(pendingDeleteCustomId);
                }}
            />
        </CollapsibleSection>
    );
}
