'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import AdminGate from '@/components/admin/AdminGate';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CATEGORY_OPTIONS } from '@/lib/admin/products/constants';

type Product = {
    id: string;
    revision: number;
    title: string;
    brand: string;
    category: string;
    price: number;
    oldPrice?: number;
    sku?: string;
};

type AdjustMode = 'percent' | 'fixed_add' | 'fixed_set';

type ChangeBatchItem = {
    id: string;
    title: string;
    sku?: string;
    oldPrice: number;
    newPrice: number;
    status: 'ok' | 'err';
    revision: number;
};

type ChangeBatch = {
    id: string;
    appliedAt: Date;
    description: string;
    ok: number;
    err: number;
    items: ChangeBatchItem[];
    reverted: boolean;
};

type PendingAction = { type: 'apply' } | { type: 'revert'; batch: ChangeBatch };

const PAGE_SIZE = 100;
const HISTORY_LIMIT = 20;

function formatMoney(v: number) {
    return v.toLocaleString('ru-RU', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcNewPrice(price: number, mode: AdjustMode, value: number): number {
    if (mode === 'percent') return Math.max(0, Math.round((price * (1 + value / 100)) * 100) / 100);
    if (mode === 'fixed_add') return Math.max(0, Math.round((price + value) * 100) / 100);
    return Math.max(0, value);
}

function describeChange(mode: AdjustMode, value: number, saveOldPrice: boolean): string {
    const base = mode === 'percent'
        ? `${value > 0 ? '+' : ''}${value}%`
        : mode === 'fixed_add'
            ? `${value > 0 ? '+' : ''}${formatMoney(value)}`
            : `цена = ${formatMoney(value)}`;
    return saveOldPrice ? `${base}, старая цена сохранена` : base;
}

export default function BulkPricePage(): React.ReactElement {
    const [products, setProducts] = useState<Product[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const snapshots = useRef<Map<string, Product>>(new Map());
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [catFilter, setCatFilter] = useState('');
    const [mode, setMode] = useState<AdjustMode>('percent');
    const [value, setValue] = useState('');
    const [saveOldPrice, setSaveOldPrice] = useState(true);
    const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
    const [history, setHistory] = useState<ChangeBatch[]>([]);

    useEffect(() => {
        const id = setTimeout(() => setSearch(searchInput.trim()), 300);
        return () => clearTimeout(id);
    }, [searchInput]);

    useEffect(() => {
        setPage(1);
    }, [search, catFilter]);

    const buildParams = useCallback((pageToLoad: number) => {
        const params = new URLSearchParams({ page: String(pageToLoad), limit: String(PAGE_SIZE) });
        if (search) params.set('q', search);
        if (catFilter) params.set('category', catFilter);
        return params;
    }, [search, catFilter]);

    const loadPage = useCallback((pageToLoad: number) => {
        setLoading(true);
        return fetch(`/api/admin/products?${buildParams(pageToLoad)}`)
            .then((r) => r.json())
            .then((json: { data?: { products?: Product[]; total?: number } }) => {
                const list = Array.isArray(json.data?.products) ? json.data.products : [];
                setProducts(list);
                setTotal(json.data?.total ?? 0);
            })
            .finally(() => setLoading(false));
    }, [buildParams]);

    useEffect(() => {
        loadPage(page);
    }, [page, loadPage]);

    const numValue = parseFloat(value);
    const adjustValid = value !== '' && Number.isFinite(numValue);
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const toggle = (p: Product) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(p.id)) {
                next.delete(p.id);
            } else {
                next.add(p.id);
                snapshots.current.set(p.id, p);
            }
            return next;
        });
    };

    const clearSelection = () => {
        setSelected(new Set());
        snapshots.current.clear();
    };

    const preview = (p: Product): number | null => {
        if (!adjustValid || !selected.has(p.id)) return null;
        return calcNewPrice(p.price, mode, numValue);
    };

    const resetAdjustmentFields = () => {
        setMode('percent');
        setValue('');
        setSaveOldPrice(true);
    };

    const resetAll = () => {
        resetAdjustmentFields();
        setSelected(new Set());
        snapshots.current.clear();
    };

    const putProduct = async (id: string, revision: number, changes: Record<string, unknown>): Promise<{ status: 'ok' | 'err'; revision: number }> => {
        try {
            const res = await fetch('/api/admin/products', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, revision, changes }),
            });
            if (!res.ok) return { status: 'err', revision };
            const json: { data?: { product?: { revision?: number } } } = await res.json();
            return { status: 'ok', revision: json.data?.product?.revision ?? revision };
        } catch {
            return { status: 'err', revision };
        }
    };

    const applyChanges = async () => {
        if (!adjustValid || selected.size === 0) return;
        setPendingAction(null);
        setSaving(true);
        const targets = [...selected]
            .map((id) => snapshots.current.get(id))
            .filter((p): p is Product => p !== undefined);
        const items: ChangeBatchItem[] = await Promise.all(
            targets.map(async (p) => {
                const newPrice = calcNewPrice(p.price, mode, numValue);
                const changes: Record<string, unknown> = { price: newPrice };
                if (saveOldPrice) changes.oldPrice = p.price;
                const { status, revision } = await putProduct(p.id, p.revision, changes);
                return { id: p.id, title: p.title, sku: p.sku, oldPrice: p.price, newPrice, status, revision };
            })
        );
        setSaving(false);
        const ok = items.filter((i) => i.status === 'ok').length;
        const err = items.length - ok;
        setHistory((prev) => [
            { id: `${Date.now()}`, appliedAt: new Date(), description: describeChange(mode, numValue, saveOldPrice), ok, err, items, reverted: false },
            ...prev,
        ].slice(0, HISTORY_LIMIT));
        if (ok > 0) await loadPage(page);
        resetAll();
    };

    const performRevert = async (batch: ChangeBatch) => {
        setPendingAction(null);
        setSaving(true);
        const targets = batch.items.filter((i) => i.status === 'ok');
        const items: ChangeBatchItem[] = await Promise.all(
            targets.map(async (item) => {
                const { status, revision } = await putProduct(item.id, item.revision, { price: item.oldPrice, oldPrice: item.newPrice });
                return { id: item.id, title: item.title, sku: item.sku, oldPrice: item.newPrice, newPrice: item.oldPrice, status, revision };
            })
        );
        setSaving(false);
        const ok = items.filter((i) => i.status === 'ok').length;
        const err = items.length - ok;
        setHistory((prev) => [
            { id: `${Date.now()}`, appliedAt: new Date(), description: `Откат: ${batch.description}`, ok, err, items, reverted: false },
            ...prev.map((b) => (b.id === batch.id ? { ...b, reverted: true } : b)),
        ].slice(0, HISTORY_LIMIT));
        if (ok > 0) await loadPage(page);
    };

    const MODE_OPTIONS: { value: AdjustMode; label: string; placeholder: string }[] = [
        { value: 'percent', label: '% изменение', placeholder: 'напр. -10 или 5' },
        { value: 'fixed_add', label: 'Добавить сумму', placeholder: 'напр. 50 или -100' },
        { value: 'fixed_set', label: 'Установить цену', placeholder: 'новая цена' },
    ];

    return (
        <AdminGate access="full">
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">
                        Массовый редактор цен
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Выберите товары и примените изменение цены
                    </p>
                </div>

                <div className="rounded-xl border border-border bg-card p-4">
                    <h2 className="mb-3 text-sm font-semibold text-foreground">
                        Настройка изменения
                    </h2>
                    <div className="flex flex-wrap items-end gap-4">
                        <div>
                            <p className="mb-1 block text-xs text-muted-foreground">Тип изменения</p>
                            <div className="flex h-10 items-center rounded-lg border border-border bg-muted p-1">
                                {MODE_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setMode(opt.value)}
                                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                            mode === opt.value
                                                ? 'bg-white text-emerald-700 shadow-sm dark:bg-gray-900 dark:text-emerald-400'
                                                : 'text-gray-600 hover:bg-white dark:text-gray-400 dark:hover:bg-gray-900'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label htmlFor="bulk-price-value" className="mb-1 block text-xs text-muted-foreground">Значение</label>
                            <Input
                                id="bulk-price-value"
                                type="number"
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                placeholder={MODE_OPTIONS.find((o) => o.value === mode)?.placeholder}
                                className="w-40 text-sm"
                            />
                        </div>
                        <div>
                            <p aria-hidden className="mb-1 block text-xs text-transparent">·</p>
                            <label htmlFor="bulk-price-save-old" className="flex h-10 items-center gap-2 text-sm text-foreground">
                                <Checkbox
                                    id="bulk-price-save-old"
                                    checked={saveOldPrice}
                                    onCheckedChange={(checked) => setSaveOldPrice(checked === true)}
                                />
                                Сохранить старую цену (зачёркнутая)
                            </label>
                        </div>
                        <div>
                            <p aria-hidden className="mb-1 block text-xs text-transparent">·</p>
                            <button
                                type="button"
                                onClick={() => setPendingAction({ type: 'apply' })}
                                disabled={!adjustValid || selected.size === 0 || saving}
                                className="h-10 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                            >
                                {saving ? 'Сохранение...' : `Применить к ${selected.size} товарам`}
                            </button>
                        </div>
                    </div>
                </div>

                <Dialog open={pendingAction !== null} onOpenChange={(open) => !open && setPendingAction(null)}>
                    <DialogContent>
                        {pendingAction?.type === 'revert' ? (
                            <>
                                <DialogHeader>
                                    <DialogTitle>Откатить изменение цены</DialogTitle>
                                    <DialogDescription>
                                        Цены {pendingAction.batch.items.filter((i) => i.status === 'ok').length} товар(ов) вернутся к значениям до изменения «{pendingAction.batch.description}». Это тоже сразу запишется в базу данных.
                                    </DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                    <DialogClose asChild>
                                        <button type="button" className="h-10 rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted">
                                            Отмена
                                        </button>
                                    </DialogClose>
                                    <button
                                        type="button"
                                        onClick={() => performRevert(pendingAction.batch)}
                                        className="h-10 rounded-md bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-700"
                                    >
                                        Откатить
                                    </button>
                                </DialogFooter>
                            </>
                        ) : (
                            <>
                                <DialogHeader>
                                    <DialogTitle>Подтвердите изменение цены</DialogTitle>
                                    <DialogDescription>
                                        Изменение «{describeChange(mode, numValue, saveOldPrice)}» будет применено к {selected.size} товар{selected.size === 1 ? 'у' : 'ам'} и сразу записано в базу данных. Откатить можно будет из истории изменений ниже.
                                    </DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                    <DialogClose asChild>
                                        <button type="button" className="h-10 rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted">
                                            Отмена
                                        </button>
                                    </DialogClose>
                                    <button
                                        type="button"
                                        onClick={applyChanges}
                                        className="h-10 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
                                    >
                                        Применить
                                    </button>
                                </DialogFooter>
                            </>
                        )}
                    </DialogContent>
                </Dialog>

                <div className="flex flex-wrap items-center gap-3">
                    <Input
                        type="text"
                        placeholder="Поиск по названию, бренду, SKU..."
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        className="w-full text-sm sm:w-72"
                    />
                    <Select value={catFilter || 'all'} onValueChange={(v) => setCatFilter(v === 'all' ? '' : v)}>
                        <SelectTrigger className="w-48 shrink-0 rounded-md border border-border px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Все категории</SelectItem>
                            {CATEGORY_OPTIONS.map((c) => (
                                <SelectItem key={c} value={c}>
                                    {c}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                        <span>Выбрано: {selected.size}</span>
                        {selected.size > 0 && (
                            <button
                                type="button"
                                onClick={clearSelection}
                                className="underline hover:no-underline"
                            >
                                Снять выбор
                            </button>
                        )}
                        <span>· Показано {products.length} из {total}</span>
                    </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-border bg-card">
                    {loading ? (
                        <div className="py-16 text-center text-sm text-muted-foreground">Загрузка...</div>
                    ) : products.length === 0 ? (
                        <div className="py-16 text-center text-sm text-muted-foreground">Ничего не найдено</div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="border-b border-border bg-muted">
                                <tr>
                                    <th className="w-10 px-4 py-3" />
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        Товар
                                    </th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        Бренд
                                    </th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        Категория
                                    </th>
                                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                                        Текущая цена
                                    </th>
                                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                                        Новая цена
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {products.map((p) => {
                                    const newPrice = preview(p);
                                    const isSelected = selected.has(p.id);
                                    const changed = newPrice !== null && newPrice !== p.price;
                                    return (
                                        <tr
                                            key={p.id}
                                            onClick={() => toggle(p)}
                                            className={`cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                                                isSelected
                                                    ? 'bg-emerald-50/40 dark:bg-emerald-900/10'
                                                    : ''
                                            }`}
                                        >
                                            <td className="px-4 py-3">
                                                <Checkbox
                                                    checked={isSelected}
                                                    onCheckedChange={() => toggle(p)}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-foreground">
                                                    {p.title}
                                                </div>
                                                {p.sku && (
                                                    <div className="text-xs text-muted-foreground">{p.sku}</div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground">
                                                {p.brand}
                                            </td>
                                            <td className="px-4 py-3 capitalize text-muted-foreground">
                                                {p.category}
                                            </td>
                                            <td className="px-4 py-3 text-right text-foreground">
                                                {formatMoney(p.price)}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {newPrice !== null ? (
                                                    <span
                                                        className={`font-medium ${
                                                            changed
                                                                ? newPrice < p.price
                                                                    ? 'text-red-600 dark:text-red-400'
                                                                    : 'text-emerald-600 dark:text-emerald-400'
                                                                : 'text-gray-500'
                                                        }`}
                                                    >
                                                        {formatMoney(newPrice)}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {totalPages > 1 && (
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <button
                            type="button"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page <= 1 || loading}
                            className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
                        >
                            Назад
                        </button>
                        <span>Страница {page} из {totalPages}</span>
                        <button
                            type="button"
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page >= totalPages || loading}
                            className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
                        >
                            Вперёд
                        </button>
                    </div>
                )}

                {history.length > 0 && (
                    <div className="rounded-xl border border-border bg-card p-4">
                        <h2 className="mb-3 text-sm font-semibold text-foreground">
                            История изменений (за эту сессию)
                        </h2>
                        <div className="space-y-2">
                            {history.map((batch, i) => (
                                <details key={batch.id} open={i === 0} className="rounded-lg border border-border">
                                    <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                                        <span className="text-muted-foreground">
                                            {batch.appliedAt.toLocaleTimeString('ru-RU')}
                                        </span>
                                        <span className="font-medium text-foreground">{batch.description}</span>
                                        <span
                                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                                batch.err === 0
                                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                                    : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                            }`}
                                        >
                                            Обновлено: {batch.ok}{batch.err > 0 && `, ошибок: ${batch.err}`}
                                        </span>
                                        {batch.reverted ? (
                                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                                откачено
                                            </span>
                                        ) : batch.ok > 0 && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setPendingAction({ type: 'revert', batch });
                                                }}
                                                disabled={saving}
                                                className="ml-auto text-xs text-amber-700 underline hover:no-underline disabled:opacity-40 dark:text-amber-400"
                                            >
                                                Откатить
                                            </button>
                                        )}
                                    </summary>
                                    <div className="overflow-x-auto border-t border-border">
                                        <table className="w-full text-sm">
                                            <tbody className="divide-y divide-border">
                                                {batch.items.map((item) => (
                                                    <tr key={item.id}>
                                                        <td className="px-3 py-2">
                                                            <div className="text-foreground">{item.title}</div>
                                                            {item.sku && <div className="text-xs text-muted-foreground">{item.sku}</div>}
                                                        </td>
                                                        <td className="px-3 py-2 text-right text-muted-foreground">
                                                            {formatMoney(item.oldPrice)}
                                                        </td>
                                                        <td className="px-3 py-2 text-right font-medium text-foreground">
                                                            → {formatMoney(item.newPrice)}
                                                        </td>
                                                        <td className="px-3 py-2 text-right">
                                                            <span className={item.status === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                                                                {item.status === 'ok' ? 'ок' : 'ошибка'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </details>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </AdminGate>
    );
}
