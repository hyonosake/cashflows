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
 * Секция «Настройки категорий» — плоский список (название + сводка тега/сферы/плана в одну
 * строку), группированный по сфере заголовками. Кнопка «Изменить» у категории открывает попап
 * (EditCategoryDialog) с полями «Название»/«Сфера»/«Тег»/«План на месяц» одной формой; кнопка
 * «Изменить» в заголовке группы сферы открывает попап (EditAreaDialog) с одним полем «Название».
 * ../api мокается (vi.mock) — без сети; сохранение в попапе шлёт нужные PUT (рен­ейм только
 * если имя изменилось, сфера/тег/план — всегда, идемпотентно) и вызывает onDataChanged, ошибка
 * API рендерится через ErrorBanner внутри попапа. «Новая категория»/«Новая сфера» — как раньше,
 * инлайн-формы вверху секции (createUserCategory/createCategoryArea). «Удалить» у категории —
 * иконка-кнопка (без видимого текста, есть aria-label), подтверждается ConfirmDialog
 * (deleteUserCategory), не window.confirm.
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
    setCategoryKindMock.mockResolvedValue({ category: '', kind: null });
    fetchCategoryFieldsMock.mockReset();
    fetchCategoryFieldsMock.mockResolvedValue(fields);
    setCategoryFieldMock.mockReset();
    setCategoryFieldMock.mockResolvedValue({ category: '', field: null });
    fetchCategoryLimitsMock.mockReset();
    fetchCategoryLimitsMock.mockResolvedValue(limits);
    setCategoryLimitMock.mockReset();
    setCategoryLimitMock.mockResolvedValue({ category: '', monthLimitKopecks: null });
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

async function openEditDialog(user: UserEvent, category: string): Promise<HTMLElement> {
    const item = (await screen.findByText(category)).closest('.entity-item') as HTMLElement;
    await user.click(within(item).getByRole('button', { name: `Изменить категорию ${category}` }));
    return screen.findByRole('dialog');
}

