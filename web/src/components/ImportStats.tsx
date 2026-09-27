import type { ImportResultDto } from '../../../shared/types';

/**
 * Статистика импорта (parsed/inserted/duplicatesSkipped/errors) — раньше этот
 * блок дублировался в ImportPanel, Dashboard и Settings.
 */
interface Props {
    result: ImportResultDto;
}

export function ImportStats({ result }: Props): JSX.Element {
    return (
        <div className="import-stats">
            <div className="import-stat">
                <b>{result.sourceFile}</b>
            </div>
            <div className="import-stat">
                <b>{result.parsed}</b> <span>распознано строк</span>
            </div>
            <div className="import-stat">
                <b>{result.inserted}</b> <span>новых операций</span>
            </div>
            <div className="import-stat">
                <b>{result.duplicatesSkipped}</b> <span>дубликатов пропущено</span>
            </div>
            <div className="import-stat">
                <b>{result.errors.length}</b> <span>ошибок строк</span>
            </div>
        </div>
    );
}
