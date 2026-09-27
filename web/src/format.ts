/**
 * Форматирование денег, процентов и дат.
 * Деньги — целые копейки; деление на 100 без float-погрешностей: рубли и копейки
 * вычисляются целочисленно, Intl получает уже готовые рубли.
 */

const rubFormatter = new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0,
});

/**
 * Форматтер коротких величин для осей графиков: одна дробная цифра — «1,2 млн» /
 * «12,3 тыс». (Этап R2, баг из тестов: раньше здесь использовался rubFormatter
 * с 0 знаками — дробная цифра, обещанная docstring'ом «12,3 тыс ₽», отбрасывалась.)
 */
const shortRubFormatter = new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 1,
});

/** Целочисленное разложение копеек в (рубли со знаком, |копейки| 0..99). */
function splitKopecks(kopecks: number): { rubles: number; cents: number; negative: boolean } {
    const safe = Number.isSafeInteger(kopecks) ? kopecks : Math.round(kopecks);
    const negative = safe < 0;
    const abs = Math.abs(safe);
    return { rubles: Math.trunc(abs / 100), cents: abs % 100, negative };
}

/** «12 345,67 ₽»; для отрицательных: «−1 234,00 ₽» (типографский минус). */
export function formatMoney(kopecks: number): string {
    const { rubles, cents, negative } = splitKopecks(kopecks);
    const formatted = `${rubFormatter.format(rubles)},${String(cents).padStart(2, '0')} ₽`;
    return negative ? `−${formatted}` : formatted;
}

/**
 * «12 345 ₽» — целые рубли, без копеек: для плотных таблиц (обзор месяца, MonthOverview)
 * и сводных карточек (Доход/Расходы/Баланс/Займы), где точность до копейки только мешает
 * читать много чисел разом. Округление ВСЕГДА вверх (по модулю — на величину, не «к нулю»):
 * любые копейки > 0 добавляют 1 рубль, а не «к ближайшему» — так расходы никогда не
 * занижаются на экране.
 */
export function formatMoneyWhole(kopecks: number): string {
    const { rubles, cents, negative } = splitKopecks(kopecks);
    const roundedRubles = cents > 0 ? rubles + 1 : rubles;
    const formatted = `${rubFormatter.format(roundedRubles)} ₽`;
    return negative ? `−${formatted}` : formatted;
}

/** Короткий формат для осей графиков: «12,3 тыс ₽» / «1,2 млн ₽». */
export function formatMoneyShort(kopecks: number): string {
    const abs = Math.abs(kopecks) / 100; // рубли (float допустим только для осей)
    const sign = kopecks < 0 ? '−' : '';
    if (abs >= 1_000_000) return `${sign}${shortRubFormatter.format(Math.round((abs / 1_000_000) * 10) / 10)} млн ₽`;
    if (abs >= 1_000) return `${sign}${shortRubFormatter.format(Math.round((abs / 1_000) * 10) / 10)} тыс ₽`;
    return `${sign}${rubFormatter.format(Math.round(abs))} ₽`;
}

/** Целые проценты: 42 → «42 %». */
export function formatPercent(pct: number | null): string {
    if (pct === null) return '—';
    return `${rubFormatter.format(Math.round(pct))} %`;
}

/** Дельта со знаком: +12,3 % / −4,1 %. */
export function formatSignedPercent(pct: number | null): string {
    if (pct === null) return '—';
    const rounded = Math.round(pct * 10) / 10;
    const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
    const abs = Math.abs(rounded);
    const text = Number.isInteger(abs) ? String(abs) : abs.toFixed(1).replace('.', ',');
    return `${sign}${text} %`;
}

/** Денежная дельта со знаком: «+1 234,00 ₽» (formatMoney даёт знак только для отрицательных). */
export function formatSignedMoney(kopecks: number): string {
    return kopecks > 0 ? `+${formatMoney(kopecks)}` : formatMoney(kopecks);
}

