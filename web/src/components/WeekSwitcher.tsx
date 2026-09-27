import { formatWeekRange } from '../format';
import { todayIso, weekRangeFromOffset } from '../periods';

/**
 * Переключатель недель (← →): прошлая / текущая / следующая.
 * «Следующая» disabled, если её понедельник позже сегодняшнего московского дня
 * (сама неделя ещё не наступила). Сегодняшний день — todayIso() из periods.ts
 * (раньше UTC+3-сдвиг дублировался локально).
 */

interface Props {
    offset: number; // 0 = текущая неделя, −1 = прошлая, +1 = следующая
    onChange: (offset: number) => void;
}

export function WeekSwitcher({ offset, onChange }: Props): JSX.Element {
    const range = weekRangeFromOffset(offset);
    const isCurrent = offset === 0;
    const label = isCurrent
        ? `Текущая неделя · ${formatWeekRange(range.from, range.to)}`
        : formatWeekRange(range.from, range.to);
    const nextDisabled = weekRangeFromOffset(offset + 1).from > todayIso(); // лексикографическое сравнение

    return (
        <div className="week-switcher">
            <button
                type="button"
                className="btn btn-icon"
                aria-label="Прошлая неделя"
                title="Прошлая неделя"
                onClick={() => onChange(offset - 1)}
            >
                ←
            </button>
            <span className="week-switcher-label">{label}</span>
            <button
                type="button"
                className="btn btn-icon"
                aria-label="Следующая неделя"
                title={nextDisabled ? 'Неделя ещё не наступила' : 'Следующая неделя'}
                disabled={nextDisabled}
                onClick={() => onChange(offset + 1)}
            >
                →
            </button>
        </div>
    );
}
