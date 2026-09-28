import type { CategoryKindDto } from '../../../../shared/types';
import { formatMoneyWhole } from '../../format';
import { PencilIcon } from '../../components/ui/PencilIcon';
import { TrashIcon } from '../../components/ui/TrashIcon';

const KIND_LABELS: Record<string, string> = {
    fixed: 'Постоянная',
    variable: 'Переменная',
    reserve: 'Резерв',
};

interface Props {
    item: CategoryKindDto;
    field: string; // '' — без сферы
    limitKopecks: number | null;
    deleteBusy: boolean;
    onEdit: () => void;
    onRequestDelete: () => void;
}

/** Одна строка плоского списка категорий: название + сводка тега/сферы/плана, «Изменить» открывает попап. */
export function CategoryRow({ item, field, limitKopecks, deleteBusy, onEdit, onRequestDelete }: Props): JSX.Element {
    const parts: string[] = [];
    parts.push(item.kind !== null && item.kind !== undefined ? KIND_LABELS[item.kind] ?? item.kind : 'не размечено');
    if (field !== '') parts.push(`сфера «${field}»`);
    if (limitKopecks !== null) parts.push(`план ${formatMoneyWhole(limitKopecks)}/мес`);

    return (
        <div className="entity-item">
            <div className="entity-main">
                <div className="entity-title-row">
                    <span className="entity-title">{item.category}</span>
                </div>
                <div className="entity-sub">{parts.join(' · ')}</div>
            </div>
            <div className="entity-actions">
                <button
                    type="button"
                    className="btn btn-icon"
                    onClick={onEdit}
                    aria-label={`Изменить категорию ${item.category}`}
                    title="Изменить категорию"
                >
                    <PencilIcon />
                </button>
                <button
                    type="button"
                    className="btn btn-icon btn-danger"
                    disabled={deleteBusy}
                    onClick={onRequestDelete}
                    aria-label={`Удалить категорию ${item.category}`}
                    title="Удалить категорию"
                >
                    <TrashIcon />
                </button>
            </div>
        </div>
    );
}
