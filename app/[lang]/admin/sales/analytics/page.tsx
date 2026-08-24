'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminGate from '@/components/admin/AdminGate';
import { formatEuro } from '@/lib/utils';
import { useAdminLocale } from '@/lib/use-admin-locale';

type Period = '7d' | '30d' | '90d' | 'all';

type DayPoint = { date: string; value: number };
type ProductRow = { id: string; title: string; qty: number; revenue: number };
type CategoryRow = { cat: string; qty: number; revenue: number };

type AnalyticsResponse = {
    orderCount: number;
    revenue: number;
    uniqueCustomers: number;
    revenueByDay: DayPoint[];
    ordersByDay: DayPoint[];
    topProducts: ProductRow[];
    topCategories: CategoryRow[];
};

const EMPTY_ANALYTICS: AnalyticsResponse = {
    orderCount: 0,
    revenue: 0,
    uniqueCustomers: 0,
    revenueByDay: [],
    ordersByDay: [],
    topProducts: [],
    topCategories: [],
};

const dayLabel = (isoDate: string): string => {
    const [, m, d] = isoDate.split('-');
    return `${d}.${m}`;
};

function BarChart({
    data,
    color = '#059669',
    locale,
}: {
    data: { label: string; value: number }[];
    color?: string;
    locale: string;
}) {
    const max = Math.max(...data.map((d) => d.value), 1);
    const h = 160;
    const barW = Math.max(8, Math.min(40, Math.floor(560 / Math.max(data.length, 1)) - 4));
    const gap = Math.max(2, Math.floor(560 / Math.max(data.length, 1)) - barW);

    return (
        <div className="overflow-x-auto">
            <svg
                width={Math.max(560, data.length * (barW + gap) + 40)}
                height={h + 48}
                className="block"
            >
                {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                    const y = 8 + (h - 8) * (1 - frac);
                    return (
                        <g key={frac}>
                            <line x1={32} x2={data.length * (barW + gap) + 32} y1={y} y2={y} stroke="#e5e7eb" strokeWidth={1} />
                            <text x={28} y={y + 4} textAnchor="end" fontSize={9} fill="#9ca3af">
                                {frac === 0 ? '0' : Math.round(max * frac).toLocaleString(locale)}
                            </text>
                        </g>
                    );
                })}
                {data.map((d, i) => {
                    const barH = Math.max(2, ((d.value / max) * (h - 16)));
                    const x = 32 + i * (barW + gap);
                    const y = h - barH + 8;
                    return (
                        <g key={i}>
                            <rect x={x} y={y} width={barW} height={barH} rx={3} fill={color} opacity={0.85} />
                            <text
                                x={x + barW / 2}
                                y={h + 24}
                                textAnchor="middle"
                                fontSize={9}
                                fill="#6b7280"
                                transform={data.length > 8 ? `rotate(-35,${x + barW / 2},${h + 24})` : undefined}
                            >
                                {d.label}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
            {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </div>
    );
}

export default function SalesAnalyticsPage(): React.ReactElement {
    const { locale, l } = useAdminLocale();
    const formatMoney = (value: number) => formatEuro(value, locale);
    const [period, setPeriod] = useState<Period>('30d');
    const [loaded, setLoaded] = useState<AnalyticsResponse | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        fetch(`/api/admin/sales/analytics?period=${period}`, { signal: controller.signal, cache: 'no-store' })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`status_${res.status}`))))
            .then((json: AnalyticsResponse) => setLoaded(json))
            .catch((e) => { if ((e as Error).name !== 'AbortError') setLoaded(EMPTY_ANALYTICS); });
        return () => controller.abort();
    }, [period]);

    const loading = loaded === null;
    const data = loaded ?? EMPTY_ANALYTICS;

    const totalRevenue = data.revenue;
    const avgOrder = data.orderCount ? totalRevenue / data.orderCount : 0;
    const uniqueCustomers = data.uniqueCustomers;

    const revenueByDay = data.revenueByDay.map((p) => ({ label: dayLabel(p.date), value: p.value }));
    const ordersByDay = data.ordersByDay.map((p) => ({ label: dayLabel(p.date), value: p.value }));
    const topProducts = data.topProducts;
    const topCategories = data.topCategories;

    const PERIOD_OPTIONS: { value: Period; label: string }[] = [
        { value: '7d', label: l('7 дней', '7 days', '7 dienas') },
        { value: '30d', label: l('30 дней', '30 days', '30 dienas') },
        { value: '90d', label: l('90 дней', '90 days', '90 dienas') },
        { value: 'all', label: l('Всё время', 'All time', 'Viss periods') },
    ];

    return (
        <AdminGate access="full">
            <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">
                            {l('Аналитика продаж', 'Sales analytics', 'Pārdošanas analītika')}
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {loading ? l('Загрузка…', 'Loading…', 'Ielāde…') : l(`${data.orderCount} заказов за период`, `${data.orderCount} orders in this period`, `${data.orderCount} pasūtījumi šajā periodā`)}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                    <Link
                        href="/admin/sales/breakdown"
                        className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 dark:border-primary/40 dark:bg-primary/10 dark:text-primary"
                    >
                        {l('Товары и категории', 'Products and categories', 'Produkti un kategorijas')} →
                    </Link>
                    <div className="flex rounded-lg border border-border bg-card p-1">
                        {PERIOD_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => setPeriod(opt.value)}
                                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                                    period === opt.value
                                        ? 'bg-emerald-600 text-white'
                                        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <KpiCard label={l('Выручка', 'Revenue', 'Ieņēmumi')} value={formatMoney(totalRevenue)} />
                    <KpiCard label={l('Заказов', 'Orders', 'Pasūtījumi')} value={String(data.orderCount)} />
                    <KpiCard label={l('Средний чек', 'Average order', 'Vidējais pasūtījums')} value={formatMoney(avgOrder)} />
                    <KpiCard label={l('Покупателей', 'Customers', 'Pircēji')} value={String(uniqueCustomers)} />
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div className="rounded-xl border border-border bg-card p-4">
                        <h2 className="mb-4 text-sm font-semibold text-foreground">
                            {l('Выручка по дням', 'Revenue by day', 'Ieņēmumi pa dienām')}
                        </h2>
                        {revenueByDay.length === 0 ? (
                            <p className="py-8 text-center text-sm text-muted-foreground">{l('Нет данных', 'No data', 'Nav datu')}</p>
                        ) : (
                            <BarChart data={revenueByDay} color="#059669" locale={locale} />
                        )}
                    </div>

                    <div className="rounded-xl border border-border bg-card p-4">
                        <h2 className="mb-4 text-sm font-semibold text-foreground">
                            {l('Количество заказов по дням', 'Orders by day', 'Pasūtījumi pa dienām')}
                        </h2>
                        {ordersByDay.length === 0 ? (
                            <p className="py-8 text-center text-sm text-muted-foreground">{l('Нет данных', 'No data', 'Nav datu')}</p>
                        ) : (
                            <BarChart data={ordersByDay} color="#3b82f6" locale={locale} />
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div className="rounded-xl border border-border bg-card">
                        <div className="border-b border-border px-4 py-3">
                            <h2 className="text-sm font-semibold text-foreground">
                                {l('Топ товаров по выручке', 'Top products by revenue', 'Populārākie produkti pēc ieņēmumiem')}
                            </h2>
                        </div>
                        {topProducts.length === 0 ? (
                            <p className="py-8 text-center text-sm text-muted-foreground">{l('Нет данных', 'No data', 'Nav datu')}</p>
                        ) : (
                            <div className="divide-y divide-border">
                                {topProducts.map((p, i) => (
                                    <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                                        <span className="w-5 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
                                        <span className="flex-1 truncate text-sm text-foreground">
                                            {p.title}
                                        </span>
                                        <span className="shrink-0 text-xs text-muted-foreground">×{p.qty}</span>
                                        <span className="w-24 shrink-0 text-right text-sm font-medium text-emerald-600">
                                            {formatMoney(p.revenue)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="rounded-xl border border-border bg-card">
                        <div className="border-b border-border px-4 py-3">
                            <h2 className="text-sm font-semibold text-foreground">
                                {l('Выручка по категориям', 'Revenue by category', 'Ieņēmumi pa kategorijām')}
                            </h2>
                        </div>
                        {topCategories.length === 0 ? (
                            <p className="py-8 text-center text-sm text-muted-foreground">{l('Нет данных', 'No data', 'Nav datu')}</p>
                        ) : (
                            <div className="divide-y divide-border">
                                {topCategories.map((c, i) => {
                                    const maxRev = topCategories[0]?.revenue ?? 1;
                                    const pct = Math.round((c.revenue / maxRev) * 100);
                                    return (
                                        <div key={i} className="px-4 py-2.5">
                                            <div className="mb-1 flex items-center justify-between">
                                                <span className="text-sm capitalize text-foreground">
                                                    {c.cat}
                                                </span>
                                                <span className="text-sm font-medium text-emerald-600">
                                                    {formatMoney(c.revenue)}
                                                </span>
                                            </div>
                                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                                <div
                                                    className="h-full rounded-full bg-emerald-500"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AdminGate>
    );
}
