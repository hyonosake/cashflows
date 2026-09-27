import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import type { ImportResultDto } from '../../../shared/types';
import { ImportStats } from './ImportStats';
import { Spinner } from './ui/Spinner';
import { formatDate } from '../format';
import { todayIso } from '../periods';
import { useImport } from '../hooks/useImport';

/**
 * Панель импорта CSV: drag-n-drop + input file (.csv), POST /api/import,
 * показ результата (parsed/inserted/duplicatesSkipped/errors) и построчных ошибок.
 * Логика загрузки — useImport; детали 400 {error, details[]} рендерятся читаемо.
 */

interface Props {
    onImported: (result: ImportResultDto) => void;
}

export function ImportPanel({ onImported }: Props): JSX.Element {
    const { state, busy, upload } = useImport(onImported);
    const [dragActive, setDragActive] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);

    function onDrop(event: DragEvent<HTMLDivElement>): void {
        event.preventDefault();
        setDragActive(false);
        const file = event.dataTransfer.files[0];
        if (file !== undefined) {
            void upload(file);
        }
    }

    return (
        <div className="panel">
            <h2>Импорт CSV</h2>
            <div
                className={`dropzone${dragActive ? ' dropzone-active' : ''}`}
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                role="button"
                aria-label="Загрузить CSV-файл"
            >
                {busy ? (
                    <>
                        <Spinner />
                        <p>Загрузка и обработка файла…</p>
                    </>
                ) : (
                    <>
                        <p>
                            <b>Перетащите CSV-файл</b> сюда или нажмите, чтобы выбрать
                        </p>
                        <p className="muted">Выгрузка из ЛК Т-Банка, разделитель «;», кодировка UTF-8</p>
                    </>
                )}
            </div>
            <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file !== undefined) void upload(file);
                    e.target.value = '';
                }}
            />

            {state.kind === 'result' && (
                <>
                    <div className="message message-success">
                        {/* Дата по Москве (todayIso), а не UTC-дата браузера. */}
                        Импорт завершён: <b>{state.result.sourceFile}</b> (от {formatDate(todayIso())})
                    </div>
                    <ImportStats result={state.result} />
                    {state.result.errors.length > 0 && (
                        <div className="message message-error">
                            <b>Ошибки построчно:</b>
                            <ul>
                                {state.result.errors.map((e) => (
                                    <li key={`${e.line}-${e.reason}`}>
                                        строка {e.line}: {e.reason}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </>
            )}

            {state.kind === 'error' && (
                <div className="message message-error">
                    <b>Ошибка импорта:</b> {state.message}
                    {state.details !== undefined && <div className="muted">{state.details}</div>}
                </div>
            )}
        </div>
    );
}
