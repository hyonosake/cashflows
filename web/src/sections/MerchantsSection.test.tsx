import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CategoryFieldDto, MerchantSummaryDto } from '../../../shared/types';
import { MerchantsSection } from './MerchantsSection';
import { ApiError, fetchCategoryFields, fetchMerchants, setMerchantCategory } from '../api';

/**
 * Секция «Настройки» — все мерчанты по убыванию трат за всё время + текущая категория.
 * ../api мокается (vi.mock) — без сети; смена категории в select шлёт PUT
 * /api/merchants/category и вызывает onDataChanged; поиск фильтрует список на клиенте.
 * Категория — SearchableSelect (комбобокс с поиском, не нативный select): выбор варианта —
 * клик по инпуту, затем клик по пункту списка (role="option"). Источник вариантов —
 * useCategoryFields (не useCategories) — те же имена, но со сферой каждой категории,
 * дополняющей подпись варианта («Категория (Сфера)»).
 */

async function chooseOption(user: UserEvent, input: HTMLElement, optionName: string | RegExp): Promise<void> {
    await user.click(input);
    await user.click(await screen.findByRole('option', { name: optionName }));
}

vi.mock('../api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../api')>();
    return { ...actual, fetchMerchants: vi.fn(), setMerchantCategory: vi.fn(), fetchCategoryFields: vi.fn() };
});

const fetchMerchantsMock = vi.mocked(fetchMerchants);
const setMerchantCategoryMock = vi.mocked(setMerchantCategory);
const fetchCategoryFieldsMock = vi.mocked(fetchCategoryFields);

const merchants: MerchantSummaryDto[] = [
    { merchant: 'ВкусВилл', category: 'Продукты и быт', mixedCategories: false, spentKopecks: 2_000_000, operationsCount: 10 },
    { merchant: 'Госуслуги Москвы', category: 'Госуслуги', mixedCategories: false, spentKopecks: 1_000_000, operationsCount: 5 },
];

const categoryFields: CategoryFieldDto[] = [
    { category: 'Продукты и быт', field: null },
    { category: 'Госуслуги', field: null },
    { category: 'Жильё и связь', field: null },
];

beforeEach(() => {
    fetchMerchantsMock.mockReset();
    setMerchantCategoryMock.mockReset();
    fetchCategoryFieldsMock.mockReset();
    fetchCategoryFieldsMock.mockResolvedValue(categoryFields);
});

afterEach(cleanup);

/** Секция сворачиваема (defaultOpen=false, много записей) — раскрыть перед проверкой содержимого. */
async function expandSection(): Promise<void> {
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Мерчанты/ }));
}

describe('MerchantsSection', () => {
    it('рендерит мерчантов с суммой и текущей категорией', async () => {
        fetchMerchantsMock.mockResolvedValueOnce(merchants);
        render(<MerchantsSection version={0} onDataChanged={vi.fn()} />);
        await expandSection();

        expect(await screen.findByText('ВкусВилл')).toBeInTheDocument();
        expect(screen.getByText('Госуслуги Москвы')).toBeInTheDocument();
    });

    it('поиск фильтрует список по названию мерчанта', async () => {
        fetchMerchantsMock.mockResolvedValueOnce(merchants);
        const user = userEvent.setup();
        render(<MerchantsSection version={0} onDataChanged={vi.fn()} />);
        await expandSection();

        expect(await screen.findByText('ВкусВилл')).toBeInTheDocument();
        await user.type(screen.getByLabelText('Поиск мерчанта по названию'), 'Госуслуги');

        expect(screen.queryByText('ВкусВилл')).not.toBeInTheDocument();
        expect(screen.getByText('Госуслуги Москвы')).toBeInTheDocument();
    });

    it('фильтр по текущей категории сужает список', async () => {
        fetchMerchantsMock.mockResolvedValueOnce(merchants);
        const user = userEvent.setup();
        render(<MerchantsSection version={0} onDataChanged={vi.fn()} />);
        await expandSection();

        expect(await screen.findByText('ВкусВилл')).toBeInTheDocument();
        await chooseOption(user, screen.getByLabelText('Фильтр по текущей категории'), 'Госуслуги');

        expect(screen.queryByText('ВкусВилл')).not.toBeInTheDocument();
        expect(screen.getByText('Госуслуги Москвы')).toBeInTheDocument();
    });

    it('смена категории в select шлёт PUT и вызывает onDataChanged', async () => {
        fetchMerchantsMock.mockResolvedValueOnce(merchants);
        setMerchantCategoryMock.mockResolvedValueOnce(undefined);
        const onDataChanged = vi.fn();
        const user = userEvent.setup();
        render(<MerchantsSection version={0} onDataChanged={onDataChanged} />);
        await user.click(await screen.findByRole('button', { name: /Мерчанты/ }));

        const select = await screen.findByLabelText('Категория мерчанта Госуслуги Москвы');
        await chooseOption(user, select, 'Жильё и связь');

        expect(setMerchantCategoryMock).toHaveBeenCalledExactlyOnceWith({
            merchant: 'Госуслуги Москвы',
            targetCategory: 'Жильё и связь',
        });
        await waitFor(() => expect(onDataChanged).toHaveBeenCalledOnce());
    });

    it('ошибка API при смене категории → ErrorBanner с текстом ошибки', async () => {
        fetchMerchantsMock.mockResolvedValueOnce(merchants);
        setMerchantCategoryMock.mockRejectedValueOnce(new ApiError(400, 'Ошибка валидации запроса'));
        const user = userEvent.setup();
        render(<MerchantsSection version={0} onDataChanged={vi.fn()} />);
        await user.click(await screen.findByRole('button', { name: /Мерчанты/ }));

        const select = await screen.findByLabelText('Категория мерчанта Госуслуги Москвы');
        await chooseOption(user, select, 'Жильё и связь');

        expect(await screen.findByText('Ошибка валидации запроса')).toBeInTheDocument();
    });

    it('подпись варианта категории дополняется сферой', async () => {
        fetchMerchantsMock.mockResolvedValueOnce(merchants);
        fetchCategoryFieldsMock.mockResolvedValueOnce([
            { category: 'Продукты и быт', field: null },
            { category: 'Госуслуги', field: 'Жильё и связь' },
        ]);
        const user = userEvent.setup();
        render(<MerchantsSection version={0} onDataChanged={vi.fn()} />);
        await expandSection();

        const select = await screen.findByLabelText('Категория мерчанта Госуслуги Москвы');
        await user.click(select);
        expect(await screen.findByRole('option', { name: 'Госуслуги (Жильё и связь)' })).toBeInTheDocument();
    });

    it('пустой список мерчантов → подсказка про импорт', async () => {
        fetchMerchantsMock.mockResolvedValueOnce([]);
        render(<MerchantsSection version={0} onDataChanged={vi.fn()} />);
        await expandSection();

        expect(await screen.findByText('Мерчантов пока нет — сначала импортируйте операции.')).toBeInTheDocument();
    });
});
