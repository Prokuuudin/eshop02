'use client';

import { useEffect, useState } from 'react';
import AdminGate from '@/components/admin/AdminGate';
import Link from 'next/link';

type Product = {
    id: string;
    title: string;
    brand: string;
    category: string;
    stock: number;
    sku?: string;
    price: number;
};

const STORAGE_KEY = 'admin-stock-threshold';
const DEFAULT_THRESHOLD = 5;

function StockBadge({ stock, threshold }: { stock: number; threshold: number }) {
    if (stock === 0) {
        return (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                Нет в наличии
            </span>
        );
    }
    if (stock <= threshold) {
        return (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                Мало: {stock}
            </span>
        );
    }
    return (
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            {stock}
        </span>
    );
}

export default function StockAlertsPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
    const [thresholdInput, setThresholdInput] = useState(String(DEFAULT_THRESHOLD));
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'all' | 'low' | 'out'>('low');
    const [alertEmail, setAlertEmail] = useState('');
    const [alertSending, setAlertSending] = useState(false);
    const [alertResult, setAlertResult] = useState<{ ok: boolean; sent?: number } | null>(null);
    const [lastSent, setLastSent] = useState<string | null>(null);

    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const v = parseInt(saved, 10);
            if (Number.isFinite(v)) {
                setThreshold(v);
                setThresholdInput(String(v));
            }
        }
        const savedEmail = localStorage.getItem('admin-stock-alert-email');
        if (savedEmail) setAlertEmail(savedEmail);
        const savedLastSent = localStorage.getItem('admin-stock-alert-last-sent');
        if (savedLastSent) setLastSent(savedLastSent);
    }, []);

    useEffect(() => {
        setLoading(true);
        fetch('/api/admin/products')
            .then((r) => r.json())
            .then((data: Product[]) => setProducts(Array.isArray(data) ? data : []))
            .finally(() => setLoading(false));
    }, []);

    const sendAlert = async () => {
        if (!alertEmail || alertSending) return;
        localStorage.setItem('admin-stock-alert-email', alertEmail);
        setAlertSending(true);
        setAlertResult(null);
        try {
            const res = await fetch('/api/admin/stock-alerts/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: alertEmail, threshold, products }),
            });
            const data = (await res.json()) as { ok: boolean; sent?: number };
            setAlertResult(data);
            if (data.ok) {
                const ts = new Date().toLocaleString('ru-RU');
                setLastSent(ts);
                localStorage.setItem('admin-stock-alert-last-sent', ts);
            }
        } catch {
            setAlertResult({ ok: false });
        } finally {
            setAlertSending(false);
        }
    };

    const applyThreshold = () => {
        const v = parseInt(thresholdInput, 10);
        if (Number.isFinite(v) && v >= 0) {
            setThreshold(v);
            localStorage.setItem(STORAGE_KEY, String(v));
        }
    };

    const filtered = products.filter((p) => {
        if (filter === 'out' && p.stock !== 0) return false;
        if (filter === 'low' && p.stock === 0) return false;
        if (filter === 'low' && p.stock > threshold) return false;
        if (search) {
            const q = search.toLowerCase();
            return (
                p.title.toLowerCase().includes(q) ||
                p.brand.toLowerCase().includes(q) ||
                (p.sku ?? '').toLowerCase().includes(q)
            );
        }
        return true;
    });

    const outCount = products.filter((p) => p.stock === 0).length;
    const lowCount = products.filter((p) => p.stock > 0 && p.stock <= threshold).length;

    return (
        <AdminGate access="full">
            <div className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">
                            Алерты низкого остатка
                        </h1>
                        <p className="mt-1 text-sm text-gray-500">
                            Товары с критически низким или нулевым остатком
                        </p>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                        <span className="text-sm text-muted-foreground">Порог:</span>
                        <input
                            type="number"
                            min={0}
                            value={thresholdInput}
                            onChange={(e) => setThresholdInput(e.target.value)}
                            className="w-16 rounded-md border border-gray-200 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                        />
                        <button
                            type="button"
                            onClick={applyThreshold}
                            className="rounded-md bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-700"
                        >
                            Сохранить
                        </button>
                    </div>
                </div>

                {/* Email alert */}
                <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 p-4 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                            <p className="text-sm font-semibold text-foreground">Email-отчёт об остатках</p>
                            {lastSent && (
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Последняя отправка: {lastSent}</p>
                            )}
                        </div>
                        {alertResult?.ok && (
                            <span className="text-xs text-emerald-600 dark:text-emerald-400">
                                Отправлено ({alertResult.sent} товаров)
                            </span>
                        )}
                        {alertResult && !alertResult.ok && (
                            <span className="text-xs text-red-600 dark:text-red-400">Ошибка отправки. Проверьте SMTP.</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <input
                            type="email"
                            placeholder="admin@example.com"
                            value={alertEmail}
                            onChange={(e) => { setAlertEmail(e.target.value); setAlertResult(null); }}
                            className="flex-1 min-w-[220px] rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground"
                        />
                        <button
                            type="button"
                            onClick={sendAlert}
                            disabled={alertSending || !alertEmail || loading}
                            className="rounded-md bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-40 whitespace-nowrap"
                        >
                            {alertSending ? 'Отправка...' : `Отправить отчёт (${outCount + lowCount} позиций)`}
                        </button>
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                        Письмо содержит все товары с нулевым остатком и остатком ≤ {threshold} шт.
                    </p>
                </div>

                <div className="grid grid-cols-3 gap-4">
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-900/20">
                        <p className="text-xs text-red-600 dark:text-red-400">Нет в наличии</p>
                        <p className="mt-1 text-3xl font-bold text-red-700 dark:text-red-300">{outCount}</p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-900/20">
                        <p className="text-xs text-amber-600 dark:text-amber-400">Мало (≤ {threshold})</p>
                        <p className="mt-1 text-3xl font-bold text-amber-700 dark:text-amber-300">{lowCount}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
                        <p className="text-xs text-gray-500">Всего товаров</p>
                        <p className="mt-1 text-3xl font-bold text-foreground">{products.length}</p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-3">
                    <input
                        type="text"
                        placeholder="Поиск по названию, бренду, SKU..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="min-w-[240px] flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                    />
                    <div className="flex rounded-lg border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-900">
                        {(
                            [
                                { value: 'low', label: `Мало (${lowCount})` },
                                { value: 'out', label: `Нет (${outCount})` },
                                { value: 'all', label: 'Все' },
                            ] as const
                        ).map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => setFilter(opt.value)}
                                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                                    filter === opt.value
                                        ? 'bg-emerald-600 text-white'
                                        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                    {loading ? (
                        <div className="py-16 text-center text-sm text-gray-400">Загрузка...</div>
                    ) : filtered.length === 0 ? (
                        <div className="py-16 text-center text-sm text-gray-400">
                            {filter === 'low'
                                ? 'Нет товаров с низким остатком'
                                : filter === 'out'
                                  ? 'Нет товаров с нулевым остатком'
                                  : 'Ничего не найдено'}
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                                <tr>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        Товар
                                    </th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        Бренд
                                    </th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        SKU
                                    </th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        Категория
                                    </th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        Цена
                                    </th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        Остаток
                                    </th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        Действие
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {filtered.map((p) => (
                                    <tr
                                        key={p.id}
                                        className={`transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                                            p.stock === 0
                                                ? 'bg-red-50/30 dark:bg-red-900/10'
                                                : p.stock <= threshold
                                                  ? 'bg-amber-50/30 dark:bg-amber-900/10'
                                                  : ''
                                        }`}
                                    >
                                        <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200">
                                            {p.title}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">{p.brand}</td>
                                        <td className="px-4 py-3 text-gray-500">{p.sku ?? '—'}</td>
                                        <td className="px-4 py-3 capitalize text-muted-foreground">
                                            {p.category}
                                        </td>
                                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                                            {p.price.toLocaleString('ru-RU')} ₽
                                        </td>
                                        <td className="px-4 py-3">
                                            <StockBadge stock={p.stock} threshold={threshold} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <Link
                                                href={`/admin/products/${p.id}`}
                                                className="text-xs text-emerald-600 hover:underline dark:text-emerald-400"
                                            >
                                                Редактировать
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </AdminGate>
    );
}
