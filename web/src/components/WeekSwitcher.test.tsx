import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WeekSwitcher } from './WeekSwitcher';

/**
 * Переключатель недель. todayIso() внутри берёт Date.now() → системное время
 * подменяется vi.setSystemTime (сеть/моки модулей не нужны: periods.ts чистый).
 * Фикстура: среда 23.09.2026, 15:00 МСК → текущая неделя 21.09–27.09.2026.
 */

function renderSwitcher(offset: number, onChange: (offset: number) => void = vi.fn()): void {
    render(<WeekSwitcher offset={offset} onChange={onChange} />);
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T12:00:00Z'));
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe('WeekSwitcher: подпись диапазона', () => {
    it('текущая неделя: префикс «Текущая неделя ·» и формат «21.09 – 27.09.2026»', () => {
        renderSwitcher(0);
        expect(screen.getByText('Текущая неделя · 21.09 – 27.09.2026')).toBeInTheDocument();
    });

    it('прошлая неделя — только диапазон, без префикса', () => {
        renderSwitcher(-1);
        expect(screen.getByText('14.09 – 20.09.2026')).toBeInTheDocument();
    });
});

describe('WeekSwitcher: доступность «следующей» недели', () => {
    it('для текущей недели «→» disabled (28.09 > 23.09 — неделя не наступила)', () => {
        renderSwitcher(0);
        const next = screen.getByRole('button', { name: 'Следующая неделя' });
        expect(next).toBeDisabled();
        expect(next).toHaveAttribute('title', 'Неделя ещё не наступила');
    });

    it('для прошлой недели «→» активен (21.09 ≤ 23.09)', () => {
        renderSwitcher(-1);
        expect(screen.getByRole('button', { name: 'Следующая неделя' })).toBeEnabled();
    });

    it('«←» всегда активен', () => {
        renderSwitcher(0);
        expect(screen.getByRole('button', { name: 'Прошлая неделя' })).toBeEnabled();
    });
});

describe('WeekSwitcher: клики', () => {
    // fireEvent вместо userEvent: userEvent-клики под fake timers дают
    // непредсказуемые задержки (pointer events ждут реальный таймер) —
    // первый прогон Этапа R2 показал таймауты 5000 мс на этих тестах.
    it('клик «←» вызывает onChange(offset − 1)', () => {
        const onChange = vi.fn();
        renderSwitcher(0, onChange);
        fireEvent.click(screen.getByRole('button', { name: 'Прошлая неделя' }));
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith(-1);
    });

    it('клик «→» на прошлой неделе вызывает onChange(offset + 1)', () => {
        const onChange = vi.fn();
        renderSwitcher(-1, onChange);
        fireEvent.click(screen.getByRole('button', { name: 'Следующая неделя' }));
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith(0);
    });

    it('disabled «→» не вызывает onChange (клик через fireEvent, как раньше делал бы jsdom)', () => {
        const onChange = vi.fn();
        renderSwitcher(0, onChange);
        fireEvent.click(screen.getByRole('button', { name: 'Следующая неделя' }));
        expect(onChange).not.toHaveBeenCalled();
    });
});
