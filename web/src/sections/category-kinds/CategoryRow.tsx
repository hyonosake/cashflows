import type { CategoryKind, CategoryKindDto } from '../../../../shared/types';
import { formatMoneyWhole } from '../../format';
import { SearchableSelect } from '../../components/ui/SearchableSelect';

const KIND_OPTIONS: Array<{ value: CategoryKind | null; label: string }> = [
    { value: 'fixed', label: 'Постоянная' },
    { value: 'variable', label: 'Переменная' },
    { value: 'reserve', label: 'Резерв' },
    { value: null, label: '—' },
];

interface Props {
    item: CategoryKindDto;
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

/** Одна строка списка категорий: тег постоянная/переменная/резерв + сфера + план на месяц + удаление. */
export function CategoryRow({
    item,
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
    return (
        <div className="entity-item">
            <div className="entity-main">
                <div className="entity-title">{item.category}</div>
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
                {KIND_OPTIONS.map((option) => (
                    <button
                        key={option.label}
                        type="button"
                        className={`btn btn-small${item.kind === option.value ? ' btn-primary' : ''}`}
                        disabled={kindBusy}
                        onClick={() => onSetKind(option.value)}
                    >
                        {option.label}
                    </button>
                ))}
                <button type="button" className="btn btn-small btn-danger" disabled={deleteBusy} onClick={onRequestDelete}>
                    Удалить
                </button>
            </div>
        </div>
    );
}
