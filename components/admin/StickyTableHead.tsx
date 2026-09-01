'use client';

import { useEffect, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';

type StickyTableHeadProps = {
    children: ReactNode;
    className?: string;
    gap?: number;
};

function useAdminHeaderBottom(gap: number): number {
    const [top, setTop] = useState(0);

    useEffect(() => {
        const header = document.querySelector('header.header');
        if (!(header instanceof HTMLElement)) return;

        let active = true;
        const update = (): void => {
            if (active) setTop(Math.ceil(header.getBoundingClientRect().bottom) + gap);
        };

        queueMicrotask(update);
        const observer = new ResizeObserver(update);
        observer.observe(header);
        window.addEventListener('resize', update);

        return () => {
            active = false;
            observer.disconnect();
            window.removeEventListener('resize', update);
        };
    }, [gap]);

    return top;
}

export default function StickyTableHead({ children, className = '', gap = 0 }: StickyTableHeadProps): ReactElement {
    const top = useAdminHeaderBottom(gap);

    return (
        <thead
            className={`[&_th]:sticky [&_th]:top-0 [&_th]:z-30 [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:shadow-sm lg:[&_th]:top-[var(--admin-table-top)] ${className}`}
            style={{ '--admin-table-top': `${top}px` } as CSSProperties}
        >
            {children}
        </thead>
    );
}
