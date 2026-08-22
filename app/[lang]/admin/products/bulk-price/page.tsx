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
type OldPriceAction = 'save_current' | 'clear';

type ResultItem = {
    id: string;
    title: string;
    sku?: string;
    oldPrice: number;
    newPrice: number;
    status: 'ok' | 'err';
    error?: string;
    httpStatus?: number;
};

type LastResult = {
    kind: 'apply' | 'revert';
    appliedAt: Date;
    description: string;
    ok: number;
    err: number;
    items: ResultItem[];
    mode?: AdjustMode;
    value?: number;
    oldPriceAction?: OldPriceAction;
};

type PriceSnapshot = { price: number; oldPrice: number | null };

type ServerBatchItem = {
    id: string;
    title: string;
    before: PriceSnapshot;
    after: PriceSnapshot;
    state: 'available' | 'reverted' | 'changed';
};

type ServerBatch = {
    requestId: string;
    appliedAt: string;
    adminEmail: string;
    adminName: string | null;
    action: string;
    items: ServerBatchItem[];
    revertState: 'available' | 'partial' | 'reverted' | 'not_available';
};

type PendingAction = { type: 'apply' } | { type: 'revert'; batch: ServerBatch };

const PAGE_SIZE = 100;
const UPDATE_CONCURRENCY = 8;

async function mapWithConcurrency<T, R>(items: T[], worker: (item: T) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length);
    let nextIndex = 0;
    const runners = Array.from({ length: Math.min(UPDATE_CONCURRENCY, items.length) }, async () => {
        while (nextIndex < items.length) {
            const index = nextIndex;
            nextIndex += 1;
            results[index] = await worker(items[index]);
        }
    });
    await Promise.all(runners);
    return results;
}

