import type { OperationType } from '../../../shared/types';
import { todayIso } from '../periods';
import { CategorySelect } from './CategorySelect';
import { SearchableSelect } from './ui/SearchableSelect';

/**
 * Панель фильтров страницы «Операции»: период (даты по Москве), категория,
 * тип, поиск и чекбокс «только аналитика». Значения `from`/`to` — строки
 * YYYY-MM-DD или '' (не задано). Кнопка «Применить» фиксирует черновик фильтров.
 */

export interface OperationsFilterState {
    from: string;
    to: string;
    category: string;
    type: '' | OperationType;
    q: string;
    analyticsOnly: boolean;
}

interface Props {
    filters: OperationsFilterState;
    categories: string[];
    /** Сфера (category_abstract) каждой категории — дополняет подпись варианта («Психолог (Сима)»),
     * иначе похожие по названию категории неразличимы в списке. */
    categorySpheres: Map<string, string | null>;
    onChange: (next: OperationsFilterState) => void;
    onApply: () => void;
    onReset: () => void;
}

export function OperationsFiltersBar({ filters, categories, categorySpheres, onChange, onApply, onReset }: Props): JSX.Element {
    return (
        <div className="filters-row">
            <div className="field">
                <label htmlFor="ops-from">Период с</label>
                <input
                    id="ops-from"
                    type="date"
                    value={filters.from}
                    onChange={(e) => onChange({ ...filters, from: e.target.value })}
                />
            </div>
            <div className="field">
                <label htmlFor="ops-to">по</label>
                <input
                    id="ops-to"
                    type="date"
                    value={filters.to}
                    max={todayIso()}
                    onChange={(e) => onChange({ ...filters, to: e.target.value })}
                />
            </div>
            <div className="field">
                <label htmlFor="ops-category">Категория</label>
                <CategorySelect
                    id="ops-category"
                    value={filters.category}
                    onChange={(next) => onChange({ ...filters, category: next })}
                    categories={categories}
                    categorySpheres={categorySpheres}
                    placeholder="Все категории"
                />
            </div>
            <div className="field">
                <label htmlFor="ops-type">Тип</label>
                <SearchableSelect
                    id="ops-type"
                    value={filters.type}
                    onChange={(next) => onChange({ ...filters, type: next as '' | OperationType })}
                    options={[
                        { value: '', label: 'Все' },
                        { value: 'income', label: 'Доходы' },
                        { value: 'expense', label: 'Расходы' },
                    ]}
                />
            </div>
            <div className="field">
                <label htmlFor="ops-q">Поиск (описание/счёт)</label>
                <input
                    id="ops-q"
                    type="search"
                    placeholder="подстрока…"
                    value={filters.q}
                    onChange={(e) => onChange({ ...filters, q: e.target.value })}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') onApply();
                    }}
                />
            </div>
            <div className="field">
                <label>Фильтры</label>
                <div className="form-actions">
                    <label className="checkbox-row">
                        <input
                            type="checkbox"
                            checked={filters.analyticsOnly}
                            onChange={(e) => onChange({ ...filters, analyticsOnly: e.target.checked })}
                        />
                        только аналитика
                    </label>
                    <button type="button" className="btn btn-primary" onClick={onApply}>
                        Применить
                    </button>
                    <button type="button" className="btn" onClick={onReset}>
                        Сбросить
                    </button>
                </div>
            </div>
        </div>
    );
}
