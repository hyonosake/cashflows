import { useEffect, useState } from 'react';
import { ErrorBanner } from '../../components/ui/ErrorBanner';

interface Props {
    area: string | null; // null — диалог закрыт
    saving: boolean;
    error: string | null;
    onCancel: () => void;
    onSave: (newName: string) => void;
}

/** Попап «Изменить сферу» — переименование, единственное редактируемое поле у сферы. */
export function EditAreaDialog({ area, saving, error, onCancel, onSave }: Props): JSX.Element | null {
    const [name, setName] = useState('');
    const [localError, setLocalError] = useState<string | null>(null);

    useEffect(() => {
        if (area === null) return;
        setName(area);
        setLocalError(null);
    }, [area]);

    useEffect(() => {
        if (area === null) return;
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key === 'Escape' && !saving) onCancel();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [area, saving, onCancel]);

    if (area === null) return null;

    const submit = (): void => {
        const trimmed = name.trim();
        if (trimmed === '') {
            setLocalError('Введите название сферы');
            return;
        }
        setLocalError(null);
        onSave(trimmed);
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
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-label={`Изменить сферу ${area}`}
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="modal-title">Изменить сферу</h3>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        submit();
                    }}
                >
                    <div className="field">
                        <label htmlFor="edit-area-name">Название</label>
                        <input
                            id="edit-area-name"
                            className="input-control"
                            value={name}
                            disabled={saving}
                            autoFocus
                            onChange={(e) => setName(e.target.value)}
                        />
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
