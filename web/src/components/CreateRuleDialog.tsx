import { useEffect, useState } from 'react';
import type { OperationDto } from '../../../shared/types';
import { CategorySelect } from './CategorySelect';
import { ErrorBanner } from './ui/ErrorBanner';
import { SearchableSelect } from './ui/SearchableSelect';

/**
 * Модалка «Изменить категорию операции» (страница «Операции»): два режима, переключаемые
 * чекбоксом «Использовать и для прошлых, и для будущих операций»:
 * - включён (по умолчанию) — заводит правило, глядя на конкретную операцию: «Мерчант целиком»
 *   (merchants.user_category_id — самый частый случай), «MCC-код» (mcc_mappings) или
 *   «Комментарий содержит» (custom_mappings). Живой JOIN — применяется сразу, без пересчёта;
 * - выключен — правило НЕ создаётся, категория проставляется только этой одной операции
 *   (`PUT /api/operations/:id/category`, разовый override — высший приоритет).
 */

export type RuleMatchType = 'merchant' | 'mcc' | 'message';

export type CreateRuleInput =
    | { kind: 'merchant'; merchant: string; targetCategory: string }
    | { kind: 'mcc'; mcc: string; targetCategory: string }
    | { kind: 'message'; matchValue: string; targetCategory: string };

const MATCH_TYPE_LABELS: Record<RuleMatchType, string> = {
    merchant: 'Мерчант (описание) целиком',
    mcc: 'MCC-код',
    message: 'Комментарий содержит',
};

interface Props {
    operation: OperationDto | null;
    categories: string[];
    /** Сфера (category_abstract) каждой категории — дополняет подпись варианта («Психолог (Сима)»),
     * иначе похожие по названию категории неразличимы в списке. */
    categorySpheres: Map<string, string | null>;
    saving: boolean;
    error: string | null;
    onCancel: () => void;
    onSave: (input: CreateRuleInput) => void;
    onSaveOnce: (categoryUser: string) => void;
}

function suggestedValue(matchType: RuleMatchType, operation: OperationDto): string {
    if (matchType === 'mcc') return operation.mcc ?? '';
    if (matchType === 'message') return operation.message;
    return operation.description;
}

export function CreateRuleDialog({
    operation,
    categories,
    categorySpheres,
    saving,
    error,
    onCancel,
    onSave,
    onSaveOnce,
}: Props): JSX.Element | null {
    const [matchType, setMatchType] = useState<RuleMatchType>('merchant');
    const [matchValue, setMatchValue] = useState('');
    const [targetCategory, setTargetCategory] = useState('');
    const [applyToAll, setApplyToAll] = useState(true);

    // Форма переинициализируется при выборе новой операции (переход к другому id).
    useEffect(() => {
        if (operation === null) return;
        setMatchType('merchant');
        setMatchValue(suggestedValue('merchant', operation));
        setTargetCategory(operation.category);
        setApplyToAll(true);
    }, [operation]);

    useEffect(() => {
        if (operation === null) return;
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key === 'Escape' && !saving) onCancel();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [operation, saving, onCancel]);

    if (operation === null) return null;

    const changeMatchType = (next: RuleMatchType): void => {
        setMatchType(next);
        setMatchValue(suggestedValue(next, operation));
    };

    const mccDisabled = operation.mcc === null;
    const messageDisabled = operation.message.trim() === '';
    const canSave = targetCategory.trim() !== '' && !saving && (!applyToAll || matchValue.trim() !== '');

    return (
        <div
            className="modal-overlay"
            role="presentation"
            onClick={() => {
                if (!saving) onCancel();
            }}
        >
            <div
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-label="Изменить категорию операции"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="modal-title">
                    {applyToAll ? 'Создать правило из операции' : 'Изменить категорию этой операции'}
                </h3>
                <p className="modal-description">
                    {operation.description === '' ? 'Без описания' : operation.description} — Банковская категория: «
                    {operation.categoryDefault || '—'}»
                    {operation.message !== '' && <> · Комментарий: «{operation.message}»</>}
                </p>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (!canSave) return;
                        if (applyToAll) {
                            const value = matchValue.trim();
                            const category = targetCategory.trim();
                            if (matchType === 'merchant') onSave({ kind: 'merchant', merchant: value, targetCategory: category });
                            else if (matchType === 'mcc') onSave({ kind: 'mcc', mcc: value, targetCategory: category });
                            else onSave({ kind: 'message', matchValue: value, targetCategory: category });
                        } else {
                            onSaveOnce(targetCategory.trim());
                        }
                    }}
                >
                    <label className="checkbox-row" style={{ marginBottom: 12 }}>
                        <input
                            type="checkbox"
                            checked={applyToAll}
                            onChange={(e) => setApplyToAll(e.target.checked)}
                        />
                        Использовать и для прошлых, и для будущих операций (создать правило)
                    </label>
                    {!applyToAll && (
                        <p className="muted" style={{ marginTop: -6, marginBottom: 12 }}>
                            Категория применится только к этой операции — похожие операции (прошлые
                            и будущие) она не затронет.
                        </p>
                    )}
                    <div className="form-grid">
                        {applyToAll && (
                            <>
                                <div className="field">
                                    <label htmlFor="rule-match-type">Тип сопоставления</label>
                                    <SearchableSelect
                                        id="rule-match-type"
                                        value={matchType}
                                        onChange={(next) => changeMatchType(next as RuleMatchType)}
                                        options={(Object.keys(MATCH_TYPE_LABELS) as RuleMatchType[]).map((mt) => ({
                                            value: mt,
                                            disabled: (mt === 'mcc' && mccDisabled) || (mt === 'message' && messageDisabled),
                                            label:
                                                MATCH_TYPE_LABELS[mt] +
                                                (mt === 'mcc' && mccDisabled ? ' (нет MCC у операции)' : '') +
                                                (mt === 'message' && messageDisabled ? ' (нет комментария у операции)' : ''),
                                        }))}
                                    />
                                </div>
                                <div className="field">
                                    <label htmlFor="rule-match-value">Значение</label>
                                    <input
                                        id="rule-match-value"
                                        value={matchValue}
                                        onChange={(e) => setMatchValue(e.target.value)}
                                        readOnly={matchType === 'merchant'}
                                    />
                                </div>
                            </>
                        )}
                        <div className="field">
                            <label htmlFor="rule-target-category">Целевая категория</label>
                            <CategorySelect
                                id="rule-target-category"
                                value={targetCategory}
                                onChange={setTargetCategory}
                                categories={categories}
                                categorySpheres={categorySpheres}
                            />
                        </div>
                    </div>
                    {error !== null && <ErrorBanner message={error} />}
                    <div className="modal-actions">
                        <button type="button" className="btn" onClick={onCancel} disabled={saving}>
                            Отмена
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={!canSave}>
                            {saving ? 'Сохраняю…' : applyToAll ? 'Добавить правило' : 'Сохранить категорию'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
