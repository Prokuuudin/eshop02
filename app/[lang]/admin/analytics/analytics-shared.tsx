import { useEffect, useState, type ReactElement } from 'react';

export type AbcGrade = 'A' | 'B' | 'C';
export type XyzGrade = 'X' | 'Y' | 'Z';

export type AbcRow = {
    id: string;
    title: string;
    brand: string;
    qty: number;
    revenue: number;
    revenuePct: number;
    cumPct: number;
    grade: AbcGrade;
    xyzGrade: XyzGrade;
    variationCoeff: number | null;
};

export type SeoProduct = {
    id: string;
    title: string;
    brand: string;
    category: string;
    hasMetaTitle: boolean;
    hasMetaDesc: boolean;
    hasImage: boolean;
    hasImageAlt: boolean;
    hasTranslations: boolean;
    validMetaTitleLength: boolean;
    validMetaDescLength: boolean;
    duplicateMeta: boolean;
    issueCount: number;
};

export function toMonthKey(date: Date | string): string {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthDiff(from: string, to: string): number {
    const [fy, fm] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);
    return (ty - fy) * 12 + (tm - fm);
}

export function monthLabel(key: string, locale: string): string {
    const [y, m] = key.split('-').map(Number);
    const date = new Date(y, m - 1, 1);
    return date.toLocaleDateString(locale, { month: 'short', year: '2-digit' });
}

export function retentionColor(pct: number): string {
    if (pct === 0) return 'bg-transparent text-gray-300 dark:text-gray-600';
    if (pct >= 60) return 'bg-emerald-600 text-white';
    if (pct >= 40) return 'bg-emerald-400 text-white';
    if (pct >= 25) return 'bg-emerald-200 text-emerald-900';
    if (pct >= 10)
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
    return 'bg-gray-50 text-gray-500 dark:bg-gray-800/50 dark:text-gray-500';
}

export const GRADE_STYLES: Record<AbcGrade, { badge: string; row: string }> = {
    A: {
        badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
        row: '',
    },
    B: {
        badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
        row: '',
    },
    C: {
        badge: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
        row: 'opacity-60',
    },
};

export const XYZ_STYLES: Record<XyzGrade, string> = {
    X: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
    Y: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
    Z: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
};

export function useStickyTableTop(gap = 0): number {
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

export function Empty({ text }: { text: string }): ReactElement {
    return (
        <div className="py-16 text-center text-sm text-muted-foreground rounded-xl border border-border">
            {text}
        </div>
    );
}

export function LoadError({ text, retryLabel, onRetry }: { text: string; retryLabel: string; onRetry: () => void }): ReactElement {
    return (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-10 text-center text-sm text-red-800 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
            <p>{text}</p>
            <button type="button" onClick={onRetry} className="mt-4 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">
                {retryLabel}
            </button>
        </div>
    );
}

export function AnalyticsPagination({ page, pageSize, total, loading, labels, onPageChange, onPageSizeChange, scrollTargetId }: {
    page: number; pageSize: number; total: number; loading: boolean;
    labels: { previous: string; next: string; page: string; of: string; rows: string };
    onPageChange: (page: number) => void;
    onPageSizeChange?: (pageSize: number) => void;
    scrollTargetId?: string;
}): ReactElement | null {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const [pageInput, setPageInput] = useState(String(page));
    useEffect(() => { queueMicrotask(() => setPageInput(String(page))); }, [page]);
    if (total <= pageSize) return null;
    const goToPage = (nextPage: number): void => {
        onPageChange(Math.min(totalPages, Math.max(1, nextPage)));
        if (scrollTargetId) document.getElementById(scrollTargetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const first = (page - 1) * pageSize + 1;
    const last = Math.min(page * pageSize, total);
    return (
        <nav aria-label={labels.page} className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{first}–{last} {labels.of} {total}</span>
            <div className="flex flex-wrap items-center gap-2">
                {onPageSizeChange && <label className="flex items-center gap-1 text-muted-foreground">{labels.rows}<select value={pageSize} disabled={loading} onChange={(event) => onPageSizeChange(Number(event.target.value))} className="rounded-md border border-border bg-background px-2 py-1.5 text-foreground"><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label>}
                <button type="button" disabled={loading || page <= 1} onClick={() => goToPage(page - 1)} className="rounded-lg border border-border px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50">← {labels.previous}</button>
                <label className="flex items-center gap-1 text-muted-foreground">{labels.page}<input value={pageInput} inputMode="numeric" aria-label={labels.page} onChange={(event) => setPageInput(event.target.value.replace(/\D/g, ''))} onBlur={() => goToPage(Number(pageInput) || page)} onKeyDown={(event) => { if (event.key === 'Enter') goToPage(Number(pageInput) || page); }} className="w-14 rounded-md border border-border bg-background px-2 py-1.5 text-center text-foreground" /> {labels.of} {totalPages}</label>
                <button type="button" disabled={loading || page >= totalPages} onClick={() => goToPage(page + 1)} className="rounded-lg border border-border px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50">{labels.next} →</button>
            </div>
        </nav>
    );
}
