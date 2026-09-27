import type { ReactNode } from 'react';
import { Spinner } from '../../components/ui/Spinner';

export interface MappingRuleRow<T> {
    key: T;
    title: string;
    subtitle: ReactNode;
}

interface Props<T> {
    rows: Array<MappingRuleRow<T>>;
    loading: boolean;
    emptyLabel: string;
    deleteBusy: boolean;
    onRequestDelete: (id: T) => void;
}

/** Список правил (по сообщению или по MCC) — форма и заголовок остаются у вызывающей секции. */
export function MappingRuleList<T>({ rows, loading, emptyLabel, deleteBusy, onRequestDelete }: Props<T>): JSX.Element {
    if (loading && rows.length === 0) {
        return (
            <div className="state-box">
                <Spinner />
            </div>
        );
    }
    return (
        <div className="entity-list">
            {rows.length === 0 && <p className="empty">{emptyLabel}</p>}
            {rows.map((row) => (
                <div className="entity-item" key={String(row.key)}>
                    <div className="entity-main">
                        <div className="entity-title">{row.title}</div>
                        <div className="entity-sub">{row.subtitle}</div>
                    </div>
                    <div className="entity-actions">
                        <button type="button" className="btn btn-small btn-danger" disabled={deleteBusy} onClick={() => onRequestDelete(row.key)}>
                            Удалить
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
