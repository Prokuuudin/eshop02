import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { type SeoProduct } from './analytics-shared';
import type { ReactElement } from 'react';

export default function SeoSection(): ReactElement {
    const [products, setProducts] = useState<SeoProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [issueFilter, setIssueFilter] = useState<'all' | 'metaTitle' | 'metaDesc' | 'image'>(
        'all'
    );

    useEffect(() => {
        fetch('/api/admin/products')
            .then((r) => r.json())
            .then((data: { data?: { products?: Record<string, unknown>[] } }) => {
                const raw = data.data?.products ?? [];
                const mapped: SeoProduct[] = raw.map((p) => {
                    const hasMetaTitle = Boolean((p.metaTitle as string | undefined)?.trim());
                    const hasMetaDesc = Boolean((p.metaDescription as string | undefined)?.trim());
                    const hasImage = Boolean(
                        (p.image as string | undefined)?.trim() ||
                            ((p.images as string[] | undefined)?.length ?? 0) > 0
                    );
                    const issueCount =
                        (hasMetaTitle ? 0 : 1) + (hasMetaDesc ? 0 : 1) + (hasImage ? 0 : 1);
                    return {
                        id: p.id as string,
                        title: (p.title as string) || '—',
                        brand: (p.brand as string) || '—',
                        category: (p.category as string) || '—',
                        hasMetaTitle,
                        hasMetaDesc,
                        hasImage,
                        issueCount,
                    };
                });
                setProducts(mapped);
            })
            .catch(() => setProducts([]))
            .finally(() => setLoading(false));
    }, []);

    const counts = useMemo(
        () => ({
            all: products.filter((p) => p.issueCount > 0).length,
            metaTitle: products.filter((p) => !p.hasMetaTitle).length,
            metaDesc: products.filter((p) => !p.hasMetaDesc).length,
            image: products.filter((p) => !p.hasImage).length,
        }),
        [products]
    );

    const filtered = useMemo(() => {
        const withIssues = products.filter((p) => p.issueCount > 0);
        if (issueFilter === 'all') return withIssues.sort((a, b) => b.issueCount - a.issueCount);
        return withIssues
            .filter((p) =>
                issueFilter === 'metaTitle'
                    ? !p.hasMetaTitle
                    : issueFilter === 'metaDesc'
                    ? !p.hasMetaDesc
                    : !p.hasImage
            )
            .sort((a, b) => b.issueCount - a.issueCount);
    }, [products, issueFilter]);

    if (loading)
        return <div className="py-16 text-center text-sm text-gray-400">Загрузка каталога...</div>;

    const allOk = products.length > 0 && counts.all === 0;

    return (
        <div className="space-y-5">
            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    {
                        key: 'all' as const,
                        label: 'С проблемами',
                        color: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/10',
                        text: 'text-red-700 dark:text-red-300',
                    },
                    {
                        key: 'metaTitle' as const,
                        label: 'Нет metaTitle',
                        color: 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/10',
                        text: 'text-orange-700 dark:text-orange-300',
                    },
                    {
                        key: 'metaDesc' as const,
                        label: 'Нет metaDescription',
                        color: 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/10',
                        text: 'text-yellow-700 dark:text-yellow-300',
                    },
                    {
                        key: 'image' as const,
                        label: 'Нет изображения',
                        color: 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800',
                        text: 'text-gray-700 dark:text-gray-300',
                    },
                ].map((s) => (
                    <button
                        key={s.key}
                        type="button"
                        onClick={() => setIssueFilter(issueFilter === s.key ? 'all' : s.key)}
                        className={[
                            'rounded-xl border p-4 text-left transition-colors',
                            s.color,
                            issueFilter === s.key ? 'ring-2 ring-primary ring-offset-1' : '',
                        ].join(' ')}
                    >
                        <p className={`text-2xl font-bold ${s.text}`}>{counts[s.key]}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                    </button>
                ))}
            </div>

            {allOk && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                    Все {products.length} товаров заполнены корректно. SEO-пробелов нет.
                </div>
            )}

            {filtered.length > 0 && (
                <div className="overflow-auto rounded-xl border border-border">
                    <table className="min-w-full text-sm bg-card">
                        <thead className="bg-muted sticky top-0">
                            <tr>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                    Товар
                                </th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                    Бренд / Категория
                                </th>
                                <th className="px-4 py-3 text-center font-medium text-muted-foreground whitespace-nowrap">
                                    metaTitle
                                </th>
                                <th className="px-4 py-3 text-center font-medium text-muted-foreground whitespace-nowrap">
                                    metaDescription
                                </th>
                                <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                                    Фото
                                </th>
                                <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                                    Проблем
                                </th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {filtered.map((p) => (
                                <tr
                                    key={p.id}
                                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                                >
                                    <td className="px-4 py-2.5 font-medium text-foreground max-w-xs">
                                        <span className="truncate block">{p.title}</span>
                                    </td>
                                    <td className="px-4 py-2.5 text-muted-foreground">
                                        <p>{p.brand}</p>
                                        <p className="text-xs capitalize">{p.category}</p>
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                        {p.hasMetaTitle ? (
                                            <span className="text-emerald-500">✓</span>
                                        ) : (
                                            <span className="text-red-500 font-semibold">✗</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                        {p.hasMetaDesc ? (
                                            <span className="text-emerald-500">✓</span>
                                        ) : (
                                            <span className="text-red-500 font-semibold">✗</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                        {p.hasImage ? (
                                            <span className="text-emerald-500">✓</span>
                                        ) : (
                                            <span className="text-red-500 font-semibold">✗</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                        <span
                                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                                p.issueCount === 3
                                                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                                    : p.issueCount === 2
                                                    ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                                                    : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                                            }`}
                                        >
                                            {p.issueCount}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <Link
                                            href={`/admin/products/${p.id}`}
                                            className="text-xs text-primary hover:underline dark:text-primary whitespace-nowrap"
                                        >
                                            Редактировать →
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {products.length > 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                    Всего в каталоге: {products.length} товаров · Заполнены корректно:{' '}
                    {products.length - counts.all}
                </p>
            )}
        </div>
    );
}
