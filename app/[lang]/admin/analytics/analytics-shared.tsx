export type AbcGrade = 'A' | 'B' | 'C';

export type AbcRow = {
    id: string;
    title: string;
    brand: string;
    qty: number;
    revenue: number;
    revenuePct: number;
    cumPct: number;
    grade: AbcGrade;
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

export function AnalyticsPagination({ page, pageSize, total, loading, labels, onPageChange }: {
    page: number; pageSize: number; total: number; loading: boolean;
    labels: { previous: string; next: string; page: string; of: string };
    onPageChange: (page: number) => void;
}): ReactElement | null {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (total <= pageSize) return null;
    return (
        <nav aria-label={labels.page} className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{labels.page} {page} {labels.of} {totalPages}</span>
            <div className="flex gap-2">
                <button type="button" disabled={loading || page <= 1} onClick={() => onPageChange(page - 1)} className="rounded-lg border border-border px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50">← {labels.previous}</button>
                <button type="button" disabled={loading || page >= totalPages} onClick={() => onPageChange(page + 1)} className="rounded-lg border border-border px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50">{labels.next} →</button>
            </div>
        </nav>
    );
}
import type { ReactElement } from 'react';
