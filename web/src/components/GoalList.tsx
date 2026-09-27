import type { DashboardDto } from '../../../shared/types';
import { formatMoney } from '../format';

/**
 * Блок «Финансовые цели» (dashboard.goals) — минимальный вид без автопрогресса
 * (осознанный урезанный камбэк, см. рефакторинг категорий): просто имя + сумма.
 * Управление — секция «Настройки» (GoalsSection).
 */

interface Props {
    dashboard: DashboardDto;
}

export function GoalList({ dashboard }: Props): JSX.Element {
    const goals = dashboard.goals;

    if (goals.length === 0) {
        return (
            <div className="panel">
                <h2>Финансовые цели</h2>
                <p className="empty">Целей пока нет. Создайте их в «Настройках».</p>
            </div>
        );
    }

    return (
        <div className="panel">
            <h2>Финансовые цели ({goals.length})</h2>
            <div className="entity-list">
                {goals.map((g) => (
                    <div key={g.id} className="entity-item">
                        <div className="entity-main">
                            <div className="entity-title">{g.name}</div>
                        </div>
                        <span>{formatMoney(g.amountKopecks)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