/**
 * Русское склонение существительного по числу N (правило «один/два-четыре/пять+»,
 * учитывает исключение 11-14). forms = [1 операция, 2 операции, 5 операций].
 */
export function pluralizeRu(n: number, forms: [string, string, string]): string {
    const abs = Math.abs(n) % 100;
    const last = abs % 10;
    if (abs >= 11 && abs <= 14) return forms[2];
    if (last === 1) return forms[0];
    if (last >= 2 && last <= 4) return forms[1];
    return forms[2];
}

/** «2026-09-07» → «07.09.2026». */
export function formatDate(iso: string): string {
    const [y, m, d] = iso.split('-');
    if (y === undefined || m === undefined || d === undefined) return iso;
    return `${d}.${m}.${y}`;
}

/** «2026-09-07» → «07.09» (для оси дней). */
export function formatDateShort(iso: string): string {
    const [, m, d] = iso.split('-');
    if (m === undefined || d === undefined) return iso;
    return `${d}.${m}`;
}

/** «2026-09-08T19:41:24Z» → «08.09.2026 22:41» (московское время = UTC+3). */
export function formatDateTime(isoUtc: string): string {
    const ms = Date.parse(isoUtc);
    if (Number.isNaN(ms)) return isoUtc;
    const shifted = new Date(ms + 3 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const date = `${pad(shifted.getUTCDate())}.${pad(shifted.getUTCMonth() + 1)}.${shifted.getUTCFullYear()}`;
    const time = `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
    return `${date} ${time}`;
}

/** Диапазон недели Пн–Вс: «07.09 – 13.09.2026» (год в конце, если он один). */
export function formatWeekRange(from: string, to: string): string {
    const [fy, fm, fd] = from.split('-');
    const [ty, tm, td] = to.split('-');
    if (fy === undefined || fm === undefined || fd === undefined || ty === undefined || tm === undefined || td === undefined) {
        return `${from} – ${to}`;
    }
    if (fy === ty) {
        return `${fd}.${fm} – ${td}.${tm}.${ty}`;
    }
    return `${fd}.${fm}.${fy} – ${td}.${tm}.${ty}`;
}

/**
 * Строка рублей («5000», «1234,56», «1234.56») → копейки без float-погрешностей
 * (аналог server/src/domain/money.ts). null — если строка не похожа на сумму.
 */
export function parseRublesToKopecks(raw: string): number | null {
    const match = /^\s*(-)?(\d+)(?:[.,](\d{1,2}))?\s*$/.exec(raw);
    if (match === null) return null;
    const sign = match[1] === undefined ? 1 : -1;
    const intPart = match[2] ?? '0';
    const fracPart = (match[3] ?? '').padEnd(2, '0');
    const value = Number(intPart) * 100 + Number(fracPart);
    return Number.isSafeInteger(value) ? sign * value : null;
}

/** Копейки → строка для input: 123456 → «1234,56» (целочисленно, без float). */
export function kopecksToRublesInput(kopecks: number): string {
    const negative = kopecks < 0;
    const abs = Math.abs(kopecks);
    const rubles = Math.trunc(abs / 100);
    const cents = abs % 100;
    return `${negative ? '-' : ''}${rubles},${String(cents).padStart(2, '0')}`;
}

/**
 * Название категории → подпись варианта в SearchableSelect с добавленной сферой
 * (category_abstract), например «Психолог (Сима)»: сферы отличают одинаково/похоже
 * звучащие категории («Психолог», «Психолог Лёхи», «Психолог Маши») друг от друга —
 * без сферы в списке они неразличимы на слух. `null`/`undefined`/'' — сфера не задана,
 * подпись остаётся просто названием категории.
 */
export function categoryOptionLabel(category: string, sphere: string | null | undefined): string {
    return sphere === null || sphere === undefined || sphere === '' ? category : `${category} (${sphere})`;
}
