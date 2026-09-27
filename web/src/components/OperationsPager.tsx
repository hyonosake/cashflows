/**
 * Пагинатор таблицы операций: «страница X из Y» + кнопки Назад/Вперёд.
 * Кнопки блокируются на время загрузки и на границах диапазона.
 */

interface Props {
    total: number;
    page: number;
    totalPages: number;
    loading: boolean;
    onPageChange: (page: number) => void;
}

export function OperationsPager({ total, page, totalPages, loading, onPageChange }: Props): JSX.Element {
    return (
        <div className="pager">
            <span>
                Всего {total} · страница {page} из {totalPages}
            </span>
            <button
                type="button"
                className="btn btn-small"
                disabled={page <= 1 || loading}
                onClick={() => onPageChange(page - 1)}
            >
                ← Назад
            </button>
            <button
                type="button"
                className="btn btn-small"
                disabled={page >= totalPages || loading}
                onClick={() => onPageChange(page + 1)}
            >
                Вперёд →
            </button>
        </div>
    );
}
