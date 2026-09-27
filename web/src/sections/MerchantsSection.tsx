import { useMemo, useState } from 'react';
import { apiErrorText, setMerchantCategory } from '../api';
import { useCategoryFields } from '../hooks/useCategoryFields';
import { useMerchants } from '../hooks/useMerchants';
import { CategorySelect } from '../components/CategorySelect';
import { CollapsibleSection } from '../components/ui/CollapsibleSection';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { SearchInput } from '../components/ui/SearchInput';
import { Spinner } from '../components/ui/Spinner';
import { formatMoney } from '../format';

/**
 * Секция «Настройки» — все мерчанты (operations.description) с суммой трат за всё время
 * и текущей категорией, по убыванию суммы (GET /api/merchants). Смена категории в строке
 * заводит/обновляет правило description_contains на этот мерчант целиком (не одну операцию —
 * для этого есть CreateRuleDialog на странице «Операции») и пересчитывает категории.
 * mixedCategories — у мерчанта уже сейчас разные категории (ручные правки/разные точки
 * под одним названием); показанная категория — та, на которую пришлось больше всего трат.
 *
 * Выбор целевой категории — ТОЛЬКО категории пользователя (useCategoryFields(version) — тот же
 * набор имён, что и listUserCategories/useCategories(version,'user'), но сразу со сферой
 * (category_abstract) каждой категории — переиспользуем вместо отдельного useCategories,
 * чтобы не делать два одинаковых по составу запроса), а не любая текущая эффективная
 * категория операций и не цели/резервы/недельные бюджеты — banковская category_default
 * вспомогательная и местами неверная (табачный киоск у банка может быть «Фастфудом»), выбирать
 * её как цель не должно быть вариантом. Если текущая категория мерчанта — именно банковская
 * (правило ещё не заведено), она всё равно показывается в select (иначе значение не
 * отрендерится), но disabled и с пометкой «(банк)» — не настоящий вариант выбора, просто то,
 * что есть сейчас. Сфера добавляется к подписи варианта («Психолог (Сима)») — категории
 * с похожими/совпадающими именами (несколько «Психолог …» на разных членов семьи)
 * неразличимы в списке без неё.
 */

interface Props {
    version: number;
    onDataChanged: () => void;
}

export function MerchantsSection({ version, onDataChanged }: Props): JSX.Element {
    const merchantsQuery = useMerchants(version);
    const merchants = merchantsQuery.data ?? [];
    const categoryFieldsQuery = useCategoryFields(version);
    const categoryFields = categoryFieldsQuery.data ?? [];
    const categories = useMemo(() => categoryFields.map((f) => f.category), [categoryFields]);
    const sphereByCategory = useMemo(() => new Map(categoryFields.map((f) => [f.category, f.field])), [categoryFields]);

    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [busyMerchant, setBusyMerchant] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Категории, реально встречающиеся у мерчантов сейчас — удобно найти всех мерчантов
    // временной «грубой» категории (Сима/Хобби/Сервисы и прочее и т.п.) и раскидать их
    // по конкретным без прокрутки всего списка.
    const presentCategories = useMemo(
        () => Array.from(new Set(merchants.map((m) => m.category))).sort((a, b) => a.localeCompare(b, 'ru')),
        [merchants],
    );

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return merchants.filter(
            (m) => (q === '' || m.merchant.toLowerCase().includes(q)) && (categoryFilter === '' || m.category === categoryFilter),
        );
    }, [merchants, search, categoryFilter]);

    const handleChangeCategory = async (merchant: string, targetCategory: string): Promise<void> => {
        setBusyMerchant(merchant);
        setError(null);
        try {
            await setMerchantCategory({ merchant, targetCategory });
            onDataChanged();
        } catch (e: unknown) {
            setError(apiErrorText(e, 'Не удалось сохранить категорию мерчанта'));
        } finally {
            setBusyMerchant(null);
        }
    };

    const listLoading = merchantsQuery.loading && merchants.length === 0;

    const countLabel = filtered.length !== merchants.length ? `${filtered.length} из ${merchants.length}` : String(merchants.length);

    return (
        <CollapsibleSection title="Мерчанты" defaultOpen={false} headHint={<span className="muted">({countLabel})</span>}>
            <div className="panel-head">
                <p className="muted" style={{ margin: 0 }}>
                    Все мерчанты (описание операции у банка) с суммой расходов за всё время и
                    текущей категорией. Смена категории здесь заводит правило на весь мерчант —
                    для разовой правки одной операции используйте страницу «Операции».
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                    <CategorySelect
                        value={categoryFilter}
                        onChange={setCategoryFilter}
                        aria-label="Фильтр по текущей категории"
                        categories={presentCategories}
                        categorySpheres={sphereByCategory}
                        placeholder="Все категории"
                    />
                    <SearchInput
                        placeholder="Поиск по названию…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ maxWidth: 260 }}
                        aria-label="Поиск мерчанта по названию"
                    />
                </div>
            </div>

            {error !== null && <ErrorBanner message={error} />}
            {merchantsQuery.error !== null && <ErrorBanner message={merchantsQuery.error} />}
            {categoryFieldsQuery.error !== null && <ErrorBanner message={categoryFieldsQuery.error} />}

            {listLoading ? (
                <div className="state-box">
                    <Spinner />
                    <span>Загрузка мерчантов…</span>
                </div>
            ) : merchants.length === 0 ? (
                <p className="empty">Мерчантов пока нет — сначала импортируйте операции.</p>
            ) : filtered.length === 0 ? (
                <p className="empty">Ничего не найдено{search !== '' ? ` по запросу «${search}»` : ''}.</p>
            ) : (
                <div className="table-wrap">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Мерчант</th>
                                <th>Категория</th>
                                <th className="table-amount-right">Операций</th>
                                <th className="table-amount-right">Потрачено</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((m) => (
                                <tr key={m.merchant}>
                                    <td>{m.merchant}</td>
                                    <td>
                                        <CategorySelect
                                            value={m.category}
                                            disabled={busyMerchant === m.merchant}
                                            aria-label={`Категория мерчанта ${m.merchant}`}
                                            onChange={(next) => void handleChangeCategory(m.merchant, next)}
                                            categories={categories}
                                            categorySpheres={sphereByCategory}
                                            fallbackOption={(value) => ({ value, label: `${value} (банк)`, disabled: true })}
                                        />
                                        {m.mixedCategories && (
                                            <span className="muted" title="У этого мерчанта сейчас разные категории у разных операций — показана та, на которую пришлось больше всего трат">
                                                {' '}
                                                (разные)
                                            </span>
                                        )}
                                    </td>
                                    <td className="table-amount-right">{m.operationsCount}</td>
                                    <td className="table-amount-right">{formatMoney(m.spentKopecks)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </CollapsibleSection>
    );
}
