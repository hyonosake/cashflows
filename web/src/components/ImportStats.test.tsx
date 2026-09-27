import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ImportResultDto } from '../../../shared/types';
import { ImportStats } from './ImportStats';

/** Статистика импорта: parsed/inserted/duplicatesSkipped/errors + имя файла. */

const result: ImportResultDto = {
    sourceFile: 'sample-operations.csv',
    parsed: 117,
    inserted: 99,
    duplicatesSkipped: 16,
    errors: [
        { line: 5, reason: 'Некорректная дата' },
        { line: 42, reason: 'Некорректная сумма' },
    ],
};

afterEach(cleanup);

describe('ImportStats', () => {
    it('показывает имя файла и все счётчики', () => {
        render(<ImportStats result={result} />);
        expect(screen.getByText('sample-operations.csv')).toBeInTheDocument();
        expect(screen.getByText('117')).toBeInTheDocument();
        expect(screen.getByText('распознано строк')).toBeInTheDocument();
        expect(screen.getByText('99')).toBeInTheDocument();
        expect(screen.getByText('новых операций')).toBeInTheDocument();
        expect(screen.getByText('16')).toBeInTheDocument();
        expect(screen.getByText('дубликатов пропущено')).toBeInTheDocument();
    });

    it('число построчных ошибок = errors.length, а не сам массив', () => {
        render(<ImportStats result={result} />);
        expect(screen.getByText('2')).toBeInTheDocument();
        expect(screen.getByText('ошибок строк')).toBeInTheDocument();
    });

    it('без ошибок: 0 ошибок строк', () => {
        render(
            <ImportStats
                result={{ ...result, errors: [], inserted: 117, duplicatesSkipped: 0 }}
            />,
        );
        // «0» встречается дважды (дубликаты + ошибки) — проверяем оба.
        expect(screen.getAllByText('0')).toHaveLength(2);
        expect(screen.getByText('ошибок строк')).toBeInTheDocument();
    });
});
