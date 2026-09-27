/** Иконка «карандаш» для кнопок переименования — инлайн SVG, без иконочной библиотеки (см. TrashIcon). */
export function PencilIcon(): JSX.Element {
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
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            <path d="M15 5l4 4" />
        </svg>
    );
}
