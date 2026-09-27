import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CategoryFieldDto, CategoryKindDto, CategoryLimitDto } from '../../../shared/types';
import { CategoryKindsSection } from './CategoryKindsSection';
import {
    ApiError,
    createCategoryArea,
    createUserCategory,
    deleteUserCategory,
    fetchCategoryAreas,
    fetchCategoryFields,
    fetchCategoryKinds,
    fetchCategoryLimits,
    renameCategoryArea,
    renameUserCategory,
    setCategoryField,
    setCategoryKind,
    setCategoryLimit,
} from '../api';

/**
 * Секция «Настройки категорий» — тег постоянная/переменная (SearchableSelect, не кнопки —
 * см. AGENTS.md, «Конвенции кода» → UI-паттерны), сфера (CategoryField) И план на месяц
 * (month_limit_kopecks) на категорию, переименование категории/сферы (карандаш →
 * инлайн-форма), «Новая категория» — ЕДИНСТВЕННОЕ место в приложении, где заводится новая
 * user_categories.name (createUserCategory), и «Новая сфера» — аналогично для
 * category_abstract (createCategoryArea). ../api мокается (vi.mock) — без сети; выбор тега/
 * сферы/сохранение плана/переименование шлёт PUT и вызывает onDataChanged, ошибка API
 * рендерится через ErrorBanner. Сфера доступна только категориям из fetchCategoryFields
 * (= пользовательские, см. listUserCategories) — «Такси / метро / самокаты» её не имеет;
 * план и тег — всем категориям из fetchCategoryKinds. Тег/сфера — SearchableSelect
 * (комбобокс с поиском, не нативный select): выбор варианта — клик по инпуту, затем клик по
 * пункту списка (role="option"), не user.selectOptions. «Удалить» у категории — иконка-кнопка
 * (без видимого текста, есть aria-label), подтверждается ConfirmDialog (deleteUserCategory),
 * не window.confirm.
 */

async function chooseOption(user: UserEvent, input: HTMLElement, optionName: string | RegExp): Promise<void> {
    await user.click(input);
    await user.click(await screen.findByRole('option', { name: optionName }));
}

vi.mock('../api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../api')>();
    return {
        ...actual,
        fetchCategoryKinds: vi.fn(),
        setCategoryKind: vi.fn(),
        fetchCategoryFields: vi.fn(),
        setCategoryField: vi.fn(),
        fetchCategoryLimits: vi.fn(),
        setCategoryLimit: vi.fn(),
        createUserCategory: vi.fn(),
        deleteUserCategory: vi.fn(),
        renameUserCategory: vi.fn(),
        fetchCategoryAreas: vi.fn(),
        createCategoryArea: vi.fn(),
        renameCategoryArea: vi.fn(),
    };
});

const fetchCategoryKindsMock = vi.mocked(fetchCategoryKinds);
const setCategoryKindMock = vi.mocked(setCategoryKind);
const fetchCategoryFieldsMock = vi.mocked(fetchCategoryFields);
const setCategoryFieldMock = vi.mocked(setCategoryField);
const fetchCategoryLimitsMock = vi.mocked(fetchCategoryLimits);
const setCategoryLimitMock = vi.mocked(setCategoryLimit);
const createUserCategoryMock = vi.mocked(createUserCategory);
const deleteUserCategoryMock = vi.mocked(deleteUserCategory);
const renameUserCategoryMock = vi.mocked(renameUserCategory);
const fetchCategoryAreasMock = vi.mocked(fetchCategoryAreas);
const createCategoryAreaMock = vi.mocked(createCategoryArea);
const renameCategoryAreaMock = vi.mocked(renameCategoryArea);

const kinds: CategoryKindDto[] = [
    { category: 'Сима', kind: 'fixed' },
    { category: 'Такси / метро / самокаты', kind: null },
];

const fields: CategoryFieldDto[] = [{ category: 'Сима', field: null }];

