import { useState } from 'react';

/**
 * Общий паттерн "запросить удаление → подтвердить в ConfirmDialog → выполнить" —
 * раньше копировался в CategoryKindsSection/MappingsSection (×2)/GoalsSection.
 * deleteFn обязан сам выставлять сообщение об ошибке (ErrorBanner секции) и
 * ПЕРЕБРОСИТЬ исключение при неудаче — тогда диалог остаётся открытым для повтора;
 * при успехе dialog закрывается (pending → null).
 */
export function useConfirmDelete<T>(): {
    pending: T | null;
    busy: boolean;
    requestDelete: (id: T) => void;
    cancel: () => void;
    confirm: (deleteFn: (id: T) => Promise<void>) => Promise<void>;
} {
    const [pending, setPending] = useState<T | null>(null);
    const [busy, setBusy] = useState(false);

    const requestDelete = (id: T): void => setPending(id);
    const cancel = (): void => setPending(null);

    const confirm = async (deleteFn: (id: T) => Promise<void>): Promise<void> => {
        if (pending === null) return;
        setBusy(true);
        try {
            await deleteFn(pending);
            setPending(null);
        } catch {
            // deleteFn уже показал ошибку — оставляем диалог открытым для повтора/отмены
        } finally {
            setBusy(false);
        }
    };

    return { pending, busy, requestDelete, cancel, confirm };
}
