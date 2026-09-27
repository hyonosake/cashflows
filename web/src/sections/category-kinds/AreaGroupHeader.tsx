import { useState } from 'react';
import { PencilIcon } from '../../components/ui/PencilIcon';

interface Props {
    sphere: string | null; // null — псевдо-группа «Без сферы», переименовать нечего
    renameBusy: boolean;
    onRename: (newName: string) => void;
}

/** Заголовок группы категорий по сфере — кликом на «Изменить» переименовывает саму сферу. */
export function AreaGroupHeader({ sphere, renameBusy, onRename }: Props): JSX.Element {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(sphere ?? '');

    if (sphere === null) {
        return <div className="entity-group-header">Без сферы</div>;
    }

    if (!editing) {
        return (
            <div className="entity-group-header">
                <span>{sphere}</span>
                <button
                    type="button"
                    className="btn btn-icon"
                    onClick={() => {
                        setDraft(sphere);
                        setEditing(true);
                    }}
                    aria-label={`Переименовать сферу ${sphere}`}
                    title="Переименовать сферу"
                >
                    <PencilIcon />
                </button>
            </div>
        );
    }

    const submit = (): void => {
        const trimmed = draft.trim();
        if (trimmed === '' || trimmed === sphere) {
            setEditing(false);
            return;
        }
        onRename(trimmed);
    };

    return (
        <div className="entity-group-header entity-group-header-editing">
            <input
                className="input-control"
                aria-label={`Новое имя сферы ${sphere}`}
                value={draft}
                disabled={renameBusy}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') submit();
                    if (e.key === 'Escape') setEditing(false);
                }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn btn-small" disabled={renameBusy || draft.trim() === ''} onClick={submit}>
                    Сохранить
                </button>
                <button type="button" className="btn btn-small" disabled={renameBusy} onClick={() => setEditing(false)}>
                    Отмена
                </button>
            </div>
        </div>
    );
}
