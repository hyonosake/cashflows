import { useCallback, useState } from 'react';
import type { ImportResultDto } from '../../../shared/types';
import { ApiError, formatApiErrorDetails, importCsv } from '../api';

/**
 * Состояние импорта CSV (POST /api/import): idle → loading → result | error.
 * POST намеренно не отменяется через AbortController: сервер всё равно обработает
 * файл, а результат (какие строки вставлены) нужен пользователю.
 */

export type ImportState =
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'result'; result: ImportResultDto }
    | { kind: 'error'; message: string; details?: string };

export interface UseImportResult {
    state: ImportState;
    busy: boolean;
    upload: (file: File) => Promise<void>;
}

export function useImport(onImported: (result: ImportResultDto) => void): UseImportResult {
    const [state, setState] = useState<ImportState>({ kind: 'idle' });

    const upload = useCallback(
        async (file: File): Promise<void> => {
            setState({ kind: 'loading' });
            try {
                const result = await importCsv(file);
                setState({ kind: 'result', result });
                onImported(result);
            } catch (error) {
                if (error instanceof ApiError) {
                    // Ошибки формата { error, details? } (§7): details[] показываем читаемо,
                    // а не как «[object Object]».
                    setState({
                        kind: 'error',
                        message: error.message,
                        details: error.details !== undefined ? formatApiErrorDetails(error.details) : undefined,
                    });
                } else {
                    setState({ kind: 'error', message: 'Не удалось загрузить файл' });
                }
            }
        },
        [onImported],
    );

    return { state, busy: state.kind === 'loading', upload };
}
