import { useMemo, useState } from 'react';
import { apiErrorText, createCustomMapping, createMcMapping, deleteCustomMapping, deleteMcMapping } from '../api';
import { useCategoryFields } from '../hooks/useCategoryFields';
import { useConfirmDelete } from '../hooks/useConfirmDelete';
import { useMcMappings } from '../hooks/useMcMappings';
import { useMccOptions } from '../hooks/useMccOptions';
import { useCustomMappings } from '../hooks/useCustomMappings';
import { CategorySelect } from '../components/CategorySelect';
import { CollapsibleSection } from '../components/ui/CollapsibleSection';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { MappingRuleForm } from './mappings/MappingRuleForm';
import { MappingRuleList } from './mappings/MappingRuleList';

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
    const mccDelete = useConfirmDelete<string>();
    const customDelete = useConfirmDelete<number>();

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
        try {
            await deleteMcMapping(mcc);
            onDataChanged();
        } catch (e: unknown) {
            setError(apiErrorText(e));
            throw e;
        }
    };

    const removeCustom = async (id: number): Promise<void> => {
        try {
            await deleteCustomMapping(id);
            onDataChanged();
        } catch (e: unknown) {
            setError(apiErrorText(e));
            throw e;
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
            <MappingRuleForm
                targetCategoryId="custom-target"
                targetCategory={customForm.targetCategory}
                onTargetCategoryChange={(next) => setCustomForm({ ...customForm, targetCategory: next })}
                categories={categories}
                categorySpheres={sphereByCategory}
                submitting={saving}
                onSubmit={() => void saveCustom()}
            >
                <div className="field">
                    <label htmlFor="custom-value">Подстрока в сообщении</label>
                    <input
                        id="custom-value"
                        value={customForm.matchValue}
                        onChange={(e) => setCustomForm({ ...customForm, matchValue: e.target.value })}
                        placeholder="за занятия"
                    />
                </div>
            </MappingRuleForm>
            {categoryFieldsQuery.error !== null && <ErrorBanner message={categoryFieldsQuery.error} />}
            {customQuery.error !== null && <ErrorBanner message={customQuery.error} />}
            <MappingRuleList
                rows={customMappings.map((m) => ({ key: m.id, title: m.targetCategory, subtitle: <>содержит «{m.matchValue}»</> }))}
                loading={customQuery.loading}
                emptyLabel="Правил по сообщению пока нет."
                deleteBusy={customDelete.busy}
                onRequestDelete={customDelete.requestDelete}
            />

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
                <MappingRuleForm
                    targetCategoryId="mcc-target"
                    targetCategory={mccForm.targetCategory}
                    onTargetCategoryChange={(next) => setMccForm({ ...mccForm, targetCategory: next })}
                    categories={categories}
                    categorySpheres={sphereByCategory}
                    submitting={saving}
                    onSubmit={() => void saveMcc()}
                >
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
                </MappingRuleForm>
            )}
            {mcQuery.error !== null && <ErrorBanner message={mcQuery.error} />}
            <MappingRuleList
                rows={mcMappings.map((m) => {
                    const examples = exampleByMcc.get(m.mcc) ?? [];
                    return {
                        key: m.mcc,
                        title: m.targetCategory,
                        subtitle: (
                            <>
                                MCC {m.mcc}
                                {examples.length > 0 && <> — например «{examples[0]}»</>}
                            </>
                        ),
                    };
                })}
                loading={mcQuery.loading}
                emptyLabel="Правил по MCC пока нет."
                deleteBusy={mccDelete.busy}
                onRequestDelete={mccDelete.requestDelete}
            />

            <ConfirmDialog
                open={mccDelete.pending !== null}
                title={`Удалить правило MCC ${mccDelete.pending ?? ''}?`}
                confirmLabel="Удалить"
                busy={mccDelete.busy}
                onCancel={mccDelete.cancel}
                onConfirm={() => void mccDelete.confirm(removeMcc)}
            />
            <ConfirmDialog
                open={customDelete.pending !== null}
                title="Удалить правило по сообщению?"
                confirmLabel="Удалить"
                busy={customDelete.busy}
                onCancel={customDelete.cancel}
                onConfirm={() => void customDelete.confirm(removeCustom)}
            />
        </CollapsibleSection>
    );
}
