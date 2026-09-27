import { useEffect, useState } from 'react';
import { apiErrorText, updateSettings } from '../api';
import { useSettings } from '../hooks/useSettings';
import { kopecksToRublesInput, parseRublesToKopecks } from '../format';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Spinner } from '../components/ui/Spinner';

/**
 * Секция «Настройки» — дни зарплаты + доход за один день зарплаты (план) + займы (сколько
 * должны пользователю другие люди). Дни зарплаты используются в «Обзоре месяца» для «дней до
 * ЗП»; несколько дней через запятую — зарплата может приходить несколько раз в месяц (например
 * «7, 22»). Доход за один день зарплаты × число дней зарплаты = план дохода месяца
 * (MonthOverviewDto.plannedIncomeKopecks) — из него считаются «Расходы»/«Баланс» плана в
 * «Обзоре месяца» (факт расходов месяца берётся из операций, план дохода — из этой настройки,
 * а не из фактических income-операций). Займы — чисто справочная ручная цифра (нет сущности
 * «займы» в схеме, см. AGENTS.md), показывается серым рядом с Доход/Расходы/Баланс. Сохранение
 * вызывает onDataChanged() — дашборд перезагрузится.
 */

interface Props {
    version: number;
    onDataChanged: () => void;
}

/** «7, 22» / «7 22» → [7, 22]; нечисловые и вне диапазона 1..31 токены игнорируются. */
function parseSalaryDays(raw: string): number[] {
    const days = raw
        .split(/[,\s]+/)
        .map((token) => Number(token.trim()))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 31);
    return Array.from(new Set(days)).sort((a, b) => a - b);
}

/** '' → null (не задано); иначе рубли в копейки; undefined — нераспознанный/неположительный ввод. */
function parseOptionalAmount(raw: string): number | null | undefined {
    const trimmed = raw.trim();
    if (trimmed === '') return null;
    const kopecks = parseRublesToKopecks(trimmed);
    return kopecks !== null && kopecks > 0 ? kopecks : undefined;
}

export function GeneralSettingsSection({ version, onDataChanged }: Props): JSX.Element {
    const settingsQuery = useSettings(version);
    const [salaryDaysInput, setSalaryDaysInput] = useState('');
    const [salaryAmountInput, setSalaryAmountInput] = useState('');
    const [owedToUserInput, setOwedToUserInput] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (settingsQuery.data !== null) {
            setSalaryDaysInput(settingsQuery.data.salaryDays.join(', '));
            setSalaryAmountInput(
                settingsQuery.data.salaryAmountKopecks === null ? '' : kopecksToRublesInput(settingsQuery.data.salaryAmountKopecks),
            );
            setOwedToUserInput(
                settingsQuery.data.owedToUserKopecks === null ? '' : kopecksToRublesInput(settingsQuery.data.owedToUserKopecks),
            );
        }
    }, [settingsQuery.data]);

    const handleSave = async (): Promise<void> => {
        const trimmedDays = salaryDaysInput.trim();
        const salaryDays = trimmedDays === '' ? [] : parseSalaryDays(trimmedDays);
        if (trimmedDays !== '' && salaryDays.length === 0) {
            setError('Не удалось распознать ни одного дня месяца (1–31) — проверьте формат, например «7, 22»');
            return;
        }
        const salaryAmountKopecks = parseOptionalAmount(salaryAmountInput);
        if (salaryAmountKopecks === undefined) {
            setError('Доход за день зарплаты должен быть положительным числом, например «220000»');
            return;
        }
        const owedToUserKopecks = parseOptionalAmount(owedToUserInput);
        if (owedToUserKopecks === undefined) {
            setError('Сумма займов должна быть положительным числом, например «50000»');
            return;
        }
        setSaving(true);
        setError(null);
        setSaved(false);
        try {
            await updateSettings({ salaryDays, salaryAmountKopecks, owedToUserKopecks });
            setSaved(true);
            onDataChanged();
        } catch (e: unknown) {
            setError(apiErrorText(e, 'Не удалось сохранить настройки'));
        } finally {
            setSaving(false);
        }
    };

    const listLoading = settingsQuery.loading && settingsQuery.data === null;

    return (
        <div className="panel">
            <h2>Общие настройки</h2>
            <p className="muted" style={{ marginTop: -6, marginBottom: 12 }}>
                Дни зарплаты используются в «Обзоре месяца» на дашборде — оттуда считаются дни до
                ближайшего поступления. Несколько дней — через запятую (например «7, 22», если
                зарплата приходит дважды в месяц). Доход за один день зарплаты × число дней —
                план дохода месяца, из него считаются «Расходы»/«Баланс» в «Обзоре месяца». Займы —
                справочная сумма (сколько должны вам другие люди), показывается серым рядом с
                Доход/Расходы/Баланс. Оставьте поле пустым, чтобы не показывать соответствующий
                счётчик/план/карточку.
            </p>
            {error !== null && <ErrorBanner message={error} />}
            {settingsQuery.error !== null && <ErrorBanner message={settingsQuery.error} />}

            {listLoading ? (
                <div className="state-box">
                    <Spinner />
                    <span>Загрузка настроек…</span>
                </div>
            ) : (
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        void handleSave();
                    }}
                >
                    <div className="form-grid">
                        <div className="field">
                            <label htmlFor="salary-days">Дни зарплаты (1–31, через запятую)</label>
                            <input
                                id="salary-days"
                                value={salaryDaysInput}
                                onChange={(e) => {
                                    setSalaryDaysInput(e.target.value);
                                    setSaved(false);
                                }}
                                placeholder="7, 22"
                            />
                        </div>
                        <div className="field">
                            <label htmlFor="salary-amount">Доход за один день зарплаты, ₽</label>
                            <input
                                id="salary-amount"
                                value={salaryAmountInput}
                                onChange={(e) => {
                                    setSalaryAmountInput(e.target.value);
                                    setSaved(false);
                                }}
                                placeholder="220000"
                            />
                        </div>
                        <div className="field">
                            <label htmlFor="owed-to-user">Займы — сколько должны нам, ₽</label>
                            <input
                                id="owed-to-user"
                                value={owedToUserInput}
                                onChange={(e) => {
                                    setOwedToUserInput(e.target.value);
                                    setSaved(false);
                                }}
                                placeholder="50000"
                            />
                        </div>
                    </div>
                    <div className="form-actions">
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            Сохранить
                        </button>
                        {saved && <span className="income-compact">Сохранено</span>}
                    </div>
                </form>
            )}
        </div>
    );
}