describe('CategoryKindsSection', () => {
    it('рендерит плоский список категорий со сводкой тега/сферы/плана', async () => {
        fetchCategoryKindsMock.mockResolvedValueOnce(kinds);
        fetchCategoryFieldsMock.mockResolvedValueOnce([{ category: 'Сима', field: 'Дети' }]);
        fetchCategoryLimitsMock.mockResolvedValueOnce([
            { category: 'Сима', monthLimitKopecks: 1_500_000 },
            { category: 'Такси / метро / самокаты', monthLimitKopecks: null },
        ]);
        render(<CategoryKindsSection version={0} onDataChanged={vi.fn()} />);
        await expandSection();

        const simaItem = (await screen.findByText('Сима')).closest('.entity-item') as HTMLElement;
        expect(simaItem).toHaveTextContent('Постоянная');
        expect(simaItem).toHaveTextContent('сфера «Дети»');
        expect(simaItem).toHaveTextContent('план 15 000 ₽/мес');

        const taxiItem = screen.getByText('Такси / метро / самокаты').closest('.entity-item') as HTMLElement;
        expect(taxiItem).toHaveTextContent('не размечено');
        expect(taxiItem).not.toHaveTextContent('сфера');
        expect(taxiItem).not.toHaveTextContent('план');
    });

    it('«Изменить» открывает попап с текущими значениями полей', async () => {
        fetchCategoryKindsMock.mockResolvedValueOnce(kinds);
        fetchCategoryFieldsMock.mockResolvedValueOnce([{ category: 'Сима', field: 'Дети' }]);
        fetchCategoryLimitsMock.mockResolvedValueOnce([
            { category: 'Сима', monthLimitKopecks: 1_500_000 },
            { category: 'Такси / метро / самокаты', monthLimitKopecks: null },
        ]);
        const user = userEvent.setup();
        render(<CategoryKindsSection version={0} onDataChanged={vi.fn()} />);
        await expandSection();

        const dialog = await openEditDialog(user, 'Сима');
        expect(within(dialog).getByLabelText('Название')).toHaveValue('Сима');
        expect(within(dialog).getByLabelText('Сфера')).toHaveValue('Дети');
        expect(within(dialog).getByLabelText('Тег')).toHaveValue('Постоянная');
        expect(within(dialog).getByLabelText('План на месяц, ₽')).toHaveValue('15000,00');
    });

    it('сохранение в попапе шлёт setField/setKind/setLimit и вызывает onDataChanged', async () => {
        fetchCategoryKindsMock.mockResolvedValueOnce(kinds);
        const onDataChanged = vi.fn();
        const user = userEvent.setup();
        render(<CategoryKindsSection version={0} onDataChanged={onDataChanged} />);
        await expandSection();

        const dialog = await openEditDialog(user, 'Такси / метро / самокаты');
        await chooseOption(user, within(dialog).getByLabelText('Сфера'), 'Дети');
        await chooseOption(user, within(dialog).getByLabelText('Тег'), 'Переменная');
        await user.type(within(dialog).getByLabelText('План на месяц, ₽'), '15000');
        await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

        expect(renameUserCategoryMock).not.toHaveBeenCalled();
        expect(setCategoryFieldMock).toHaveBeenCalledExactlyOnceWith('Такси / метро / самокаты', 'Дети');
        expect(setCategoryKindMock).toHaveBeenCalledExactlyOnceWith('Такси / метро / самокаты', 'variable');
        expect(setCategoryLimitMock).toHaveBeenCalledExactlyOnceWith('Такси / метро / самокаты', 1_500_000);
        await waitFor(() => expect(onDataChanged).toHaveBeenCalledOnce());
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('переименование в попапе шлёт renameUserCategory перед остальными полями', async () => {
        fetchCategoryKindsMock.mockResolvedValueOnce(kinds);
        renameUserCategoryMock.mockResolvedValueOnce({ name: 'Транспорт' });
        const onDataChanged = vi.fn();
        const user = userEvent.setup();
        render(<CategoryKindsSection version={0} onDataChanged={onDataChanged} />);
        await expandSection();

        const dialog = await openEditDialog(user, 'Такси / метро / самокаты');
        const nameInput = within(dialog).getByLabelText('Название');
        await user.clear(nameInput);
        await user.type(nameInput, 'Транспорт');
        await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

        expect(renameUserCategoryMock).toHaveBeenCalledExactlyOnceWith('Такси / метро / самокаты', 'Транспорт');
        expect(setCategoryFieldMock).toHaveBeenCalledExactlyOnceWith('Транспорт', null);
        await waitFor(() => expect(onDataChanged).toHaveBeenCalledOnce());
    });

    it('некорректный план в попапе — локальная ошибка без вызова API', async () => {
        fetchCategoryKindsMock.mockResolvedValueOnce(kinds);
        const user = userEvent.setup();
        render(<CategoryKindsSection version={0} onDataChanged={vi.fn()} />);
        await expandSection();

        const dialog = await openEditDialog(user, 'Сима');
        await user.type(within(dialog).getByLabelText('План на месяц, ₽'), '-5');
        await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

        expect(await within(dialog).findByText(/План должен быть положительным числом/)).toBeInTheDocument();
        expect(setCategoryLimitMock).not.toHaveBeenCalled();
    });

    it('ошибка API при сохранении попапа → ErrorBanner внутри попапа', async () => {
        fetchCategoryKindsMock.mockResolvedValueOnce(kinds);
        setCategoryKindMock.mockRejectedValueOnce(new ApiError(400, 'Ошибка валидации запроса'));
        const user = userEvent.setup();
        render(<CategoryKindsSection version={0} onDataChanged={vi.fn()} />);
        await expandSection();

        const dialog = await openEditDialog(user, 'Такси / метро / самокаты');
        await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

        expect(await within(dialog).findByText('Ошибка валидации запроса')).toBeInTheDocument();
    });

    it('Отмена в попапе закрывает его без вызова API', async () => {
        fetchCategoryKindsMock.mockResolvedValueOnce(kinds);
        const user = userEvent.setup();
        render(<CategoryKindsSection version={0} onDataChanged={vi.fn()} />);
        await expandSection();

        const dialog = await openEditDialog(user, 'Сима');
        await user.click(within(dialog).getByRole('button', { name: 'Отмена' }));

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(setCategoryKindMock).not.toHaveBeenCalled();
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

    it('переименование сферы: «Изменить» в заголовке группы → попап → PUT и onDataChanged', async () => {
        fetchCategoryKindsMock.mockResolvedValueOnce(kinds);
        fetchCategoryFieldsMock.mockResolvedValueOnce([{ category: 'Сима', field: 'Дети' }]);
        renameCategoryAreaMock.mockResolvedValueOnce({ name: 'Семья' });
        const onDataChanged = vi.fn();
        const user = userEvent.setup();
        render(<CategoryKindsSection version={0} onDataChanged={onDataChanged} />);
        await expandSection();

        await user.click(await screen.findByRole('button', { name: 'Изменить сферу Дети' }));
        const dialog = await screen.findByRole('dialog');
        const input = within(dialog).getByLabelText('Название');
        await user.clear(input);
        await user.type(input, 'Семья');
        await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

        expect(renameCategoryAreaMock).toHaveBeenCalledExactlyOnceWith('Дети', 'Семья');
        await waitFor(() => expect(onDataChanged).toHaveBeenCalledOnce());
    });

    it('«Без сферы» — псевдо-группа без кнопки «Изменить»', async () => {
        fetchCategoryKindsMock.mockResolvedValueOnce(kinds);
        render(<CategoryKindsSection version={0} onDataChanged={vi.fn()} />);
        await expandSection();

        expect(await screen.findByText('Без сферы')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Изменить сферу Без сферы' })).not.toBeInTheDocument();
    });
});
