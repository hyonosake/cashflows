import type { ReactNode } from 'react';
import { CategorySelect } from '../../components/CategorySelect';

interface Props {
    /** Первое поле формы — свободный текст (по сообщению) или SearchableSelect по MCC-коду. */
    children: ReactNode;
    targetCategoryId: string;
    targetCategory: string;
    onTargetCategoryChange: (value: string) => void;
    categories: string[];
    categorySpheres: Map<string, string | null | undefined>;
    submitting: boolean;
    onSubmit: () => void;
}

/** Общая часть формы «правило категоризации»: варьируется только первое поле (children). */
export function MappingRuleForm({
    children,
    targetCategoryId,
    targetCategory,
    onTargetCategoryChange,
    categories,
    categorySpheres,
    submitting,
    onSubmit,
}: Props): JSX.Element {
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                onSubmit();
            }}
        >
            <div className="form-grid">
                {children}
                <div className="field">
                    <label htmlFor={targetCategoryId}>Целевая категория</label>
                    <CategorySelect
                        id={targetCategoryId}
                        value={targetCategory}
                        onChange={onTargetCategoryChange}
                        categories={categories}
                        categorySpheres={categorySpheres}
                        placeholder="Выберите категорию…"
                    />
                </div>
            </div>
            <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                    Добавить правило
                </button>
            </div>
        </form>
    );
}
