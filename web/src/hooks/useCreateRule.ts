import { useState } from 'react';
import type { OperationDto } from '../../../shared/types';
import { apiErrorText, createCustomMapping, createMcMapping, setMerchantCategory, updateOperationCategory } from '../api';
import type { CreateRuleInput } from '../components/CreateRuleDialog';

/**
 * Состояние и обработчики CreateRuleDialog («создать правило из операции» — на странице
 * «Операции» и в попапе WeekOperationsDialog) — раньше почти дословно копировались в обоих
 * местах. onSaved вызывается после успешного сохранения (обычно onDataChanged + сброс/
 * перезагрузка локальных данных вызывающей страницы).
 */
export function useCreateRule(onSaved: () => void): {
    source: OperationDto | null;
    saving: boolean;
    error: string | null;
    open: (operation: OperationDto) => void;
    cancel: () => void;
    save: (input: CreateRuleInput) => void;
    saveOnce: (categoryUser: string) => void;
} {
    const [source, setSource] = useState<OperationDto | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const open = (operation: OperationDto): void => setSource(operation);
    const cancel = (): void => {
        setSource(null);
        setError(null);
    };

    async function save(input: CreateRuleInput): Promise<void> {
        setSaving(true);
        setError(null);
        try {
            if (input.kind === 'merchant') {
                await setMerchantCategory({ merchant: input.merchant, targetCategory: input.targetCategory });
            } else if (input.kind === 'mcc') {
                await createMcMapping({ mcc: input.mcc, targetCategory: input.targetCategory });
            } else {
                await createCustomMapping({ matchValue: input.matchValue, targetCategory: input.targetCategory });
            }
            setSource(null);
            onSaved();
        } catch (e: unknown) {
            setError(apiErrorText(e));
        } finally {
            setSaving(false);
        }
    }

    /** «Использовать и для прошлых, и для будущих» выключен — категория только этой операции. */
    async function saveOnce(categoryUser: string): Promise<void> {
        if (source === null) return;
        setSaving(true);
        setError(null);
        try {
            await updateOperationCategory(source.id, { categoryUser });
            setSource(null);
            onSaved();
        } catch (e: unknown) {
            setError(apiErrorText(e));
        } finally {
            setSaving(false);
        }
    }

    return {
        source,
        saving,
        error,
        open,
        cancel,
        save: (input) => void save(input),
        saveOnce: (categoryUser) => void saveOnce(categoryUser),
    };
}