function formatMoney(v: number) {
    return v.toLocaleString('ru-RU', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcNewPrice(price: number, mode: AdjustMode, value: number): number {
    if (mode === 'percent') return Math.max(0, Math.round((price * (1 + value / 100)) * 100) / 100);
    if (mode === 'fixed_add') return Math.max(0, Math.round((price + value) * 100) / 100);
    return Math.max(0, value);
}

function describeChange(mode: AdjustMode, value: number, oldPriceAction: OldPriceAction): string {
    if (!Number.isFinite(value) && oldPriceAction === 'clear') return 'Убрать зачёркнутую цену';
    const base = mode === 'percent'
        ? `${value > 0 ? '+' : ''}${value}%`
        : mode === 'fixed_add'
            ? `${value > 0 ? '+' : ''}${formatMoney(value)}`
            : `цена = ${formatMoney(value)}`;
    if (oldPriceAction === 'save_current') return `${base}, старая цена зачёркнута`;
    return `${base}, старая цена убрана`;
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
    const [oldPriceAction, setOldPriceAction] = useState<OldPriceAction>('save_current');
    const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
    const [lastResult, setLastResult] = useState<LastResult | null>(null);
    const [serverBatches, setServerBatches] = useState<ServerBatch[]>([]);
    const [actionMessage, setActionMessage] = useState<string | null>(null);

    const refreshBatches = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/products/price-batches');
            const json: { data?: { batches?: ServerBatch[] } } = await res.json();
            setServerBatches(Array.isArray(json.data?.batches) ? json.data.batches : []);
        } catch {
            // History panel is supplementary — the main table still works if this fails.
        }
    }, []);

    useEffect(() => {
        refreshBatches();
    }, [refreshBatches]);

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
    const priceAdjustmentValid = value !== '' && Number.isFinite(numValue);
    const operationValid = priceAdjustmentValid || oldPriceAction === 'clear';
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
        if (!operationValid || !selected.has(p.id)) return null;
        return priceAdjustmentValid ? calcNewPrice(p.price, mode, numValue) : p.price;
    };

    const resetAdjustmentFields = () => {
        setMode('percent');
        setValue('');
        setOldPriceAction('save_current');
    };

    const resetAll = () => {
        resetAdjustmentFields();
        setSelected(new Set());
        snapshots.current.clear();
    };

    const getAllProducts = async (): Promise<Product[]> => {
        const res = await fetch('/api/admin/products');
        if (!res.ok) throw new Error('Не удалось загрузить актуальные данные товаров');
        const json: { data?: { products?: Product[] } } = await res.json();
        return Array.isArray(json.data?.products) ? json.data.products : [];
    };

    const putProduct = async (id: string, revision: number, changes: Record<string, unknown>, batchId: string): Promise<{ status: 'ok' | 'err'; revision: number; error?: string; httpStatus?: number }> => {
        try {
            const res = await fetch('/api/admin/products', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'x-request-id': batchId },
                body: JSON.stringify({ id, revision, changes }),
            });
            const json: { error?: string; data?: { product?: { revision?: number } } } = await res.json().catch(() => ({}));
            if (!res.ok) {
                const error = res.status === 409
                    ? 'Товар уже изменён. Обновите данные и проверьте рассчитанную цену.'
                    : res.status === 400 && json.error === 'invalid_product'
                        ? 'Рассчитанная цена недопустима. Допустимый диапазон: от 0 до 99 999 999,99 €.'
                    : json.error || (res.status >= 500 ? 'Ошибка сервера. Попробуйте ещё раз.' : 'Изменение отклонено сервером.');
                return { status: 'err', revision, error, httpStatus: res.status };
            }
            return { status: 'ok', revision: json.data?.product?.revision ?? revision };
        } catch {
            return { status: 'err', revision, error: 'Нет связи с сервером. Проверьте подключение и попробуйте ещё раз.' };
        }
    };

    const applyChanges = async () => {
        if (!operationValid || selected.size === 0) return;
        setActionMessage(null);
        setPendingAction(null);
        setSaving(true);
        const targets = [...selected]
            .map((id) => snapshots.current.get(id))
            .filter((p): p is Product => p !== undefined);
        const batchId = crypto.randomUUID();
        const items = await mapWithConcurrency(targets, async (p): Promise<ResultItem> => {
                const newPrice = priceAdjustmentValid ? calcNewPrice(p.price, mode, numValue) : p.price;
                const changes: Record<string, unknown> = priceAdjustmentValid ? { price: newPrice } : {};
                if (oldPriceAction === 'save_current') changes.oldPrice = p.price;
                if (oldPriceAction === 'clear') changes.oldPrice = null;
                const result = await putProduct(p.id, p.revision, changes, batchId);
                return { id: p.id, title: p.title, sku: p.sku, oldPrice: p.price, newPrice, ...result };
            });
        setSaving(false);
        const ok = items.filter((i) => i.status === 'ok').length;
        const err = items.length - ok;
        setLastResult({
            kind: 'apply', appliedAt: new Date(), description: describeChange(mode, numValue, oldPriceAction),
            ok, err, items, mode, value: priceAdjustmentValid ? numValue : undefined, oldPriceAction,
        });
        if (ok > 0) await Promise.all([loadPage(page), refreshBatches()]);
        resetAll();
    };

    const performRevert = async (batch: ServerBatch) => {
        setActionMessage(null);
        setPendingAction(null);
        setSaving(true);
        try {
            const res = await fetch(`/api/admin/products/price-batches/${batch.requestId}/revert`, { method: 'POST' });
            const json: { data?: { ok?: number; err?: number; items?: ResultItem[] }; error?: string } = await res.json().catch(() => ({}));
            if (!res.ok) {
                setActionMessage(json.error || 'Не удалось выполнить возврат цен.');
            } else {
                const items = json.data?.items ?? [];
                setLastResult({
                    kind: 'revert', appliedAt: new Date(),
                    description: `Возврат цен: партия от ${new Date(batch.appliedAt).toLocaleString('ru-RU')}`,
                    ok: json.data?.ok ?? 0, err: json.data?.err ?? 0, items,
                });
            }
        } catch {
            setActionMessage('Нет связи с сервером. Проверьте подключение и попробуйте ещё раз.');
        } finally {
            setSaving(false);
            await Promise.all([loadPage(page), refreshBatches()]);
        }
    };

    const prepareFailedRetry = async (result: LastResult) => {
        if (result.kind !== 'apply' || result.mode === undefined) return;
        setSaving(true);
        try {
            const failedIds = new Set(result.items.filter((item) => item.status === 'err').map((item) => item.id));
            const current = (await getAllProducts()).filter((product) => failedIds.has(product.id));
            snapshots.current = new Map(current.map((product) => [product.id, product]));
            setSelected(new Set(current.map((product) => product.id)));
            setMode(result.mode);
            setValue(result.value === undefined ? '' : String(result.value));
            setOldPriceAction(result.oldPriceAction ?? 'save_current');
            await loadPage(page);
            setActionMessage(
                current.length > 0
                    ? `Загружены актуальные данные для ${current.length} товар(ов). Проверьте новые цены в таблице и снова нажмите «Применить».`
                    : 'Не удалось найти товары для повторной проверки. Возможно, они были удалены.'
            );
        } catch (error) {
            setActionMessage(error instanceof Error ? error.message : 'Не удалось загрузить актуальные данные товаров.');
        } finally {
            setSaving(false);
        }
    };

    const MODE_OPTIONS: { value: AdjustMode; label: string; placeholder: string }[] = [
        { value: 'percent', label: '% изменение', placeholder: 'напр. -10 или 5' },
        { value: 'fixed_add', label: 'Добавить сумму', placeholder: 'напр. 50 или -100' },
        { value: 'fixed_set', label: 'Установить цену', placeholder: 'новая цена' },
    ];

    return (
        <AdminGate access="full">
            <div className="flex flex-col gap-6">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">
                        Редактор цен
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
                            <p className="mb-1 block text-xs text-muted-foreground">Старая цена</p>
                            <Select
                                value={oldPriceAction}
                                onValueChange={(next) => {
                                    if (next === 'save_current' || next === 'clear') setOldPriceAction(next);
                                }}
                            >
                                <SelectTrigger className="w-64">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="save_current">Зачеркнуть старую цену</SelectItem>
                                    <SelectItem value="clear">Убрать старую цену</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <p aria-hidden className="mb-1 block text-xs text-transparent">·</p>
                            <button
                                type="button"
                                onClick={() => setPendingAction({ type: 'apply' })}
                                disabled={!operationValid || selected.size === 0 || saving}
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
                                    <DialogTitle>Вернуть предыдущие цены</DialogTitle>
                                    <DialogDescription>
                                        Будет восстановлена цена {pendingAction.batch.items.length} товар(ов) до состояния на {new Date(pendingAction.batch.appliedAt).toLocaleString('ru-RU')}.
                                        Если товар после этой операции уже менялся, автоматический возврат будет безопасно пропущен.
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
                                        Вернуть цены
                                    </button>
                                </DialogFooter>
                            </>
                        ) : (
                            <>
                                <DialogHeader>
                                    <DialogTitle>Подтвердите изменение цены</DialogTitle>
                                    <DialogDescription>
                                        Изменение «{describeChange(mode, numValue, oldPriceAction)}» будет применено к {selected.size} товар{selected.size === 1 ? 'у' : 'ам'} и сразу записано в базу данных. Вернуть прежние цены можно будет из результатов операций ниже.
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

                {lastResult && (
                    <div
                        role="status"
                        className={`rounded-xl border p-4 ${
                            lastResult.err === 0
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
                                : 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100'
                        }`}
                    >
                        <div className="font-semibold">
                            {lastResult.kind === 'apply' ? 'Изменение цен завершено' : 'Возврат цен завершён'}
                        </div>
                        <p className="mt-1 text-sm">
                            Успешно: {lastResult.ok} из {lastResult.items.length}.
                            {lastResult.err > 0 && ` Не удалось: ${lastResult.err}. Причины указаны в результатах операции ниже.`}
                        </p>
                        {lastResult.kind === 'apply' && lastResult.err > 0 && (
                            <button
                                type="button"
                                onClick={() => prepareFailedRetry(lastResult)}
                                disabled={saving}
                                className="mt-3 rounded-md border border-current px-3 py-1.5 text-sm font-medium disabled:opacity-40"
                            >
                                Обновить данные и проверить неудавшиеся товары
                            </button>
                        )}
                        {lastResult.items.some((item) => item.status === 'err') && (
                            <ul className="mt-3 space-y-1 text-xs">
                                {lastResult.items.filter((item) => item.status === 'err').map((item) => (
                                    <li key={item.id}>
                                        <span className="font-medium">{item.title}</span>: {item.error}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                {actionMessage && (
                    <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                        {actionMessage}
                    </div>
                )}

                <div className="order-2 flex flex-wrap items-center gap-3">
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

                <div className="order-2 overflow-x-auto rounded-xl border border-border bg-card">
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
                    <div className="order-2 flex items-center justify-between text-sm text-muted-foreground">
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

                {serverBatches.length > 0 && (
                    <details className="order-1 rounded-xl border border-border bg-card p-4">
                        <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm font-semibold text-foreground">
                            История изменений цен
                            <span className="text-xs font-normal text-muted-foreground">
                                — когда, кто и сколько товаров менял; можно раскрыть операцию и вернуть цены к прежним значениям
                            </span>
                        </summary>
                        <p className="mb-3 mt-3 text-xs text-muted-foreground">
                            Постоянная история из журнала аудита — переживает обновление страницы и доступна с любого устройства.
                        </p>
                        <div className="space-y-2">
                            {serverBatches.map((batch) => {
                                const availableCount = batch.items.filter((item) => item.state === 'available').length;
                                return (
                                    <details key={batch.requestId} className="rounded-lg border border-border">
                                        <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                                            <span className="text-muted-foreground">
                                                {new Date(batch.appliedAt).toLocaleString('ru-RU')}
                                            </span>
                                            <span className="font-medium text-foreground">
                                                {batch.action === 'product.revert' ? 'Возврат' : 'Изменение'} · {batch.items.length} товар(ов) · {batch.adminEmail}
                                            </span>
                                            {batch.revertState === 'reverted' ? (
                                                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                                    цены возвращены
                                                </span>
                                            ) : batch.revertState === 'not_available' ? (
                                                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                                    товары изменены позже — откат недоступен
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setPendingAction({ type: 'revert', batch });
                                                    }}
                                                    disabled={saving}
                                                    className="ml-auto text-xs font-medium text-amber-700 underline hover:no-underline disabled:opacity-40 dark:text-amber-400"
                                                >
                                                    {batch.revertState === 'partial' ? `Вернуть оставшиеся ${availableCount}` : 'Вернуть предыдущие цены'}
                                                </button>
                                            )}
                                        </summary>
                                        <div className="overflow-x-auto border-t border-border">
                                            <table className="w-full text-sm">
                                                <tbody className="divide-y divide-border">
                                                    {batch.items.map((item) => (
                                                        <tr key={item.id}>
                                                            <td className="px-3 py-2 text-foreground">{item.title}</td>
                                                            <td className="px-3 py-2 text-right text-muted-foreground">
                                                                {formatMoney(item.before.price)}
                                                            </td>
                                                            <td className="px-3 py-2 text-right font-medium text-foreground">
                                                                → {formatMoney(item.after.price)}
                                                            </td>
                                                            <td className="px-3 py-2 text-right">
                                                                <span className={
                                                                    item.state === 'reverted'
                                                                        ? 'text-muted-foreground'
                                                                        : item.state === 'available'
                                                                            ? 'text-emerald-600 dark:text-emerald-400'
                                                                            : 'text-amber-600 dark:text-amber-400'
                                                                }>
                                                                    {item.state === 'reverted' ? 'возвращено' : item.state === 'available' ? 'действует' : 'изменено позже'}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </details>
                                );
                            })}
                        </div>
                    </details>
                )}
            </div>
        </AdminGate>
    );
}
