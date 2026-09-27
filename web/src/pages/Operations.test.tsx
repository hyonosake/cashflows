import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationDto, OperationsResponse } from '../../../shared/types';
import { OperationsPage } from './Operations';
import { ApiError, fetchCategories, fetchOperations, setMerchantCategory } from '../api';

/**
 * Флоу «Создать правило из операции» прямо со страницы «Операции»: кнопка у строки
 * открывает CreateRuleDialog, по умолчанию тип сопоставления — «Мерчант целиком»,
 * сохранение вызывает setMerchantCategory (живой JOIN — пересчёт не нужен) и поднимает
 * onDataChanged. ../api мокается — без сети.
 */

vi.mock('../api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../api')>();
    return {
        ...actual,
        fetchOperations: vi.fn(),
        fetchCategories: vi.fn(),
        setMerchantCategory: vi.fn(),
    };
});

const fetchOperationsMock = vi.mocked(fetchOperations);
const fetchCategoriesMock = vi.mocked(fetchCategories);
const setMerchantCategoryMock = vi.mocked(setMerchantCategory);

const operation: OperationDto = {
    id: 1,
    datetimeIso: '2026-09-01T10:00:00Z',
    localDate: '2026-09-01',
    amountKopecks: -50000,
    type: 'expense',
    account: 'Основной',
    card: null,
    currency: 'RUB',
    status: 'Ок',
    categoryDefault: 'Мобильная связь',
    category: 'Мобильная связь',
    mcc: '4814',
    description: 'МТС Мобайл',
    message: '',
    bonusesKopecks: 0,
    includeInAnalytics: true,
    sourceFile: 'test.csv',
};

function response(items: OperationDto[]): OperationsResponse {
    return { items, total: items.length, page: 1, limit: 50 };
}

beforeEach(() => {
    fetchOperationsMock.mockReset();
    fetchCategoriesMock.mockReset();
    setMerchantCategoryMock.mockReset();
    fetchOperationsMock.mockResolvedValue(response([operation]));
    fetchCategoriesMock.mockResolvedValue(['Мобильная связь', 'Жильё и связь']);
});

afterEach(cleanup);

describe('OperationsPage — создание правила из операции', () => {
    it('сохранение вызывает setMerchantCategory и onDataChanged, диалог закрывается', async () => {
        setMerchantCategoryMock.mockResolvedValueOnce(undefined);
        const onDataChanged = vi.fn();
        const user = userEvent.setup();

        render(<OperationsPage version={0} onDataChanged={onDataChanged} />);

        await user.click(await screen.findByRole('button', { name: 'Создать правило' }));
        const dialog = await screen.findByRole('dialog');
        expect(dialog).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Добавить правило' }));

        await waitFor(() =>
            expect(setMerchantCategoryMock).toHaveBeenCalledExactlyOnceWith({
                merchant: 'МТС Мобайл',
                targetCategory: 'Мобильная связь',
            }),
        );
        await waitFor(() => expect(onDataChanged).toHaveBeenCalledOnce());
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('ошибка сохранения показывается в диалоге и не закрывает его', async () => {
        setMerchantCategoryMock.mockRejectedValueOnce(new ApiError(400, 'Ошибка валидации запроса'));
        const user = userEvent.setup();

        render(<OperationsPage version={0} onDataChanged={vi.fn()} />);

        await user.click(await screen.findByRole('button', { name: 'Создать правило' }));
        await screen.findByRole('dialog');
        await user.click(screen.getByRole('button', { name: 'Добавить правило' }));

        expect(await screen.findByText('Ошибка валидации запроса')).toBeInTheDocument();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('отмена закрывает диалог без вызова API', async () => {
        const user = userEvent.setup();
        render(<OperationsPage version={0} onDataChanged={vi.fn()} />);

        await user.click(await screen.findByRole('button', { name: 'Создать правило' }));
        await screen.findByRole('dialog');
        await user.click(screen.getByRole('button', { name: 'Отмена' }));

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(setMerchantCategoryMock).not.toHaveBeenCalled();
    });
});
