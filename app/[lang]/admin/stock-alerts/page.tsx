'use client';

import { useEffect, useState } from 'react';
import AdminGate from '@/components/admin/AdminGate';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { useAdminLocale } from '@/lib/use-admin-locale';
import {
    fetchStockAlerts,
    type StockAlertRow,
} from './stockAlertsData';

const STORAGE_KEY = 'admin-stock-threshold';
const DEFAULT_THRESHOLD = 5;
const PAGE_SIZE = 50;

function StockBadge({ stock, threshold }: { stock: number; threshold: number }) {
    const { l } = useAdminLocale();
    if (stock === 0) {
        return (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                {l('Нет в наличии', 'Out of stock', 'Nav noliktavā')}
            </span>
        );
    }
    if (stock <= threshold) {
        return (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                {l('Мало:', 'Low:', 'Maz:')} {stock}
            </span>
        );
    }
    return (
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            {stock}
        </span>
    );
}

// Silence = ERP-confirmed. Only the unreliable rows get a badge, so an admin scanning
// the table sees noise flagged rather than every row decorated.
function SyncBadge({ synced }: { synced: boolean }) {
    const { l } = useAdminLocale();
    if (synced) return null;
    return (
        <span
            title={l('Остаток не подтверждён ERP-синхронизацией — может быть техническим значением-заглушкой из старого импорта (чаще всего унаследованное «10000»), а не актуальным складским остатком', 'Stock is not confirmed by ERP synchronization and may be a legacy placeholder value (often “10000”) rather than the current inventory', 'Atlikums nav apstiprināts ar ERP sinhronizāciju un var būt mantota tehniska viettura vērtība (bieži “10000”), nevis pašreizējais noliktavas atlikums')}
            className="shrink-0 rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
        >
            {l('Не подтверждено ERP', 'Not confirmed by ERP', 'ERP nav apstiprinājis')}
        </span>
    );
}

