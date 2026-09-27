/** Иконка «шеврон» для аккордеона (CollapsibleSection) — инлайн SVG вместо юникод-стрелки ▸. */
export function ChevronIcon(): JSX.Element {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="9 6 15 12 9 18" />
        </svg>
    );
}
