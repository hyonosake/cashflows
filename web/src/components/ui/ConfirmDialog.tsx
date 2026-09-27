import { useEffect } from 'react';

/**
 * Диалог подтверждения вместо window.confirm (window.confirm блокирует поток и
 * неудобен в тестах). Модальное окно поверх страницы: Esc/клик по подложке — отмена,
 * Enter/кнопка — подтверждение. Деструктивное действие подсвечено .btn-danger.
 */

interface Props {
    open: boolean;
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    busy?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmDialog({
    open,
    title,
    description,
    confirmLabel = 'Удалить',
    cancelLabel = 'Отмена',
    busy = false,
    onConfirm,
    onCancel,
}: Props): JSX.Element | null {
    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') onCancel();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open, onCancel]);

    if (!open) return null;

    return (
        <div
            className="modal-overlay"
            role="presentation"
            onClick={() => {
                if (!busy) onCancel();
            }}
        >
            <div
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="modal-title">{title}</h3>
                {description !== undefined && <p className="modal-description">{description}</p>}
                <div className="modal-actions">
                    <button type="button" className="btn" onClick={onCancel} disabled={busy}>
                        {cancelLabel}
                    </button>
                    <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
