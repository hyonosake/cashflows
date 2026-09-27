import { loadConfig } from '../config.js';
import { openDb, type Db } from '../db.js';
import { listUserCategories } from '../domain/categories.js';
import { setMerchantCategory } from '../domain/merchants.js';

/**
 * `npm run auto-map` — авторазметка «очевидных» мерчантов (PLANS.md, «Умный маппинг категорий»,
 * п.1а): для известных сетевых магазинов/сервисов (Пятёрочка, Перекрёсток, Такси и т.п.) сразу
 * проставляет merchants.user_category_id — но ТОЛЬКО если целевая категория однозначно находится
 * среди уже существующих user_categories (по ключевому слову, см. HINTS ниже). Никогда не
 * придумывает новые названия категорий и не трогает мерчантов без уверенного совпадения — те
 * просто попадают в отчёт «Не размечено» для ручной разметки через MerchantsSection.
 *
 * По умолчанию — дословно предпросмотр (ничего не пишет в БД). Флаг --apply пишет.
 */

interface Hint {
    label: string;
    patterns: string[];
    categoryKeywords: string[];
}

const HINTS: Hint[] = [
    {
        label: 'Продуктовые сети',
        patterns: [
            'Пятёрочка', 'Пятерочка', 'Перекрёсток', 'Перекресток', 'Магнит', 'Ашан', 'Auchan',
            'Лента', 'Дикси', 'Верный', 'Азбука Вкуса', 'О\'КЕЙ', 'Окей', 'ВкусВилл', 'Metro Cash',
        ],
        categoryKeywords: ['продукт'],
    },
    {
        label: 'Аптеки',
        patterns: ['Аптека', 'Ригла', 'Апрель', 'Здравсити', 'Планета Здоровья', 'Горздрав'],
        categoryKeywords: ['лекарств'],
    },
    {
        label: 'Фастфуд/кафе',
        patterns: [
            'Макдоналдс', 'McDonald', 'KFC', 'Burger King', 'Бургер Кинг', 'Вкусно и точка',
            'Subway', 'Шоколадница', 'Додо Пицца', 'Dodo', 'Papa John', 'Cofix', 'Surf Coffee',
        ],
        categoryKeywords: ['кафе', 'ресторан'],
    },
    {
        label: 'Мобильная связь',
        patterns: ['МТС', 'Билайн', 'Beeline', 'Мегафон', 'Megafon', 'Tele2'],
        categoryKeywords: ['связь'],
    },
];

interface MerchantAgg {
    name: string;
    cnt: number;
    total: number;
}

/** Ровно одна существующая user_category содержит одно из ключевых слов — иначе null (неоднозначно/нет). */
function resolveExistingCategory(keywords: string[], existingCategories: string[]): string | null {
    const matches = existingCategories.filter((cat) => keywords.some((kw) => cat.toLowerCase().includes(kw.toLowerCase())));
    const unique = Array.from(new Set(matches));
    return unique.length === 1 ? (unique[0] as string) : null;
}

interface Proposal {
    hint: Hint;
    merchant: string;
    targetCategory: string;
    cnt: number;
    total: number;
}

function buildProposals(db: Db): { proposals: Proposal[]; unmatched: MerchantAgg[] } {
    const existingCategories = listUserCategories(db);

    const merchants = db
        .prepare<[], MerchantAgg>(
            `SELECT m.name AS name, COUNT(*) AS cnt, COALESCE(-SUM(o.amount_kopecks), 0) AS total
             FROM merchants m JOIN operations o ON o.merchant_id = m.id
             WHERE m.user_category_id IS NULL AND o.amount_kopecks < 0
             GROUP BY m.id
             ORDER BY cnt DESC`,
        )
        .all();

    const proposals: Proposal[] = [];
    const unmatched: MerchantAgg[] = [];

    for (const row of merchants) {
        let matched = false;
        for (const hint of HINTS) {
            const pattern = hint.patterns.find((p) => row.name.toLowerCase().includes(p.toLowerCase()));
            if (pattern === undefined) continue;
            const targetCategory = resolveExistingCategory(hint.categoryKeywords, existingCategories);
            if (targetCategory === null) continue; // не нашли однозначную категорию — не гадаем
            proposals.push({ hint, merchant: row.name, targetCategory, cnt: row.cnt, total: row.total });
            matched = true;
            break;
        }
        if (!matched) unmatched.push(row);
    }

    return { proposals, unmatched };
}

function formatRub(kopecks: number): string {
    return `${(kopecks / 100).toLocaleString('ru-RU')} ₽`;
}

function main(): void {
    const apply = process.argv.includes('--apply');
    const config = loadConfig();
    const db = openDb(config.dbFile);
    try {
        const { proposals, unmatched } = buildProposals(db);

        if (proposals.length === 0) {
            console.log('Явных совпадений с известными сетями не найдено — размечать нечего.');
        } else {
            console.log(`${apply ? 'Проставляю' : 'Найдено (предпросмотр, --apply чтобы применить)'} мерчантов: ${proposals.length}\n`);
            for (const p of proposals) {
                console.log(`  [${p.hint.label}] «${p.merchant}» → «${p.targetCategory}» (${p.cnt} операций, ${formatRub(p.total)})`);
            }
        }

        if (apply && proposals.length > 0) {
            db.transaction(() => {
                for (const p of proposals) setMerchantCategory(db, p.merchant, p.targetCategory);
            })();
            console.log(`\nПроставлено ${proposals.length} мерчантов — категории уже видны везде (живой JOIN, пересчёт не нужен).`);
        }

        if (unmatched.length > 0) {
            console.log(`\nНе размечено (нет уверенного совпадения, ${unmatched.length} мерчантов) — топ по частоте:`);
            for (const u of unmatched.slice(0, 20)) {
                console.log(`  «${u.name}» — ${u.cnt} операций, ${formatRub(u.total)}`);
            }
            console.log('\nЭтих добавляйте вручную через MerchantsSection.');
        }

        if (!apply && proposals.length > 0) {
            console.log('\nЭто был предпросмотр — ничего не записано. Повторите с --apply, чтобы применить.');
        }
    } finally {
        db.close();
    }
}

main();
