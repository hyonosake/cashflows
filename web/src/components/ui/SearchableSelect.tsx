import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Комбобокс с текстовым поиском по вариантам — замена нативному <select> везде, где список
 * может быть длинным (категории, мерчанты, MCC-коды). Список рендерится в fixed-позиции
 * (координаты из getBoundingClientRect инпута), а не внутри потока — иначе выпадашка обрезалась
 * бы overflow:auto у .table-wrap (MerchantsSection рисует select внутри строки таблицы).
 * При скролле СТРАНИЦЫ (не самого списка) список закрывается — пересчитывать позицию на
 * каждый скролл избыточно для локального инструмента на одном экране. Scroll-события не
 * бабблятся, поэтому слушатель на window ставится с capture:true (иначе не поймать скролл
 * произвольного предка) — но тем же способом он получает и скролл ВНУТРИ самого списка
 * (overflow-y:auto, длинные списки категорий у мерчантов), такие события нужно явно
 * игнорировать (иначе список закрывался бы при первой попытке прокрутить его же колесом мыши).
 */

export interface SearchableSelectOption {
    value: string;
    label: string;
    disabled?: boolean;
}

interface Props {
    id?: string;
    value: string;
    options: SearchableSelectOption[];
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    'aria-label'?: string;
    className?: string;
}

export function SearchableSelect({
    id,
    value,
    options,
    onChange,
    placeholder,
    disabled,
    'aria-label': ariaLabel,
    className,
}: Props): JSX.Element {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [highlight, setHighlight] = useState(0);
    const [rect, setRect] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    const selected = options.find((o) => o.value === value);
    const selectedLabel = selected?.label ?? (value === '' ? '' : value);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (q === '') return options;
        return options.filter((o) => o.label.toLowerCase().includes(q));
    }, [options, query]);

    useEffect(() => {
        setHighlight(0);
    }, [filtered.length, query, open]);

    const openList = (): void => {
        const el = inputRef.current;
        if (el !== null) {
            const r = el.getBoundingClientRect();
            const preferredHeight = 260;
            const spaceBelow = window.innerHeight - r.bottom - 8;
            const spaceAbove = r.top - 8;
            // Строка таблицы мерчантов может оказаться у самого низа окна — если снизу не
            // хватает места (даже с запасом), но сверху его больше, разворачиваем список вверх,
            // иначе он рисовался бы частично за пределами вьюпорта (невидимо и нескроллимо).
            const openUpward = spaceBelow < 120 && spaceAbove > spaceBelow;
            const maxHeight = Math.max(Math.min(preferredHeight, openUpward ? spaceAbove : spaceBelow), 80);
            const top = openUpward ? r.top - 4 - maxHeight : r.bottom + 4;
            setRect({ top, left: r.left, width: Math.max(r.width, 220), maxHeight });
        }
        setOpen(true);
        setQuery('');
    };

    const closeList = (): void => {
        setOpen(false);
        setQuery('');
    };

    useEffect(() => {
        if (!open) return undefined;
        const onClickOutside = (e: MouseEvent): void => {
            if (rootRef.current !== null && !rootRef.current.contains(e.target as Node)) {
                closeList();
            }
        };
        const onScrollOrResize = (e: Event): void => {
            if (listRef.current !== null && e.target instanceof Node && listRef.current.contains(e.target)) {
                return;
            }
            closeList();
        };
        document.addEventListener('mousedown', onClickOutside);
        window.addEventListener('scroll', onScrollOrResize, true);
        window.addEventListener('resize', onScrollOrResize);
        return () => {
            document.removeEventListener('mousedown', onClickOutside);
            window.removeEventListener('scroll', onScrollOrResize, true);
            window.removeEventListener('resize', onScrollOrResize);
        };
    }, [open]);

    const commit = (opt: SearchableSelectOption): void => {
        if (opt.disabled === true) return;
        onChange(opt.value);
        closeList();
    };

    return (
        <div className={`searchable-select${className !== undefined ? ` ${className}` : ''}`} ref={rootRef}>
            <input
                id={id}
                ref={inputRef}
                className="input-control"
                type="text"
                role="combobox"
                aria-expanded={open}
                aria-autocomplete="list"
                aria-label={ariaLabel}
                disabled={disabled}
                value={open ? query : selectedLabel}
                placeholder={placeholder}
                autoComplete="off"
                onFocus={openList}
                onClick={() => {
                    if (!open) openList();
                }}
                onChange={(e) => {
                    if (!open) openList();
                    setQuery(e.target.value);
                }}
                onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        if (!open) openList();
                        else setHighlight((h) => Math.min(h + 1, filtered.length - 1));
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setHighlight((h) => Math.max(h - 1, 0));
                    } else if (e.key === 'Enter') {
                        e.preventDefault();
                        const opt = filtered[highlight];
                        if (opt !== undefined) commit(opt);
                    } else if (e.key === 'Escape') {
                        closeList();
                        inputRef.current?.blur();
                    }
                }}
            />
            <span className="searchable-select-chevron" aria-hidden="true">
                ▾
            </span>
            {open && rect !== null && (
                <ul
                    ref={listRef}
                    className="searchable-select-list"
                    role="listbox"
                    style={{ top: rect.top, left: rect.left, width: rect.width, maxHeight: rect.maxHeight }}
                >
                    {filtered.length === 0 && <li className="searchable-select-empty">Ничего не найдено</li>}
                    {filtered.map((opt, idx) => (
                        <li
                            key={opt.value}
                            role="option"
                            aria-selected={opt.value === value}
                            aria-disabled={opt.disabled}
                            className={`searchable-select-option${idx === highlight ? ' is-highlighted' : ''}${
                                opt.disabled === true ? ' is-disabled' : ''
                            }${opt.value === value ? ' is-selected' : ''}`}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                commit(opt);
                            }}
                            onMouseEnter={() => setHighlight(idx)}
                        >
                            {opt.label}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
