'use client';

import { useEffect, useState } from 'react';
import AdminGate from '@/components/admin/AdminGate';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

type Product = {
    id: string;
    title: string;
    brand: string;
    category: string;
    price: number;
    oldPrice?: number;
    stock: number;
    sku?: string;
};

type AdjustMode = 'percent' | 'fixed_add' | 'fixed_set';

function formatMoney(v: number) {
    return v.toLocaleString('ru-RU', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcNewPrice(price: number, mode: AdjustMode, value: number): number {
    if (mode === 'percent') return Math.max(0, Math.round((price * (1 + value / 100)) * 100) / 100);
    if (mode === 'fixed_add') return Math.max(0, Math.round((price + value) * 100) / 100);
    return Math.max(0, value);
}

const CATEGORIES = ['hair', 'nails', 'face', 'body', 'equipment'];

export default function BulkPricePage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState('');
    const [catFilter, setCatFilter] = useState('');
    const [mode, setMode] = useState<AdjustMode>('percent');
    const [value, setValue] = useState('');
    const [saveOldPrice, setSaveOldPrice] = useState(true);
    const [result, setResult] = useState<{ ok: number; err: number } | null>(null);

    useEffect(() => {
        fetch('/api/admin/products')
            .then((r) => r.json())
            .then((data: Product[]) => setProducts(Array.isArray(data) ? data : []))
            .finally(() => setLoading(false));
    }, []);

    const filtered = products.filter((p) => {
        if (catFilter && p.category !== catFilter) return false;
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

    const numValue = parseFloat(value);
    const adjustValid = value !== '' && Number.isFinite(numValue);

    const toggleAll = () => {
        if (selected.size === filtered.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(filtered.map((p) => p.id)));
        }
    };

    const toggle = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const preview = (p: Product): number | null => {
        if (!adjustValid || !selected.has(p.id)) return null;
        return calcNewPrice(p.price, mode, numValue);
    };

    const applyChanges = async () => {
        if (!adjustValid || selected.size === 0) return;
        setSaving(true);
        setResult(null);
        let ok = 0;
        let err = 0;
        const targets = products.filter((p) => selected.has(p.id));
        await Promise.all(
            targets.map(async (p) => {
                const newPrice = calcNewPrice(p.price, mode, numValue);
                const body: Record<string, unknown> = { price: newPrice };
                if (saveOldPrice) body.oldPrice = p.price;
                try {
                    const res = await fetch(`/api/admin/products?id=${p.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    });
                    if (res.ok) ok++;
                    else err++;
                } catch {
                    err++;
                }
            })
        );
        setSaving(false);
        setResult({ ok, err });
        if (ok > 0) {
            const res = await fetch('/api/admin/products');
            const data: Product[] = await res.json();
            setProducts(Array.isArray(data) ? data : []);
            setSelected(new Set());
        }
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
                    <p className="mt-1 text-sm text-gray-500">
                        Выберите товары и примените изменение цены
                    </p>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
                    <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Настройка изменения
                    </h2>
                    <div className="flex flex-wrap items-end gap-4">
                        <div>
                            <label className="mb-1 block text-xs text-gray-500">Тип изменения</label>
                            <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-800">
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
                            <label className="mb-1 block text-xs text-gray-500">Значение</label>
                            <input
                                type="number"
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                placeholder={MODE_OPTIONS.find((o) => o.value === mode)?.placeholder}
                                className="w-40 rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                            />
                        </div>
                        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <Checkbox
                                checked={saveOldPrice}
                                onCheckedChange={(checked) => setSaveOldPrice(checked === true)}
                            />
                            Сохранить старую цену (зачёркнутая)
                        </label>
                        <button
                            type="button"
                            onClick={applyChanges}
                            disabled={!adjustValid || selected.size === 0 || saving}
                            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                        >
                            {saving ? 'Сохранение...' : `Применить к ${selected.size} товарам`}
                        </button>
                    </div>
                    {result && (
                        <div
                            className={`mt-3 rounded-md px-3 py-2 text-sm ${
                                result.err === 0
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                    : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                            }`}
                        >
                            Обновлено: {result.ok}
                            {result.err > 0 && `, ошибок: ${result.err}`}
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap gap-3">
                    <input
                        type="text"
                        placeholder="Поиск по названию, бренду, SKU..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="min-w-[240px] flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                    />
                    <Select value={catFilter || 'all'} onValueChange={(v) => setCatFilter(v === 'all' ? '' : v)}>
                        <SelectTrigger className="rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Все категории</SelectItem>
                            {CATEGORIES.map((c) => (
                                <SelectItem key={c} value={c}>
                                    {c}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <span className="flex items-center text-sm text-gray-500">
                        Выбрано: {selected.size} из {filtered.length}
                    </span>
                </div>

                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                    {loading ? (
                        <div className="py-16 text-center text-sm text-gray-400">Загрузка...</div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                                <tr>
                                    <th className="w-10 px-4 py-3">
                                        <Checkbox
                                            checked={filtered.length > 0 && selected.size === filtered.length}
                                            onCheckedChange={toggleAll}
                                        />
                                    </th>
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
                                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                                        Остаток
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {filtered.map((p) => {
                                    const newPrice = preview(p);
                                    const isSelected = selected.has(p.id);
                                    const changed = newPrice !== null && newPrice !== p.price;
                                    return (
                                        <tr
                                            key={p.id}
                                            onClick={() => toggle(p.id)}
                                            className={`cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                                                isSelected
                                                    ? 'bg-emerald-50/40 dark:bg-emerald-900/10'
                                                    : ''
                                            }`}
                                        >
                                            <td className="px-4 py-3">
                                                <Checkbox
                                                    checked={isSelected}
                                                    onCheckedChange={() => toggle(p.id)}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-gray-800 dark:text-gray-200">
                                                    {p.title}
                                                </div>
                                                {p.sku && (
                                                    <div className="text-xs text-gray-400">{p.sku}</div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground">
                                                {p.brand}
                                            </td>
                                            <td className="px-4 py-3 capitalize text-muted-foreground">
                                                {p.category}
                                            </td>
                                            <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
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
                                                    <span className="text-gray-300 dark:text-gray-600">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right text-muted-foreground">
                                                {p.stock}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </AdminGate>
    );
}
