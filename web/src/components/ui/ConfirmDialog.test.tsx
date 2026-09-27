import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * Диалог подтверждения: Esc/подложка/«Отмена» → onCancel, кнопка подтверждения →
 * onConfirm, busy → кнопки disabled и подложка игнорирует клики.
 */

/** Колбэки-обёртки: onClick передаёт SyntheticEvent — события отбрасываются. */
function renderDialog(
    overrides: Partial<Omit<Parameters<typeof ConfirmDialog>[0], 'onConfirm' | 'onCancel'>> = {},
): { onConfirm: ReturnType<typeof vi.fn>; onCancel: ReturnType<typeof vi.fn> } {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
        <ConfirmDialog
            open
            title="Удалить бюджет?"
            description="Бюджет «Продукты» будет удалён безвозвратно"
            onConfirm={onConfirm}
            onCancel={onCancel}
            {...overrides}
        />,
    );
    return { onConfirm, onCancel };
}

afterEach(cleanup);

describe('ConfirmDialog: открыт', () => {
    it('заголовок, описание и кнопки по умолчанию видны', () => {
        renderDialog();
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(screen.getByText('Удалить бюджет?')).toBeInTheDocument();
        expect(screen.getByText('Бюджет «Продукты» будет удалён безвозвратно')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Отмена' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Удалить' })).toBeInTheDocument();
    });

    it('open=false → ничего не рендерится', () => {
        render(
            <ConfirmDialog open={false} title="Удалить бюджет?" onConfirm={vi.fn()} onCancel={vi.fn()} />,
        );
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});

describe('ConfirmDialog: отмена', () => {
    it('Esc → onCancel (без аргументов)', () => {
        const { onCancel } = renderDialog();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onCancel).toHaveBeenCalledWith();
    });

    it('клик по подложке (вне модального окна) → onCancel', () => {
        const { onCancel } = renderDialog();
        fireEvent.click(screen.getByRole('presentation'));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('клик внутри модального окна не доходит до подложки → onCancel НЕ вызывается', () => {
        const { onCancel } = renderDialog();
        fireEvent.click(screen.getByText('Удалить бюджет?'));
        expect(onCancel).not.toHaveBeenCalled();
    });

    it('кнопка «Отмена» → onCancel', async () => {
        const user = userEvent.setup();
        const { onCancel } = renderDialog();
        await user.click(screen.getByRole('button', { name: 'Отмена' }));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });
});

describe('ConfirmDialog: подтверждение', () => {
    it('кнопка подтверждения → onConfirm (не onCancel)', async () => {
        const user = userEvent.setup();
        const { onConfirm, onCancel } = renderDialog({ confirmLabel: 'Удалить' });
        await user.click(screen.getByRole('button', { name: 'Удалить' }));
        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onCancel).not.toHaveBeenCalled();
    });

    it('пользовательские подписи кнопок подхватываются', () => {
        renderDialog({ confirmLabel: 'Списать', cancelLabel: 'Назад' });
        expect(screen.getByRole('button', { name: 'Списать' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument();
    });
});

describe('ConfirmDialog: busy', () => {
    it('обе кнопки disabled', () => {
        renderDialog({ busy: true });
        expect(screen.getByRole('button', { name: 'Отмена' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Удалить' })).toBeDisabled();
    });

    it('клик по подложке при busy игнорируется', () => {
        const { onCancel } = renderDialog({ busy: true });
        fireEvent.click(screen.getByRole('presentation'));
        expect(onCancel).not.toHaveBeenCalled();
    });
});
