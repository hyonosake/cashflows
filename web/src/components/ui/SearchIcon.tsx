/** Иконка «лупа» для полей поиска — инлайн SVG, без иконочной библиотеки (см. TrashIcon/PencilIcon). */
export function SearchIcon(): JSX.Element {
    return (
        <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
    );
}
