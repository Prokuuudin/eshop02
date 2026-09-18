import type React from 'react';

export function Section({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}): React.ReactElement {
    return (
        <section className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {title}
            </h2>
            {children}
        </section>
    );
}

export function Token({
    name,
    bg,
    text,
    border,
}: {
    name: string;
    bg: string;
    text?: string;
    border?: string;
}): React.ReactElement {
    return (
        <div className="flex flex-col gap-1.5 min-w-[100px]">
            <div
                className={`h-14 w-full rounded-lg border ${border ?? 'border-transparent'} ${bg}`}
            />
            <p className="text-[11px] font-medium text-foreground leading-tight">{name}</p>
            {text && (
                <p className="text-[10px] text-muted-foreground leading-tight font-mono">{text}</p>
            )}
        </div>
    );
}

export function TypeRow({
    size,
    tailwind,
    weight,
    sample,
}: {
    size: string;
    tailwind: string;
    weight: 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold';
    sample: string;
}): React.ReactElement {
    return (
        <div className="flex flex-wrap items-baseline gap-3 sm:gap-6 py-2 border-b border-border last:border-0">
            <div className="w-24 shrink-0">
                <span className="text-[11px] font-mono text-muted-foreground">{tailwind}</span>
            </div>
            <div className="w-16 shrink-0 text-[11px] text-muted-foreground">{size}</div>
            <div className="w-24 shrink-0 text-[11px] text-muted-foreground">{weight}</div>
            <p className={`${tailwind} ${{ regular: 'font-normal', medium: 'font-medium', semibold: 'font-semibold', bold: 'font-bold', extrabold: 'font-extrabold' }[weight]} min-w-0 break-words text-foreground leading-tight`}>{sample}</p>
        </div>
    );
}
