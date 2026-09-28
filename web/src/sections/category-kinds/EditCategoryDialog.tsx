import { useEffect, useState } from 'react';
import type { CategoryKind, CategoryKindDto } from '../../../../shared/types';
import { kopecksToRublesInput, parseRublesToKopecks } from '../../format';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { SearchableSelect } from '../../components/ui/SearchableSelect';

const KIND_OPTIONS: Array<{ value: string; label: string }> = [
    { value: '', label: '— (не размечено)' },
    { value: 'fixed', label: 'Постоянная' },
    { value: 'variable', label: 'Переменная' },
    { value: 'reserve', label: 'Резерв' },
];

export interface EditCategoryInput {
    name: string;
    field: string; // '' — без сферы
    kind: CategoryKind | null;
    limitKopecks: number | null;
}

interface Props {
    item: CategoryKindDto | null; // null — диалог закрыт
    initialField: string;
    initialLimitKopecks: number | null;
    areaOptions: Array<{ value: string; label: string }>;
    saving: boolean;
    error: string | null;
    onCancel: () => void;
    onSave: (input: EditCategoryInput) => void;
}

/**
 * Попап «Изменить категорию» — единственное место редактирования категории: имя, сфера, тег
 * (fixed/variable/reserve) и план на месяц одной формой, вместо построчных инлайн-контролов
 * в списке (CategoryRow — теперь только название + сводка + кнопки «Изменить»/«Удалить»).
 * `.modal-wide` (не узкий `.modal` по умолчанию, как у ConfirmDialog) — четыре поля помещаются
 * в один ряд `.form-grid`, не переносятся друг под друга и не обрезают длинное название категории.
 */
export function EditCategoryDialog({
    item,
    initialField,
    initialLimitKopecks,
    areaOptions,
    saving,
    error,
    onCancel,
    onSave,
}: Props): JSX.Element | null {
    const [name, setName] = useState('');
    const [field, setField] = useState('');
    const [kind, setKind] = useState<string>('');
    const [limitDraft, setLimitDraft] = useState('');
    const [localError, setLocalError] = useState<string | null>(null);

    useEffect(() => {
        if (item === null) return;
        setName(item.category);
        setField(initialField);
        setKind(item.kind ?? '');
        setLimitDraft(initialLimitKopecks === null ? '' : kopecksToRublesInput(initialLimitKopecks));
        setLocalError(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item]);

    useEffect(() => {
        if (item === null) return;
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key === 'Escape' && !saving) onCancel();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [item, saving, onCancel]);

    if (item === null) return null;

    const submit = (): void => {
        const trimmedName = name.trim();
        if (trimmedName === '') {
            setLocalError('Введите название категории');
            return;
        }
        const trimmedLimit = limitDraft.trim();
        let limitKopecks: number | null = null;
        if (trimmedLimit !== '') {
            limitKopecks = parseRublesToKopecks(trimmedLimit);
            if (limitKopecks === null || limitKopecks <= 0) {
                setLocalError('План должен быть положительным числом, например «15000»');
                return;
            }
        }
        setLocalError(null);
        onSave({ name: trimmedName, field, kind: kind === '' ? null : (kind as CategoryKind), limitKopecks });
    };

    return (
        <div
            className="modal-overlay"
            role="presentation"
            onClick={() => {
                if (!saving) onCancel();
            }}
        >
            <div
                className="modal modal-wide"
                role="dialog"
                aria-modal="true"
                aria-label={`Изменить категорию ${item.category}`}
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="modal-title">Изменить категорию</h3>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        submit();
                    }}
                >
                    <div className="form-grid">
                        <div className="field">
                            <label htmlFor="edit-category-name">Название</label>
                            <input
                                id="edit-category-name"
                                className="input-control"
                                value={name}
                                disabled={saving}
                                autoFocus
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>
                        <div className="field">
                            <label htmlFor="edit-category-field">Сфера</label>
                            <SearchableSelect
                                id="edit-category-field"
                                value={field}
                                options={areaOptions}
                                disabled={saving}
                                onChange={setField}
                            />
                        </div>
                        <div className="field">
                            <label htmlFor="edit-category-kind">Тег</label>
                            <SearchableSelect
                                id="edit-category-kind"
                                value={kind}
                                options={KIND_OPTIONS}
                                disabled={saving}
                                onChange={setKind}
                            />
                        </div>
                        <div className="field">
                            <label htmlFor="edit-category-limit">План на месяц, ₽</label>
                            <input
                                id="edit-category-limit"
                                className="input-control"
                                placeholder="Например «15000»"
                                value={limitDraft}
                                disabled={saving}
                                onChange={(e) => setLimitDraft(e.target.value)}
                            />
                        </div>
                    </div>
                    {(localError ?? error) !== null && <ErrorBanner message={(localError ?? error) as string} />}
                    <div className="modal-actions">
                        <button type="button" className="btn" onClick={onCancel} disabled={saving}>
                            Отмена
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? 'Сохраняю…' : 'Сохранить'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
