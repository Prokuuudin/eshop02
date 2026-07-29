'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import AdminGate from '@/components/admin/AdminGate';
import { useOrders } from '@/lib/orders-store';
import { formatEuro } from '@/lib/utils';

type Period = '7d' | '30d' | '90d' | 'all';

const formatMoney = (v: number) => formatEuro(v, 'ru-RU');

function BarChart({
    data,
    color = '#059669',
}: {
    data: { label: string; value: number }[];
    color?: string;
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
                                {frac === 0 ? '0' : Math.round(max * frac).toLocaleString('ru-RU')}
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
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
            {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
        </div>
    );
}

export default function SalesAnalyticsPage(): React.ReactElement {
    const orders = useOrders((s) => s.orders);
    const [period, setPeriod] = useState<Period>('30d');
    const [now] = useState(Date.now);

    const filteredOrders = useMemo(() => {
        if (period === 'all') return orders;
        const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
        const cutoff = now - days * 86400000;
        return orders.filter((o) => new Date(o.createdAt).getTime() >= cutoff);
    }, [orders, period, now]);

    const totalRevenue = filteredOrders.reduce((s, o) => s + (o.total ?? 0), 0);
    const avgOrder = filteredOrders.length ? totalRevenue / filteredOrders.length : 0;
    const uniqueCustomers = new Set(filteredOrders.map((o) => o.email)).size;

    const revenueByDay = useMemo(() => {
        const map = new Map<string, number>();
        filteredOrders.forEach((o) => {
            const d = new Date(o.createdAt).toLocaleDateString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
            });
            map.set(d, (map.get(d) ?? 0) + (o.total ?? 0));
        });
        return Array.from(map.entries())
            .sort((a, b) => {
                const [da, ma] = a[0].split('.').map(Number);
                const [db, mb] = b[0].split('.').map(Number);
                return ma !== mb ? ma - mb : da - db;
            })
            .map(([label, value]) => ({ label, value }));
    }, [filteredOrders]);

    const ordersByDay = useMemo(() => {
        const map = new Map<string, number>();
        filteredOrders.forEach((o) => {
            const d = new Date(o.createdAt).toLocaleDateString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
            });
            map.set(d, (map.get(d) ?? 0) + 1);
        });
        return Array.from(map.entries())
            .sort((a, b) => {
                const [da, ma] = a[0].split('.').map(Number);
                const [db, mb] = b[0].split('.').map(Number);
                return ma !== mb ? ma - mb : da - db;
            })
            .map(([label, value]) => ({ label, value }));
    }, [filteredOrders]);

    const topProducts = useMemo(() => {
        const map = new Map<string, { title: string; qty: number; revenue: number }>();
        filteredOrders.forEach((o) => {
            o.items.forEach((item) => {
                const e = map.get(item.id) ?? { title: item.title, qty: 0, revenue: 0 };
                map.set(item.id, {
                    title: item.title,
                    qty: e.qty + item.quantity,
                    revenue: e.revenue + item.price * item.quantity,
                });
            });
        });
        return Array.from(map.values())
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);
    }, [filteredOrders]);

    const topCategories = useMemo(() => {
        const map = new Map<string, { qty: number; revenue: number }>();
        filteredOrders.forEach((o) => {
            o.items.forEach((item) => {
                const cat = (item as { category?: string }).category ?? '—';
                const e = map.get(cat) ?? { qty: 0, revenue: 0 };
                map.set(cat, { qty: e.qty + item.quantity, revenue: e.revenue + item.price * item.quantity });
            });
        });
        return Array.from(map.entries())
            .map(([cat, v]) => ({ cat, ...v }))
            .sort((a, b) => b.revenue - a.revenue);
    }, [filteredOrders]);

    const PERIOD_OPTIONS: { value: Period; label: string }[] = [
        { value: '7d', label: '7 дней' },
        { value: '30d', label: '30 дней' },
        { value: '90d', label: '90 дней' },
        { value: 'all', label: 'Всё время' },
    ];

    return (
        <AdminGate access="full">
            <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">
                            Аналитика продаж
                        </h1>
                        <p className="mt-1 text-sm text-gray-500">
                            {filteredOrders.length} заказов за период
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                    <Link
                        href="/admin/sales/breakdown"
                        className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 dark:border-primary/40 dark:bg-primary/10 dark:text-primary"
                    >
                        Товары и категории →
                    </Link>
                    <div className="flex rounded-lg border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-900">
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
                    <KpiCard label="Выручка" value={formatMoney(totalRevenue)} />
                    <KpiCard label="Заказов" value={String(filteredOrders.length)} />
                    <KpiCard label="Средний чек" value={formatMoney(avgOrder)} />
                    <KpiCard label="Покупателей" value={String(uniqueCustomers)} />
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
                        <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                            Выручка по дням
                        </h2>
                        {revenueByDay.length === 0 ? (
                            <p className="py-8 text-center text-sm text-gray-400">Нет данных</p>
                        ) : (
                            <BarChart data={revenueByDay} color="#059669" />
                        )}
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
                        <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                            Количество заказов по дням
                        </h2>
                        {ordersByDay.length === 0 ? (
                            <p className="py-8 text-center text-sm text-gray-400">Нет данных</p>
                        ) : (
                            <BarChart data={ordersByDay} color="#3b82f6" />
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                        <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                Топ товаров по выручке
                            </h2>
                        </div>
                        {topProducts.length === 0 ? (
                            <p className="py-8 text-center text-sm text-gray-400">Нет данных</p>
                        ) : (
                            <div className="divide-y divide-gray-100 dark:divide-gray-800">
                                {topProducts.map((p, i) => (
                                    <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                                        <span className="w-5 shrink-0 text-xs text-gray-400">{i + 1}</span>
                                        <span className="flex-1 truncate text-sm text-gray-800 dark:text-gray-200">
                                            {p.title}
                                        </span>
                                        <span className="shrink-0 text-xs text-gray-500">×{p.qty}</span>
                                        <span className="w-24 shrink-0 text-right text-sm font-medium text-emerald-600">
                                            {formatMoney(p.revenue)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                        <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                Выручка по категориям
                            </h2>
                        </div>
                        {topCategories.length === 0 ? (
                            <p className="py-8 text-center text-sm text-gray-400">Нет данных</p>
                        ) : (
                            <div className="divide-y divide-gray-100 dark:divide-gray-800">
                                {topCategories.map((c, i) => {
                                    const maxRev = topCategories[0]?.revenue ?? 1;
                                    const pct = Math.round((c.revenue / maxRev) * 100);
                                    return (
                                        <div key={i} className="px-4 py-2.5">
                                            <div className="mb-1 flex items-center justify-between">
                                                <span className="text-sm capitalize text-gray-700 dark:text-gray-300">
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
