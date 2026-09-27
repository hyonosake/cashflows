import { useState } from 'react';
import type { GoalDto, GoalInputDto } from '../../../shared/types';
import { apiErrorText, createGoal, deleteGoal, updateGoal } from '../api';
import { useGoals } from '../hooks/useGoals';
import { useConfirmDelete } from '../hooks/useConfirmDelete';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Spinner } from '../components/ui/Spinner';
import { formatMoney, kopecksToRublesInput, parseRublesToKopecks } from '../format';

/**
 * Секция «Финансовые цели» страницы «Настройки»: форма создания/редактирования + список.
 * Минимальный вид — имя + сумма, без categories[]/автопрогресса (осознанный урезанный
 * камбэк после отказа от полной фичи, см. рефакторинг категорий).
 */

interface Props {
    version: number;
    onDataChanged: () => void;
}

interface GoalFormState {
    id: number | null; // null → создание
    name: string;
    amountRubles: string;
}

function emptyGoalForm(): GoalFormState {
    return { id: null, name: '', amountRubles: '' };
}

function goalToForm(g: GoalDto): GoalFormState {
    return { id: g.id, name: g.name, amountRubles: kopecksToRublesInput(g.amountKopecks) };
}

export function GoalsSection({ version, onDataChanged }: Props): JSX.Element {
    const goalsQuery = useGoals(version);
    const goals = goalsQuery.data ?? [];

    const [form, setForm] = useState<GoalFormState>(emptyGoalForm);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const goalDelete = useConfirmDelete<number>();

    const saveGoal = async (): Promise<void> => {
        if (form.name.trim() === '') {
            setError('Название цели обязательно');
            return;
        }
        const amountKopecks = parseRublesToKopecks(form.amountRubles);
        if (amountKopecks === null || amountKopecks <= 0) {
            setError('Сумма должна быть положительной, например «100000»');
            return;
        }
        const input: GoalInputDto = { name: form.name.trim(), amountKopecks };
        setSaving(true);
        setError(null);
        try {
            if (form.id === null) {
                await createGoal(input);
            } else {
                await updateGoal(form.id, input);
            }
            setForm(emptyGoalForm());
            onDataChanged();
        } catch (e: unknown) {
            setError(apiErrorText(e));
        } finally {
            setSaving(false);
        }
    };

    const removeGoal = async (id: number): Promise<void> => {
        try {
            await deleteGoal(id);
            if (form.id === id) setForm(emptyGoalForm());
            onDataChanged();
        } catch (e: unknown) {
            setError(apiErrorText(e));
            throw e;
        }
    };

    const pendingGoal = goalDelete.pending === null ? undefined : goals.find((g) => g.id === goalDelete.pending);
    const listLoading = goalsQuery.loading && goals.length === 0;

    return (
        <div className="panel">
            <h2>Финансовые цели</h2>
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    void saveGoal();
                }}
            >
                <div className="form-grid">
                    <div className="field">
                        <label htmlFor="goal-name">Название</label>
                        <input
                            id="goal-name"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            placeholder="Финансовая подушка"
                        />
                    </div>
                    <div className="field">
                        <label htmlFor="goal-amount">Сумма, ₽</label>
                        <input
                            id="goal-amount"
                            value={form.amountRubles}
                            onChange={(e) => setForm({ ...form, amountRubles: e.target.value })}
                            placeholder="1000000"
                            inputMode="decimal"
                        />
                    </div>
                </div>
                <div className="form-actions">
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                        {form.id === null ? 'Создать цель' : 'Сохранить изменения'}
                    </button>
                    {form.id !== null && (
                        <button type="button" className="btn" onClick={() => setForm(emptyGoalForm())} disabled={saving}>
                            Отменить
                        </button>
                    )}
                </div>
            </form>
            {error !== null && <ErrorBanner message={error} />}
            {goalsQuery.error !== null && <ErrorBanner message={goalsQuery.error} />}

            {listLoading ? (
                <div className="state-box">
                    <Spinner />
                    <span>Загрузка целей…</span>
                </div>
            ) : (
                <div className="entity-list">
                    {goals.length === 0 && <p className="empty">Целей пока нет.</p>}
                    {goals.map((g) => (
                        <div className="entity-item" key={g.id}>
                            <div className="entity-main">
                                <div className="entity-title">{g.name}</div>
                                <div className="entity-sub">{formatMoney(g.amountKopecks)}</div>
                            </div>
                            <div className="entity-actions">
                                <button type="button" className="btn btn-small" onClick={() => setForm(goalToForm(g))}>
                                    Изменить
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-small btn-danger"
                                    disabled={goalDelete.busy}
                                    onClick={() => goalDelete.requestDelete(g.id)}
                                >
                                    Удалить
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <ConfirmDialog
                open={pendingGoal !== undefined}
                title={`Удалить цель «${pendingGoal?.name ?? ''}»?`}
                confirmLabel="Удалить"
                busy={goalDelete.busy}
                onCancel={goalDelete.cancel}
                onConfirm={() => void goalDelete.confirm(removeGoal)}
            />
        </div>
    );
}
