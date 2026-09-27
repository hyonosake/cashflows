import { useState } from 'react';
import type { CategoryKind, CategoryKindDto } from '../../../../shared/types';
import { formatMoneyWhole } from '../../format';
import { PencilIcon } from '../../components/ui/PencilIcon';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { TrashIcon } from '../../components/ui/TrashIcon';

const KIND_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'fixed', label: 'Постоянная' },
    { value: 'variable', label: 'Переменная' },
    { value: 'reserve', label: 'Резерв' },
    { value: '', label: '— (не размечено)' },
];

interface Props {
    item: CategoryKindDto;
    renameBusy: boolean;
    onRename: (newName: string) => void;
    hasField: boolean;
    savedField: string;
    areaOptions: Array<{ value: string; label: string }>;
    fieldBusy: boolean;
    onSetField: (field: string) => void;
    savedLimit: number | null;
    limitDraft: string;
    limitChanged: boolean;
    limitBusy: boolean;
    onLimitDraftChange: (value: string) => void;
    onSaveLimit: () => void;
    kindBusy: boolean;
    onSetKind: (kind: CategoryKind | null) => void;
    deleteBusy: boolean;
    onRequestDelete: () => void;
}

/** Одна строка списка категорий: название (переименование) + тег + сфера + план на месяц + удаление. */
export function CategoryRow({
    item,
    renameBusy,
    onRename,
    hasField,
    savedField,
    areaOptions,
    fieldBusy,
    onSetField,
    savedLimit,
    limitDraft,
    limitChanged,
    limitBusy,
    onLimitDraftChange,
    onSaveLimit,
    kindBusy,
    onSetKind,
    deleteBusy,
    onRequestDelete,
}: Props): JSX.Element {
    const [editingName, setEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState(item.category);

    const startEditingName = (): void => {
        setNameDraft(item.category);
        setEditingName(true);
    };

    const submitRename = (): void => {
        const trimmed = nameDraft.trim();
        if (trimmed === '' || trimmed === item.category) {
            setEditingName(false);
            return;
        }
        onRename(trimmed);
    };

    return (
        <div className="entity-item">
            <div className="entity-main">
                {editingName ? (
                    <div className="category-field-row">
                        <input
                            className="input-control"
                            aria-label={`Новое имя категории ${item.category}`}
                            value={nameDraft}
                            disabled={renameBusy}
                            autoFocus
                            onChange={(e) => setNameDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') submitRename();
                                if (e.key === 'Escape') setEditingName(false);
                            }}
                        />
                        <button type="button" className="btn btn-small" disabled={renameBusy || nameDraft.trim() === ''} onClick={submitRename}>
                            Сохранить
                        </button>
                        <button type="button" className="btn btn-small" disabled={renameBusy} onClick={() => setEditingName(false)}>
                            Отмена
                        </button>
                    </div>
                ) : (
                    <div className="entity-title-row">
                        <span className="entity-title">{item.category}</span>
                        <button
                            type="button"
                            className="btn btn-icon"
                            onClick={startEditingName}
                            aria-label={`Переименовать категорию ${item.category}`}
                            title="Переименовать категорию"
                        >
                            <PencilIcon />
                        </button>
                    </div>
                )}
                {hasField && (
                    <div className="category-field-row">
                        <SearchableSelect
                            value={savedField}
                            options={areaOptions}
                            disabled={fieldBusy}
                            aria-label={`Сфера категории ${item.category}`}
                            onChange={onSetField}
                        />
                    </div>
                )}
                <div className="category-field-row">
                    <input
                        className="input-control"
                        placeholder="План на месяц, ₽ (напр. «15000»)"
                        value={limitDraft}
                        disabled={limitBusy}
                        onChange={(e) => onLimitDraftChange(e.target.value)}
                    />
                    {limitChanged && (
                        <button type="button" className="btn btn-small" disabled={limitBusy} onClick={onSaveLimit}>
                            Сохранить
                        </button>
                    )}
                    {savedLimit !== null && !limitChanged && <span className="muted">{formatMoneyWhole(savedLimit)}/мес</span>}
                </div>
            </div>
            <div className="entity-actions">
                <SearchableSelect
                    value={item.kind ?? ''}
                    options={KIND_OPTIONS}
                    disabled={kindBusy}
                    aria-label={`Тег категории ${item.category}`}
                    onChange={(next) => onSetKind(next === '' ? null : (next as CategoryKind))}
                />
                <button
                    type="button"
                    className="btn btn-icon btn-danger"
                    disabled={deleteBusy}
                    onClick={onRequestDelete}
                    aria-label={`Удалить категорию ${item.category}`}
                    title="Удалить категорию"
                >
                    <TrashIcon />
                </button>
            </div>
        </div>
    );
}