const limits: CategoryLimitDto[] = [
    { category: 'Сима', monthLimitKopecks: null },
    { category: 'Такси / метро / самокаты', monthLimitKopecks: null },
];

beforeEach(() => {
    fetchCategoryKindsMock.mockReset();
    setCategoryKindMock.mockReset();
    fetchCategoryFieldsMock.mockReset();
    fetchCategoryFieldsMock.mockResolvedValue(fields);
    setCategoryFieldMock.mockReset();
    fetchCategoryLimitsMock.mockReset();
    fetchCategoryLimitsMock.mockResolvedValue(limits);
    setCategoryLimitMock.mockReset();
    createUserCategoryMock.mockReset();
    deleteUserCategoryMock.mockReset();
    renameUserCategoryMock.mockReset();
    fetchCategoryAreasMock.mockReset();
    fetchCategoryAreasMock.mockResolvedValue(['Дети']);
    createCategoryAreaMock.mockReset();
    renameCategoryAreaMock.mockReset();
});

afterEach(cleanup);

/** Секция сворачиваема (defaultOpen=false, много записей) — раскрыть перед проверкой содержимого. */
async function expandSection(): Promise<void> {
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Настройки категорий/ }));
}

describe('CategoryKindsSection', () => {
    it('рендерит категории с текущим тегом в выпадашке', async () => {
        fetchCategoryKindsMock.mockResolvedValueOnce(kinds);
        render(<CategoryKindsSection version={0} onDataChanged={vi.fn()} />);
        await expandSection();

        expect(await screen.findByText('Сима')).toBeInTheDocument();
        expect(screen.getByText('Такси / метро / самокаты')).toBeInTheDocument();

        const simaKindSelect = screen.getByLabelText('Тег категории Сима') as HTMLInputElement;
        expect(simaKindSelect.value).toBe('Постоянная');
        const taxiKindSelect = screen.getByLabelText('Тег категории Такси / метро / самокаты') as HTMLInputElement;
        expect(taxiKindSelect.value).toBe('— (не размечено)');
    });

    it('выбор тега в выпадашке шлёт PUT и вызывает onDataChanged', async () => {
        fetchCategoryKindsMock.mockResolvedValueOnce(kinds);
        setCategoryKindMock.mockResolvedValueOnce({ category: 'Такси / метро / самокаты', kind: 'variable' });
        const onDataChanged = vi.fn();
        const user = userEvent.setup();
        render(<CategoryKindsSection version={0} onDataChanged={onDataChanged} />);
        await expandSection();

        const kindSelect = await screen.findByLabelText('Тег категории Такси / метро / самокаты');
        await chooseOption(user, kindSelect, 'Переменная');

        expect(setCategoryKindMock).toHaveBeenCalledExactlyOnceWith('Такси / метро / самокаты', 'variable');
        await waitFor(() => expect(onDataChanged).toHaveBeenCalledOnce());
    });

    it('ошибка API при сохранении тега → ErrorBanner с текстом ошибки', async () => {
        fetchCategoryKindsMock.mockResolvedValueOnce(kinds);
        setCategoryKindMock.mockRejectedValueOnce(new ApiError(400, 'Ошибка валидации запроса'));
        const user = userEvent.setup();
        render(<CategoryKindsSection version={0} onDataChanged={vi.fn()} />);
        await expandSection();

        const kindSelect = await screen.findByLabelText('Тег категории Такси / метро / самокаты');
        await chooseOption(user, kindSelect, 'Постоянная');

        expect(await screen.findByText('Ошибка валидации запроса')).toBeInTheDocument();
    });

    it('сфера показывается только для категорий пользователя; план — у всех', async () => {
        fetchCategoryKindsMock.mockResolvedValueOnce(kinds);
        render(<CategoryKindsSection version={0} onDataChanged={vi.fn()} />);
        await expandSection();

        const simaItem = (await screen.findByText('Сима')).closest('.entity-item') as HTMLElement;
        const taxiItem = screen.getByText('Такси / метро / самокаты').closest('.entity-item') as HTMLElement;

        expect(simaItem.querySelector('[aria-label="Сфера категории Сима"]')).toBeInTheDocument();
        expect(taxiItem.querySelector('[aria-label^="Сфера категории"]')).not.toBeInTheDocument();

        expect(simaItem.querySelector('input[placeholder^="План"]')).toBeInTheDocument();
        expect(taxiItem.querySelector('input[placeholder^="План"]')).toBeInTheDocument();
    });

    it('сохранение плана шлёт PUT и вызывает onDataChanged', async () => {
        fetchCategoryKindsMock.mockResolvedValueOnce(kinds);
        setCategoryLimitMock.mockResolvedValueOnce({ category: 'Сима', monthLimitKopecks: 1_500_000 });
        const onDataChanged = vi.fn();
        const user = userEvent.setup();
        render(<CategoryKindsSection version={0} onDataChanged={onDataChanged} />);
        await expandSection();

        const simaItem = (await screen.findByText('Сима')).closest('.entity-item') as HTMLElement;
        const limitInput = simaItem.querySelector('input[placeholder^="План"]') as HTMLElement;
        await user.type(limitInput, '15000');
        const saveBtn = Array.from(simaItem.querySelectorAll('button')).find((b) => b.textContent === 'Сохранить') as HTMLElement;
        await user.click(saveBtn);

        expect(setCategoryLimitMock).toHaveBeenCalledExactlyOnceWith('Сима', 1_500_000);
        await waitFor(() => expect(onDataChanged).toHaveBeenCalledOnce());
    });

    it('выбор сферы шлёт PUT и вызывает onDataChanged', async () => {
        fetchCategoryKindsMock.mockResolvedValueOnce(kinds);
        setCategoryFieldMock.mockResolvedValueOnce({ category: 'Сима', field: 'Дети' });
        const onDataChanged = vi.fn();
        const user = userEvent.setup();
        render(<CategoryKindsSection version={0} onDataChanged={onDataChanged} />);
        await expandSection();

        const fieldSelect = await screen.findByLabelText('Сфера категории Сима');
        await chooseOption(user, fieldSelect, 'Дети');

        expect(setCategoryFieldMock).toHaveBeenCalledExactlyOnceWith('Сима', 'Дети');
        await waitFor(() => expect(onDataChanged).toHaveBeenCalledOnce());
    });

    it('создание новой сферы шлёт POST и вызывает onDataChanged', async () => {
        fetchCategoryKindsMock.mockResolvedValueOnce(kinds);
        createCategoryAreaMock.mockResolvedValueOnce({ name: 'Транспорт' });
        const onDataChanged = vi.fn();
        const user = userEvent.setup();
        render(<CategoryKindsSection version={0} onDataChanged={onDataChanged} />);
        await expandSection();

        await user.type(await screen.findByLabelText('Новая сфера'), 'Транспорт');
        await user.click(screen.getByRole('button', { name: 'Добавить сферу' }));

        expect(createCategoryAreaMock).toHaveBeenCalledExactlyOnceWith('Транспорт');
        await waitFor(() => expect(onDataChanged).toHaveBeenCalledOnce());
    });

    it('пустое имя новой сферы — ошибка без вызова API', async () => {
        fetchCategoryKindsMock.mockResolvedValueOnce(kinds);
        const user = userEvent.setup();
        render(<CategoryKindsSection version={0} onDataChanged={vi.fn()} />);
        await expandSection();

        await user.click(screen.getByRole('button', { name: 'Добавить сферу' }));

        expect(await screen.findByText('Введите название новой сферы')).toBeInTheDocument();
        expect(createCategoryAreaMock).not.toHaveBeenCalled();
    });

    it('создание новой категории шлёт POST и вызывает onDataChanged', async () => {
        fetchCategoryKindsMock.mockResolvedValueOnce(kinds);
        createUserCategoryMock.mockResolvedValueOnce({ name: 'Подарки' });
        const onDataChanged = vi.fn();
        const user = userEvent.setup();
        render(<CategoryKindsSection version={0} onDataChanged={onDataChanged} />);
        await expandSection();

        await user.type(await screen.findByLabelText('Новая категория'), 'Подарки');
        await user.click(screen.getByRole('button', { name: 'Добавить категорию' }));

        expect(createUserCategoryMock).toHaveBeenCalledExactlyOnceWith('Подарки');
        await waitFor(() => expect(onDataChanged).toHaveBeenCalledOnce());
    });

    it('пустое имя новой категории — ошибка без вызова API', async () => {
        fetchCategoryKindsMock.mockResolvedValueOnce(kinds);
        const user = userEvent.setup();
        render(<CategoryKindsSection version={0} onDataChanged={vi.fn()} />);
        await expandSection();

        await user.click(screen.getByRole('button', { name: 'Добавить категорию' }));

        expect(await screen.findByText('Введите название новой категории')).toBeInTheDocument();
        expect(createUserCategoryMock).not.toHaveBeenCalled();
    });

    it('ошибка API при создании категории (дубликат) → ErrorBanner', async () => {
        fetchCategoryKindsMock.mockResolvedValueOnce(kinds);
        createUserCategoryMock.mockRejectedValueOnce(new ApiError(400, 'Категория "Сима" уже существует'));
        const user = userEvent.setup();
        render(<CategoryKindsSection version={0} onDataChanged={vi.fn()} />);
        await expandSection();

        await user.type(await screen.findByLabelText('Новая категория'), 'Сима');
        await user.click(screen.getByRole('button', { name: 'Добавить категорию' }));

        expect(await screen.findByText('Категория "Сима" уже существует')).toBeInTheDocument();
    });

    it('удаление категории: подтверждение шлёт DELETE и вызывает onDataChanged', async () => {
        fetchCategoryKindsMock.mockResolvedValueOnce(kinds);
        deleteUserCategoryMock.mockResolvedValueOnce(undefined);
        const onDataChanged = vi.fn();
        const user = userEvent.setup();
        render(<CategoryKindsSection version={0} onDataChanged={onDataChanged} />);
        await expandSection();

        const taxiItem = (await screen.findByText('Такси / метро / самокаты')).closest('.entity-item') as HTMLElement;
        const deleteBtn = within(taxiItem).getByRole('button', { name: 'Удалить категорию Такси / метро / самокаты' });
        await user.click(deleteBtn);

        const dialog = await screen.findByRole('dialog');
        expect(dialog).toHaveTextContent('Такси / метро / самокаты');
        await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));

        expect(deleteUserCategoryMock).toHaveBeenCalledExactlyOnceWith('Такси / метро / самокаты');
        await waitFor(() => expect(onDataChanged).toHaveBeenCalledOnce());
    });

    it('удаление категории: отмена в диалоге не шлёт DELETE', async () => {
        fetchCategoryKindsMock.mockResolvedValueOnce(kinds);
        const user = userEvent.setup();
        render(<CategoryKindsSection version={0} onDataChanged={vi.fn()} />);
        await expandSection();

        const taxiItem = (await screen.findByText('Такси / метро / самокаты')).closest('.entity-item') as HTMLElement;
        const deleteBtn = within(taxiItem).getByRole('button', { name: 'Удалить категорию Такси / метро / самокаты' });
        await user.click(deleteBtn);

        const dialog = await screen.findByRole('dialog');
        await user.click(within(dialog).getByRole('button', { name: 'Отмена' }));

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(deleteUserCategoryMock).not.toHaveBeenCalled();
    });

    it('ошибка API при удалении категории → ErrorBanner', async () => {
        fetchCategoryKindsMock.mockResolvedValueOnce(kinds);
        deleteUserCategoryMock.mockRejectedValueOnce(new ApiError(400, 'Нельзя удалить служебную категорию «Без категории»'));
        const user = userEvent.setup();
        render(<CategoryKindsSection version={0} onDataChanged={vi.fn()} />);
        await expandSection();

        const taxiItem = (await screen.findByText('Такси / метро / самокаты')).closest('.entity-item') as HTMLElement;
        const deleteBtn = within(taxiItem).getByRole('button', { name: 'Удалить категорию Такси / метро / самокаты' });
        await user.click(deleteBtn);
        const dialog = await screen.findByRole('dialog');
        await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));

        expect(await screen.findByText('Нельзя удалить служебную категорию «Без категории»')).toBeInTheDocument();
    });

    it('переименование категории: карандаш → инлайн-форма → PUT и onDataChanged', async () => {
        fetchCategoryKindsMock.mockResolvedValueOnce(kinds);
        renameUserCategoryMock.mockResolvedValueOnce({ name: 'Транспорт' });
        const onDataChanged = vi.fn();
        const user = userEvent.setup();
        render(<CategoryKindsSection version={0} onDataChanged={onDataChanged} />);
        await expandSection();

        const taxiItem = (await screen.findByText('Такси / метро / самокаты')).closest('.entity-item') as HTMLElement;
        await user.click(within(taxiItem).getByRole('button', { name: 'Переименовать категорию Такси / метро / самокаты' }));

        const input = within(taxiItem).getByDisplayValue('Такси / метро / самокаты');
        await user.clear(input);
        await user.type(input, 'Транспорт');
        await user.click(within(taxiItem).getByRole('button', { name: 'Сохранить' }));

        expect(renameUserCategoryMock).toHaveBeenCalledExactlyOnceWith('Такси / метро / самокаты', 'Транспорт');
        await waitFor(() => expect(onDataChanged).toHaveBeenCalledOnce());
    });

    it('переименование категории: Отмена в инлайн-форме не шлёт PUT', async () => {
        fetchCategoryKindsMock.mockResolvedValueOnce(kinds);
        const user = userEvent.setup();
        render(<CategoryKindsSection version={0} onDataChanged={vi.fn()} />);
        await expandSection();

        const simaItem = (await screen.findByText('Сима')).closest('.entity-item') as HTMLElement;
        await user.click(within(simaItem).getByRole('button', { name: 'Переименовать категорию Сима' }));
        await user.click(within(simaItem).getByRole('button', { name: 'Отмена' }));

        expect(screen.getByText('Сима')).toBeInTheDocument();
        expect(renameUserCategoryMock).not.toHaveBeenCalled();
    });

    it('переименование сферы: карандаш в заголовке группы → PUT и onDataChanged', async () => {
        fetchCategoryKindsMock.mockResolvedValueOnce(kinds);
        fetchCategoryFieldsMock.mockResolvedValueOnce([{ category: 'Сима', field: 'Дети' }]);
        renameCategoryAreaMock.mockResolvedValueOnce({ name: 'Семья' });
        const onDataChanged = vi.fn();
        const user = userEvent.setup();
        render(<CategoryKindsSection version={0} onDataChanged={onDataChanged} />);
        await expandSection();

        await user.click(await screen.findByRole('button', { name: 'Переименовать сферу Дети' }));
        const input = screen.getByLabelText('Новое имя сферы Дети');
        await user.clear(input);
        await user.type(input, 'Семья');
        await user.click(screen.getByRole('button', { name: 'Сохранить' }));

        expect(renameCategoryAreaMock).toHaveBeenCalledExactlyOnceWith('Дети', 'Семья');
        await waitFor(() => expect(onDataChanged).toHaveBeenCalledOnce());
    });

    it('«Без сферы» — псевдо-группа без кнопки переименования', async () => {
        fetchCategoryKindsMock.mockResolvedValueOnce(kinds);
        render(<CategoryKindsSection version={0} onDataChanged={vi.fn()} />);
        await expandSection();

        expect(await screen.findByText('Без сферы')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Переименовать сферу Без сферы' })).not.toBeInTheDocument();
    });
});
