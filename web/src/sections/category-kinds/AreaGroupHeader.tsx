import { PencilIcon } from '../../components/ui/PencilIcon';

interface Props {
    sphere: string | null; // null — псевдо-группа «Без сферы», переименовать нечего
    onEdit: () => void;
}

/** Заголовок группы категорий по сфере — кнопка «Изменить» открывает попап переименования сферы. */
export function AreaGroupHeader({ sphere, onEdit }: Props): JSX.Element {
    if (sphere === null) {
        return <div className="entity-group-header">Без сферы</div>;
    }

    return (
        <div className="entity-group-header">
            <span>{sphere}</span>
            <button
                type="button"
                className="btn btn-icon"
                onClick={onEdit}
                aria-label={`Изменить сферу ${sphere}`}
                title="Изменить сферу"
            >
                <PencilIcon />
            </button>
        </div>
    );
}
