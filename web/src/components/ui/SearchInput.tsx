import type { InputHTMLAttributes } from 'react';
import { SearchIcon } from './SearchIcon';

/**
 * Текстовое поле поиска с иконкой-лупой — единственное отличие от обычного <input
 * type="search"> визуальное: без неё поле неотличимо от любого другого текстового
 * инпута (AGENTS.md, «Конвенции кода» → UI-паттерны). Пропсы прозрачно пробрасываются
 * в <input> — вызывающий код не меняется, кроме самого тега.
 */
export function SearchInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>): JSX.Element {
    return (
        <div className="search-input">
            <SearchIcon />
            <input type="search" className={`input-control${className !== undefined ? ` ${className}` : ''}`} {...rest} />
        </div>
    );
}
