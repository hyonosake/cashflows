import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronIcon } from './ChevronIcon';

/**
 * Панель «Настроек» со сворачиваемым телом — секции со множеством записей (мерчанты,
 * правила категоризации, категории) занимают много места на странице; заголовок кликабелен,
 * состояние — локальный useState (не персистится между перезагрузками, по умолчанию задаётся
 * пропом на каждую секцию отдельно).
 */

interface Props {
    title: string;
    defaultOpen?: boolean;
    headHint?: ReactNode; // например счётчик записей — рядом с заголовком, видим и в свёрнутом виде
    children: ReactNode;
}

export function CollapsibleSection({ title, defaultOpen = true, headHint, children }: Props): JSX.Element {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div className="panel">
            <button type="button" className="collapsible-header" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                <span className={`collapsible-chevron${open ? ' collapsible-chevron-open' : ''}`}>
                    <ChevronIcon />
                </span>
                <h2>{title}</h2>
                {headHint}
            </button>
            {open && <div className="collapsible-body">{children}</div>}
        </div>
    );
}
