import { useDebugTables } from '../hooks/useDebugTables';
import { Spinner } from '../components/ui/Spinner';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import type { DebugTableDto } from '../../../shared/types';

interface Props {
    version: number;
}

function cellText(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
}

function TablePanel({ table }: { table: DebugTableDto }): JSX.Element {
    const columns = table.rows.length > 0 ? Object.keys(table.rows[0] as Record<string, unknown>) : [];

    return (
        <div className="panel">
            <div className="panel-head">
                <h2>{table.name}</h2>
                <span className="income-compact">
                    {table.totalRows} {table.totalRows === 1 ? 'строка' : 'строк'}
                    {table.totalRows > table.rows.length ? ` · показаны первые ${table.rows.length}` : ''}
                </span>
            </div>
            {columns.length === 0 ? (
                <p className="empty">Таблица пуста.</p>
            ) : (
                <div className="table-wrap">
                    <table className="table">
                        <thead>
                            <tr>
                                {columns.map((c) => (
                                    <th key={c}>{c}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {table.rows.map((row, i) => (
                                <tr key={i}>
                                    {columns.map((c) => (
                                        <td key={c}>{cellText(row[c])}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

/**
 * Служебная debug-страница: сырой дамп всех таблиц БД
 * (по 10 строк) — сверять миграцию на нормализованные категории глазами, без sqlite3 CLI.
 */
export function DebugPage({ version }: Props): JSX.Element {
    const { data, loading, error } = useDebugTables(version);

    if (loading && data === null) return <Spinner />;
    if (error !== null) return <ErrorBanner message={error} />;
    if (data === null) return <Spinner />;

    return (
        <div className="page">
            {data.tables.map((table) => (
                <TablePanel key={table.name} table={table} />
            ))}
        </div>
    );
}
