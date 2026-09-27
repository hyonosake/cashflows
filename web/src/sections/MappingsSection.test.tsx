import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CategoryFieldDto, CustomMappingDto, McCodeOptionDto, McMappingDto } from '../../../shared/types';
import { MappingsSection } from './MappingsSection';
import {
    ApiError,
    createCustomMapping,
    createMcMapping,
    deleteCustomMapping,
    deleteMcMapping,
    fetchCategoryFields,
    fetchCustomMappings,
    fetchMcMappings,
    fetchMccOptions,
} from '../api';

/**
 * Секция «Настройки» — CRUD правил по MCC-коду и по подстроке в «Сообщении».
 * ../api мокается (vi.mock) — без сети. Живой JOIN — пересчёт после CRUD не нужен,
 * только onDataChanged (перезагрузить оба списка). Порядок в UI — сообщение (1),
 * заметка про мерчантов (2), MCC (3) — совпадает с порядком применения правил.
 * MCC — SearchableSelect из fetchMccOptions (коды из реальных операций с примерами названий),
 * а не свободный текстовый ввод «вслепую»; без опций форма не рендерится, вместо неё —
 * подсказка импортировать CSV. Целевая категория ОБОИХ правил — тоже SearchableSelect из
 * fetchCategoryFields (тот же набор, что и fetchCategories(scope='user'), но сразу со сферой
 * каждой категории — подпись варианта дополняется сферой, см. MappingsSection.tsx docstring),
 * не свободный текст. SearchableSelect — комбобокс с текстовым поиском, не нативный select:
 * выбор варианта — клик по инпуту, затем клик по пункту списка (role="option").
 */

async function chooseOption(user: UserEvent, input: HTMLElement, optionName: string | RegExp): Promise<void> {
    await user.click(input);
    await user.click(await screen.findByRole('option', { name: optionName }));
}

vi.mock('../api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../api')>();
    return {
        ...actual,
        fetchMcMappings: vi.fn(),
        fetchMccOptions: vi.fn(),
        createMcMapping: vi.fn(),
        deleteMcMapping: vi.fn(),
        fetchCustomMappings: vi.fn(),
        createCustomMapping: vi.fn(),
        deleteCustomMapping: vi.fn(),
        fetchCategoryFields: vi.fn(),
    };
});

const fetchMcMappingsMock = vi.mocked(fetchMcMappings);
const fetchMccOptionsMock = vi.mocked(fetchMccOptions);
const createMcMappingMock = vi.mocked(createMcMapping);
const deleteMcMappingMock = vi.mocked(deleteMcMapping);
const fetchCustomMappingsMock = vi.mocked(fetchCustomMappings);
const createCustomMappingMock = vi.mocked(createCustomMapping);
const deleteCustomMappingMock = vi.mocked(deleteCustomMapping);
const fetchCategoryFieldsMock = vi.mocked(fetchCategoryFields);

const mcMappings: McMappingDto[] = [{ mcc: '4111', targetCategory: 'Такси / метро / самокаты' }];
const customMappings: CustomMappingDto[] = [{ id: 1, matchValue: 'за занятия', targetCategory: 'Английский' }];
const mcOptions: McCodeOptionDto[] = [
    { mcc: '4111', examples: ['Яндекс.Такси'], operationsCount: 12 },
    { mcc: '5411', examples: ['Пятёрочка', 'Магнит'], operationsCount: 40 },
];
const userCategories = ['Английский', 'Гитара', 'Продукты + бытовая химия', 'Такси / метро / самокаты'];
const categoryFields: CategoryFieldDto[] = userCategories.map((category) => ({ category, field: null }));

beforeEach(() => {
    fetchMcMappingsMock.mockReset();
    fetchMccOptionsMock.mockReset();
    createMcMappingMock.mockReset();
    deleteMcMappingMock.mockReset();
    fetchCustomMappingsMock.mockReset();
    createCustomMappingMock.mockReset();
    deleteCustomMappingMock.mockReset();
    fetchCategoryFieldsMock.mockReset();
    fetchMcMappingsMock.mockResolvedValue([]);
    fetchMccOptionsMock.mockResolvedValue(mcOptions);
    fetchCustomMappingsMock.mockResolvedValue([]);
    fetchCategoryFieldsMock.mockResolvedValue(categoryFields);
});

afterEach(cleanup);

/** Секция сворачиваема (defaultOpen=false, много записей) — раскрыть перед проверкой содержимого. */
async function expandSection(): Promise<void> {
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Специальные правила категоризации' }));
}