export default function StockAlertsPage(): React.ReactElement {
    const { l, locale } = useAdminLocale();
    const [products, setProducts] = useState<StockAlertRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
    const [thresholdInput, setThresholdInput] = useState(String(DEFAULT_THRESHOLD));
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'all' | 'low' | 'out'>('low');
    const [hideUnconfirmed, setHideUnconfirmed] = useState(false);
    const [showCaveat, setShowCaveat] = useState(true);
    const [alertEmail, setAlertEmail] = useState('');
    const [alertSending, setAlertSending] = useState(false);
    const [alertResult, setAlertResult] = useState<{ ok: boolean; sent?: number } | null>(null);
    const [lastSent, setLastSent] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [productCount, setProductCount] = useState(0);
    const [outCount, setOutCount] = useState(0);
    const [lowCount, setLowCount] = useState(0);
    const [unconfirmedCount, setUnconfirmedCount] = useState(0);

    useEffect(() => {
        queueMicrotask(() => {
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
        });
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            setLoading(true);
            fetchStockAlerts({
                page, limit: PAGE_SIZE, threshold, search, filter, hideUnconfirmed,
                signal: controller.signal,
            })
                .then((data) => {
                    setProducts(data.products);
                    setTotal(data.total);
                    setTotalPages(data.totalPages);
                    setProductCount(data.productCount);
                    setOutCount(data.outCount);
                    setLowCount(data.lowCount);
                    setUnconfirmedCount(data.unconfirmedCount);
                })
                .catch((error: unknown) => {
                    if (!(error instanceof DOMException && error.name === 'AbortError')) setProducts([]);
                })
                .finally(() => {
                    if (!controller.signal.aborted) setLoading(false);
                });
        }, search ? 250 : 0);
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [filter, hideUnconfirmed, page, search, threshold]);

    const sendAlert = async () => {
        if (!alertEmail || alertSending) return;
        localStorage.setItem('admin-stock-alert-email', alertEmail);
        setAlertSending(true);
        setAlertResult(null);
        try {
            const res = await fetch('/api/admin/stock-alerts/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: alertEmail, threshold }),
            });
            const data = (await res.json()) as { ok: boolean; sent?: number };
            setAlertResult(data);
            if (data.ok) {
                const ts = new Date().toLocaleString(locale);
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
            setPage(1);
            localStorage.setItem(STORAGE_KEY, String(v));
        }
    };

    return (
        <AdminGate access="full">
            <div className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">
                            {l('Алерты низкого остатка', 'Low-stock alerts', 'Zema atlikuma brīdinājumi')}
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {l('Товары с критически низким или нулевым остатком', 'Products with critically low or zero stock', 'Produkti ar kritiski zemu vai nulles atlikumu')}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3">
                        <span className="text-sm text-muted-foreground">{l('Порог:', 'Threshold:', 'Slieksnis:')}</span>
                        <Input
                            type="number"
                            min={0}
                            value={thresholdInput}
                            onChange={(e) => setThresholdInput(e.target.value)}
                            className="h-8 w-16 px-2 py-1 text-sm"
                        />
                        <button
                            type="button"
                            onClick={applyThreshold}
                            className="rounded-md bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-700"
                        >
                            {l('Сохранить', 'Save', 'Saglabāt')}
                        </button>
                    </div>
                </div>

                {/* Email alert */}
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                            <p className="text-sm font-semibold text-foreground">{l('Email-отчёт об остатках', 'Stock report by email', 'Atlikumu pārskats e-pastā')}</p>
                            {lastSent && (
                                <p className="text-xs text-muted-foreground mt-0.5">{l('Последняя отправка:', 'Last sent:', 'Pēdējoreiz nosūtīts:')} {lastSent}</p>
                            )}
                        </div>
                        {alertResult?.ok && (
                            <span className="text-xs text-emerald-600 dark:text-emerald-400">
                                {l('Отправлено', 'Sent', 'Nosūtīts')} ({alertResult.sent} {l('товаров', 'products', 'produkti')})
                            </span>
                        )}
                        {alertResult && !alertResult.ok && (
                            <span className="text-xs text-red-600 dark:text-red-400">{l('Ошибка отправки. Проверьте SMTP.', 'Sending failed. Check SMTP settings.', 'Nosūtīšana neizdevās. Pārbaudiet SMTP iestatījumus.')}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <Input
                            type="email"
                            placeholder="admin@example.com"
                            value={alertEmail}
                            onChange={(e) => { setAlertEmail(e.target.value); setAlertResult(null); }}
                            className="h-9 flex-1 min-w-[220px] py-1.5 text-sm"
                        />
                        <button
                            type="button"
                            onClick={sendAlert}
                            disabled={alertSending || !alertEmail || loading}
                            className="rounded-md bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-40 whitespace-nowrap"
                        >
                            {alertSending ? l('Отправка...', 'Sending...', 'Nosūtīšana...') : `${l('Отправить отчёт', 'Send report', 'Nosūtīt pārskatu')} (${outCount + lowCount} ${l('позиций', 'items', 'pozīcijas')})`}
                        </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {l('Письмо содержит все товары с нулевым остатком и остатком ≤', 'The email includes all products with zero stock or stock ≤', 'E-pastā ir visi produkti ar nulles atlikumu vai atlikumu ≤')} {threshold} {l('шт.', 'units.', 'vienībām.')}
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-900/20">
                        <p className="text-xs text-red-600 dark:text-red-400">{l('Нет в наличии', 'Out of stock', 'Nav noliktavā')}</p>
                        <p className="mt-1 text-3xl font-bold text-red-700 dark:text-red-300">{outCount}</p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-900/20">
                        <p className="text-xs text-amber-600 dark:text-amber-400">{l('Мало', 'Low', 'Maz')} (≤ {threshold})</p>
                        <p className="mt-1 text-3xl font-bold text-amber-700 dark:text-amber-300">{lowCount}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4">
                        <p className="text-xs text-muted-foreground">{l('Всего товаров', 'Total products', 'Produkti kopā')}</p>
                        <p className="mt-1 text-3xl font-bold text-foreground">{productCount}</p>
                    </div>
                </div>

                {!loading && showCaveat && unconfirmedCount > 0 && (
                    <div className="flex items-start justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">
                        <p>
                            {l(`${unconfirmedCount} из ${productCount} товаров ещё не синхронизированы с ERP — их остаток может быть техническим значением-заглушкой, унаследованным из старого импорта (чаще всего «10000»), а не актуальным складским остатком. Такие строки помечены бейджем «Не подтверждено ERP»; включите переключатель ниже, чтобы скрыть их из таблицы.`, `${unconfirmedCount} of ${productCount} products have not yet been synchronized with ERP. Their stock may be a legacy placeholder value (often “10000”) rather than current inventory. These rows are marked “Not confirmed by ERP”; enable the switch below to hide them.`, `${unconfirmedCount} no ${productCount} produktiem vēl nav sinhronizēti ar ERP. To atlikums var būt mantota tehniska viettura vērtība (bieži “10000”), nevis pašreizējais noliktavas atlikums. Šīs rindas ir atzīmētas ar “ERP nav apstiprinājis”; ieslēdziet zemāk esošo slēdzi, lai tās paslēptu.`)}
                        </p>
                        <button
                            type="button"
                            onClick={() => setShowCaveat(false)}
                            aria-label={l('Скрыть предупреждение', 'Dismiss warning', 'Paslēpt brīdinājumu')}
                            className="shrink-0 text-blue-600 hover:underline dark:text-blue-400"
                        >
                            ✕
                        </button>
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                    <Input
                        type="text"
                        placeholder={l('Поиск по названию, бренду, SKU...', 'Search by name, brand or SKU...', 'Meklēt pēc nosaukuma, zīmola vai SKU...')}
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        className="min-w-[240px] flex-1 text-sm"
                    />
                    <div className="flex rounded-lg border border-border bg-card p-1">
                        {(
                            [
                                { value: 'low', label: `${l('Мало', 'Low', 'Maz')} (${lowCount})` },
                                { value: 'out', label: `${l('Нет', 'Out', 'Nav')} (${outCount})` },
                                { value: 'all', label: l('Все', 'All', 'Visi') },
                            ] as const
                        ).map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => { setFilter(opt.value); setPage(1); }}
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
                    <Checkbox
                        checked={hideUnconfirmed}
                        onCheckedChange={(checked) => { setHideUnconfirmed(checked); setPage(1); }}
                        label={`${l('Скрыть неподтверждённые ERP', 'Hide ERP-unconfirmed products', 'Slēpt ERP neapstiprinātos produktus')}${unconfirmedCount ? ` (${unconfirmedCount})` : ''}`}
                    />
                </div>

                <div className="overflow-x-auto rounded-xl border border-border bg-card">
                    {loading ? (
                        <div className="py-16 text-center text-sm text-muted-foreground">{l('Загрузка...', 'Loading...', 'Ielāde...')}</div>
                    ) : products.length === 0 ? (
                        <div className="py-16 text-center text-sm text-muted-foreground">
                            {hideUnconfirmed && unconfirmedCount > 0
                                ? l('Нет подтверждённых ERP товаров, подходящих под фильтр', 'No ERP-confirmed products match the filter', 'Filtram neatbilst neviens ERP apstiprināts produkts')
                                : filter === 'low'
                                  ? l('Нет товаров с низким остатком', 'No low-stock products', 'Nav produktu ar zemu atlikumu')
                                  : filter === 'out'
                                    ? l('Нет товаров с нулевым остатком', 'No out-of-stock products', 'Nav produktu ar nulles atlikumu')
                                    : l('Ничего не найдено', 'Nothing found', 'Nekas nav atrasts')}
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="border-b border-border bg-muted">
                                <tr>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        {l('Товар', 'Product', 'Produkts')}
                                    </th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        {l('Бренд', 'Brand', 'Zīmols')}
                                    </th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        SKU
                                    </th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        {l('Категория', 'Category', 'Kategorija')}
                                    </th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        {l('Цена', 'Price', 'Cena')}
                                    </th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        {l('Остаток', 'Stock', 'Atlikums')}
                                    </th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        {l('Действие', 'Action', 'Darbība')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {products.map((p) => (
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
                                        <td className="px-4 py-3 font-medium text-foreground">
                                            <div className="flex items-center gap-2">
                                                <span>{p.title}</span>
                                                <SyncBadge synced={p.synced} />
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">{p.brand}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{p.sku ?? '—'}</td>
                                        <td className="px-4 py-3 capitalize text-muted-foreground">
                                            {p.category}
                                        </td>
                                        <td className="px-4 py-3 text-foreground">
                                            €{p.price.toLocaleString(locale)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <StockBadge stock={p.stock} threshold={threshold} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <Link
                                                href={`/admin/products/${p.id}`}
                                                className="text-xs text-emerald-600 hover:underline dark:text-emerald-400"
                                            >
                                                {l('Редактировать', 'Edit', 'Rediģēt')}
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {!loading && totalPages > 1 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                        <span className="text-muted-foreground">
                            {l('Показано', 'Shown', 'Parādīti')} {products.length} {l('из', 'of', 'no')} {total} · {l('страница', 'page', 'lapa')} {page} {l('из', 'of', 'no')} {totalPages}
                        </span>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setPage((value) => Math.max(1, value - 1))}
                                disabled={page <= 1}
                                className="rounded-md border border-border bg-card px-3 py-1.5 disabled:opacity-40"
                            >
                                {l('Назад', 'Back', 'Atpakaļ')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                                disabled={page >= totalPages}
                                className="rounded-md border border-border bg-card px-3 py-1.5 disabled:opacity-40"
                            >
                                {l('Дальше', 'Next', 'Tālāk')}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </AdminGate>
    );
}
