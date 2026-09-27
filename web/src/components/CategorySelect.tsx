import { useMemo } from 'react';
import { categoryOptionLabel } from '../format';
import { SearchableSelect, type SearchableSelectOption } from './ui/SearchableSelect';

/**
 * Обёртка вокруг SearchableSelect для выбора категории пользователя — раньше список опций
 * (categories.map + categoryOptionLabel(c, sphere)) собирался вручную в MappingsSection (×2),
 * MerchantsSection, OperationsFiltersBar, CreateRuleDialog. Опционально: placeholder-пункт
 * (value: '') и fallbackOption — когда текущее значение не входит в categories (например,
 * ещё не размеченный мерчант с банковской категорией, или категория операции, отсутствующая
 * в списке целевых) — по умолчанию показывает значение как есть, MerchantsSection передаёт
 * свою пометку «(банк)» + disabled.
 */

interface Props {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    categories: string[];
    categorySpheres: Map<string, string | null | undefined>;
    placeholder?: string;
    fallbackOption?: (value: string) => SearchableSelectOption;
    disabled?: boolean;
    'aria-label'?: string;
}

export function CategorySelect({
    id,
    value,
    onChange,
    categories,
    categorySpheres,
    placeholder,
    fallbackOption,
    disabled,
    'aria-label': ariaLabel,
}: Props): JSX.Element {
    const options = useMemo(() => {
        const opts: SearchableSelectOption[] = [];
        if (placeholder !== undefined) {
            opts.push({ value: '', label: placeholder });
        }
        if (value !== '' && !categories.includes(value)) {
            opts.push(fallbackOption !== undefined ? fallbackOption(value) : { value, label: value });
        }
        opts.push(...categories.map((c) => ({ value: c, label: categoryOptionLabel(c, categorySpheres.get(c)) })));
        return opts;
    }, [placeholder, value, categories, categorySpheres, fallbackOption]);

    return <SearchableSelect id={id} value={value} onChange={onChange} options={options} disabled={disabled} aria-label={ariaLabel} />;
}