describe('MappingsSection', () => {
    it('рендерит списки правил по MCC (с примером мерчанта) и по сообщению', async () => {
        fetchMcMappingsMock.mockResolvedValueOnce(mcMappings);
        fetchCustomMappingsMock.mockResolvedValueOnce(customMappings);
        render(<MappingsSection version={0} onDataChanged={vi.fn()} />);
        await expandSection();

        expect(await screen.findByText('Такси / метро / самокаты', { selector: '.entity-title' })).toBeInTheDocument();
        expect(screen.getByText(/MCC 4111/)).toBeInTheDocument();
        expect(screen.getByText(/например «Яндекс\.Такси»/)).toBeInTheDocument();
        expect(screen.getByText('Английский', { selector: '.entity-title' })).toBeInTheDocument();
        expect(screen.getByText('содержит «за занятия»')).toBeInTheDocument();
    });

    it('без MCC-кодов в операциях — подсказка вместо формы', async () => {
        fetchMccOptionsMock.mockResolvedValueOnce([]);
        render(<MappingsSection version={0} onDataChanged={vi.fn()} />);
        await expandSection();

        expect(await screen.findByText(/сначала импортируйте CSV/)).toBeInTheDocument();
        expect(screen.queryByLabelText(/MCC/)).not.toBeInTheDocument();
    });

    it('целевая категория — SearchableSelect из категорий пользователя, не свободный текст', async () => {
        const user = userEvent.setup();
        render(<MappingsSection version={0} onDataChanged={vi.fn()} />);
        await expandSection();

        const customTarget = await screen.findByLabelText('Целевая категория', { selector: '#custom-target' });
        const mccTarget = screen.getByLabelText('Целевая категория', { selector: '#mcc-target' });
        expect(customTarget).toHaveAttribute('role', 'combobox');
        expect(mccTarget).toHaveAttribute('role', 'combobox');

        await user.click(customTarget);
        const options = (await screen.findAllByRole('option')).map((o) => o.textContent);
        expect(options).toEqual(expect.arrayContaining(userCategories));
    });

    it('создание правила по MCC: выбор кода и категории из select, onDataChanged', async () => {
        createMcMappingMock.mockResolvedValueOnce({ mcc: '5411', targetCategory: 'Продукты + бытовая химия' });
        const onDataChanged = vi.fn();
        const user = userEvent.setup();
        render(<MappingsSection version={0} onDataChanged={onDataChanged} />);
        await expandSection();

        await screen.findByText('Правил по MCC пока нет.');
        await chooseOption(user, screen.getByLabelText('MCC (по примеру мерчанта)'), /^5411/);
        await chooseOption(user, screen.getByLabelText('Целевая категория', { selector: '#mcc-target' }), 'Продукты + бытовая химия');
        await user.click(screen.getAllByRole('button', { name: 'Добавить правило' })[1] as HTMLElement);

        await waitFor(() =>
            expect(createMcMappingMock).toHaveBeenCalledExactlyOnceWith({ mcc: '5411', targetCategory: 'Продукты + бытовая химия' }),
        );
        expect(onDataChanged).toHaveBeenCalledOnce();
    });

    it('удаление правила по MCC: onDataChanged', async () => {
        fetchMcMappingsMock.mockResolvedValueOnce(mcMappings);
        deleteMcMappingMock.mockResolvedValueOnce(undefined);
        const onDataChanged = vi.fn();
        const user = userEvent.setup();
        render(<MappingsSection version={0} onDataChanged={onDataChanged} />);
        await expandSection();

        await screen.findByText('Такси / метро / самокаты', { selector: '.entity-title' });
        await user.click(screen.getByRole('button', { name: 'Удалить' }));
        const dialog = screen.getByRole('dialog');
        await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));

        await waitFor(() => expect(deleteMcMappingMock).toHaveBeenCalledExactlyOnceWith('4111'));
        expect(onDataChanged).toHaveBeenCalledOnce();
    });

    it('создание правила по сообщению: выбор категории из select, onDataChanged', async () => {
        createCustomMappingMock.mockResolvedValueOnce({ id: 2, matchValue: 'за гитару', targetCategory: 'Гитара' });
        const onDataChanged = vi.fn();
        const user = userEvent.setup();
        render(<MappingsSection version={0} onDataChanged={onDataChanged} />);
        await expandSection();

        await screen.findByText('Правил по сообщению пока нет.');
        await user.type(screen.getByLabelText('Подстрока в сообщении'), 'за гитару');
        await chooseOption(user, screen.getByLabelText('Целевая категория', { selector: '#custom-target' }), 'Гитара');
        await user.click(screen.getAllByRole('button', { name: 'Добавить правило' })[0] as HTMLElement);

        await waitFor(() =>
            expect(createCustomMappingMock).toHaveBeenCalledExactlyOnceWith({ matchValue: 'за гитару', targetCategory: 'Гитара' }),
        );
        expect(onDataChanged).toHaveBeenCalledOnce();
    });

    it('подпись варианта целевой категории дополняется сферой', async () => {
        fetchCategoryFieldsMock.mockResolvedValueOnce([
            { category: 'Английский', field: 'Сима' },
            { category: 'Гитара', field: 'Сима' },
        ]);
        const user = userEvent.setup();
        render(<MappingsSection version={0} onDataChanged={vi.fn()} />);
        await expandSection();

        const customTarget = await screen.findByLabelText('Целевая категория', { selector: '#custom-target' });
        await user.click(customTarget);
        expect(await screen.findByRole('option', { name: 'Английский (Сима)' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Гитара (Сима)' })).toBeInTheDocument();
    });

    it('ошибка при создании правила по MCC → ErrorBanner', async () => {
        createMcMappingMock.mockRejectedValueOnce(new ApiError(400, 'Ошибка валидации запроса'));
        const user = userEvent.setup();
        render(<MappingsSection version={0} onDataChanged={vi.fn()} />);
        await expandSection();

        await screen.findByText('Правил по MCC пока нет.');
        await chooseOption(user, screen.getByLabelText('MCC (по примеру мерчанта)'), /^4111/);
        await chooseOption(user, screen.getByLabelText('Целевая категория', { selector: '#mcc-target' }), 'Такси / метро / самокаты');
        await user.click(screen.getAllByRole('button', { name: 'Добавить правило' })[1] as HTMLElement);

        expect(await screen.findByText('Ошибка валидации запроса')).toBeInTheDocument();
    });
});
