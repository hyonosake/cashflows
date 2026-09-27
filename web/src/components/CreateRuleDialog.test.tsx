import { cleanup, render, screen } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OperationDto } from '../../../shared/types';
import { CreateRuleDialog } from './CreateRuleDialog';

/**
 * Диалог «Создать правило из операции» (страница «Операции»): предзаполнение из
 * выбранной операции + переключение типа сопоставления пересчитывает подсказку
 * значения. Сохранение/сеть — забота вызывающей стороны (Operations.tsx), здесь
 * проверяется только форма и колбэки onSave/onCancel.
 *
 * Целевая категория и тип сопоставления — SearchableSelect (комбобокс с текстовым
 * поиском, не нативный select): выбор варианта — клик по инпуту, затем клик по
 * пункту списка (role="option") с нужным текстом, а не user.selectOptions.
 */

async function chooseOption(user: UserEvent, input: HTMLElement, optionName: string | RegExp): Promise<void> {
    await user.click(input);
    await user.click(await screen.findByRole('option', { name: optionName }));
}

const emptySpheres = new Map<string, string | null>();

function operation(overrides: Partial<OperationDto> = {}): OperationDto {
    return {
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
        ...overrides,
    };
}

afterEach(cleanup);

describe('CreateRuleDialog', () => {
    it('не рендерится, если операция не выбрана', () => {
        render(
            <CreateRuleDialog operation={null} categories={[]} categorySpheres={emptySpheres} saving={false} error={null} onCancel={vi.fn()} onSave={vi.fn()} onSaveOnce={vi.fn()} />,
        );
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('предзаполняет значение описанием операции по умолчанию', () => {
        render(
            <CreateRuleDialog
                operation={operation()}
                categories={['Жильё и связь']}
                categorySpheres={emptySpheres}
                saving={false}
                error={null}
                onCancel={vi.fn()}
                onSave={vi.fn()}
                onSaveOnce={vi.fn()}
            />,
        );
        expect(screen.getByLabelText('Значение')).toHaveValue('МТС Мобайл');
        expect(screen.getByLabelText('Целевая категория')).toHaveValue('Мобильная связь');
    });

    it('смена типа сопоставления пересчитывает подсказку значения', async () => {
        const user = userEvent.setup();
        render(
            <CreateRuleDialog operation={operation()} categories={[]} categorySpheres={emptySpheres} saving={false} error={null} onCancel={vi.fn()} onSave={vi.fn()} onSaveOnce={vi.fn()} />,
        );

        const matchTypeInput = screen.getByLabelText('Тип сопоставления');
        await chooseOption(user, matchTypeInput, 'MCC-код');
        expect(screen.getByLabelText('Значение')).toHaveValue('4814');

        await chooseOption(user, matchTypeInput, 'Мерчант (описание) целиком');
        expect(screen.getByLabelText('Значение')).toHaveValue('МТС Мобайл');
    });

    it('вариант MCC недоступен, если у операции нет MCC', async () => {
        const user = userEvent.setup();
        render(
            <CreateRuleDialog
                operation={operation({ mcc: null })}
                categories={[]}
                categorySpheres={emptySpheres}
                saving={false}
                error={null}
                onCancel={vi.fn()}
                onSave={vi.fn()}
                onSaveOnce={vi.fn()}
            />,
        );
        await user.click(screen.getByLabelText('Тип сопоставления'));
        expect(await screen.findByRole('option', { name: /MCC-код/ })).toHaveAttribute('aria-disabled', 'true');
    });

    it('сохранение вызывает onSave с введёнными значениями', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn();
        render(
            <CreateRuleDialog
                operation={operation()}
                categories={['Мобильная связь', 'Жильё и связь']}
                categorySpheres={emptySpheres}
                saving={false}
                error={null}
                onCancel={vi.fn()}
                onSave={onSave}
                onSaveOnce={vi.fn()}
            />,
        );

        await chooseOption(user, screen.getByLabelText('Целевая категория'), 'Жильё и связь');
        await user.click(screen.getByRole('button', { name: 'Добавить правило' }));

        expect(onSave).toHaveBeenCalledExactlyOnceWith({
            kind: 'merchant',
            merchant: 'МТС Мобайл',
            targetCategory: 'Жильё и связь',
        });
    });

    it('отмена вызывает onCancel и недоступна во время сохранения', async () => {
        const user = userEvent.setup();
        const onCancel = vi.fn();
        const { rerender } = render(
            <CreateRuleDialog operation={operation()} categories={[]} categorySpheres={emptySpheres} saving={false} error={null} onCancel={onCancel} onSave={vi.fn()} onSaveOnce={vi.fn()} />,
        );
        await user.click(screen.getByRole('button', { name: 'Отмена' }));
        expect(onCancel).toHaveBeenCalledOnce();

        rerender(
            <CreateRuleDialog operation={operation()} categories={[]} categorySpheres={emptySpheres} saving={true} error={null} onCancel={onCancel} onSave={vi.fn()} onSaveOnce={vi.fn()} />,
        );
        expect(screen.getByRole('button', { name: 'Отмена' })).toBeDisabled();
    });

    it('снятый чекбокс скрывает поля правила и вызывает onSaveOnce только с категорией', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn();
        const onSaveOnce = vi.fn();
        render(
            <CreateRuleDialog
                operation={operation()}
                categories={['Мобильная связь', 'Разовое']}
                categorySpheres={emptySpheres}
                saving={false}
                error={null}
                onCancel={vi.fn()}
                onSave={onSave}
                onSaveOnce={onSaveOnce}
            />,
        );

        await user.click(screen.getByRole('checkbox'));
        expect(screen.queryByLabelText('Тип сопоставления')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Значение')).not.toBeInTheDocument();

        await chooseOption(user, screen.getByLabelText('Целевая категория'), 'Разовое');
        await user.click(screen.getByRole('button', { name: 'Сохранить категорию' }));

        expect(onSaveOnce).toHaveBeenCalledExactlyOnceWith('Разовое');
        expect(onSave).not.toHaveBeenCalled();
    });

    it('вариант «Комментарий содержит» недоступен, если у операции нет комментария', async () => {
        const user = userEvent.setup();
        render(
            <CreateRuleDialog
                operation={operation({ message: '' })}
                categories={[]}
                categorySpheres={emptySpheres}
                saving={false}
                error={null}
                onCancel={vi.fn()}
                onSave={vi.fn()}
                onSaveOnce={vi.fn()}
            />,
        );
        await user.click(screen.getByLabelText('Тип сопоставления'));
        expect(await screen.findByRole('option', { name: /Комментарий содержит/ })).toHaveAttribute('aria-disabled', 'true');
    });

    it('подпись варианта целевой категории дополняется сферой (для похожих по названию категорий)', async () => {
        const user = userEvent.setup();
        const spheres = new Map<string, string | null>([
            ['Психолог', 'Сима'],
            ['Психолог Лёхи', 'Психология и здоровье'],
        ]);
        render(
            <CreateRuleDialog
                operation={operation()}
                categories={['Психолог', 'Психолог Лёхи']}
                categorySpheres={spheres}
                saving={false}
                error={null}
                onCancel={vi.fn()}
                onSave={vi.fn()}
                onSaveOnce={vi.fn()}
            />,
        );

        await user.click(screen.getByLabelText('Целевая категория'));
        expect(await screen.findByRole('option', { name: 'Психолог (Сима)' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Психолог Лёхи (Психология и здоровье)' })).toBeInTheDocument();
    });

    it('показывает ошибку сохранения', () => {
        render(
            <CreateRuleDialog
                operation={operation()}
                categories={[]}
                categorySpheres={emptySpheres}
                saving={false}
                error="Ошибка валидации запроса"
                onCancel={vi.fn()}
                onSave={vi.fn()}
                onSaveOnce={vi.fn()}
            />,
        );
        expect(screen.getByText('Ошибка валидации запроса')).toBeInTheDocument();
    });
});
