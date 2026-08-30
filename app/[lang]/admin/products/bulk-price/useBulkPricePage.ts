'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminLocale } from '@/lib/use-admin-locale';
import {
    PAGE_SIZE, calcNewPrice, describeChange, mapWithConcurrency,
    type AdjustMode, type LastResult, type OldPriceAction, type PendingAction,
    type Product, type ResultItem, type ServerBatch,
} from './bulk-price-model';

function useBulkPricePageState() {
    const { locale, l } = useAdminLocale();
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
    const [historyOpen, setHistoryOpen] = useState(false);
    const [expandedBatchIds, setExpandedBatchIds] = useState<Set<string>>(new Set());

    const toggleBatch = (requestId: string) => {
        setExpandedBatchIds((prev) => {
            const next = new Set(prev);
            if (next.has(requestId)) next.delete(requestId); else next.add(requestId);
            return next;
        });
    };

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
        queueMicrotask(() => void refreshBatches());
    }, [refreshBatches]);

    useEffect(() => {
        const id = setTimeout(() => setSearch(searchInput.trim()), 300);
        return () => clearTimeout(id);
    }, [searchInput]);

    useEffect(() => {
        queueMicrotask(() => setPage(1));
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
        queueMicrotask(() => void loadPage(page));
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
        if (!res.ok) throw new Error(l('Не удалось загрузить актуальные данные товаров', 'Failed to load current product data', 'Neizdevās ielādēt aktuālos produktu datus'));
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
                    ? l('Товар уже изменён. Обновите данные и проверьте рассчитанную цену.', 'The product has already changed. Refresh the data and verify the calculated price.', 'Produkts jau ir mainīts. Atjauniniet datus un pārbaudiet aprēķināto cenu.')
                    : res.status === 400 && json.error === 'invalid_product'
                        ? l('Рассчитанная цена недопустима. Допустимый диапазон: от 0 до 99 999 999,99 €.', 'The calculated price is invalid. Allowed range: €0 to €99,999,999.99.', 'Aprēķinātā cena nav derīga. Atļautais diapazons: no 0 līdz 99 999 999,99 €.')
                    : json.error || (res.status >= 500 ? l('Ошибка сервера. Попробуйте ещё раз.', 'Server error. Try again.', 'Servera kļūda. Mēģiniet vēlreiz.') : l('Изменение отклонено сервером.', 'The change was rejected by the server.', 'Serveris noraidīja izmaiņu.'));
                return { status: 'err', revision, error, httpStatus: res.status };
            }
            return { status: 'ok', revision: json.data?.product?.revision ?? revision };
        } catch {
            return { status: 'err', revision, error: l('Нет связи с сервером. Проверьте подключение и попробуйте ещё раз.', 'Cannot reach the server. Check your connection and try again.', 'Nav savienojuma ar serveri. Pārbaudiet savienojumu un mēģiniet vēlreiz.') };
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
            kind: 'apply', appliedAt: new Date(), description: describeChange(mode, numValue, oldPriceAction, locale, l),
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
                setActionMessage(json.error || l('Не удалось выполнить возврат цен.', 'Failed to revert prices.', 'Neizdevās atjaunot cenas.'));
            } else {
                const items = json.data?.items ?? [];
                setLastResult({
                    kind: 'revert', appliedAt: new Date(),
                    description: l(`Возврат цен: партия от ${new Date(batch.appliedAt).toLocaleString(locale)}`, `Price revert: batch from ${new Date(batch.appliedAt).toLocaleString(locale)}`, `Cenu atjaunošana: partija no ${new Date(batch.appliedAt).toLocaleString(locale)}`),
                    ok: json.data?.ok ?? 0, err: json.data?.err ?? 0, items,
                });
            }
        } catch {
            setActionMessage(l('Нет связи с сервером. Проверьте подключение и попробуйте ещё раз.', 'Cannot reach the server. Check your connection and try again.', 'Nav savienojuma ar serveri. Pārbaudiet savienojumu un mēģiniet vēlreiz.'));
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
                    : l('Не удалось найти товары для повторной проверки. Возможно, они были удалены.', 'Products for rechecking could not be found. They may have been deleted.', 'Atkārtotai pārbaudei produkti netika atrasti. Iespējams, tie ir dzēsti.')
            );
        } catch (error) {
            setActionMessage(error instanceof Error ? error.message : l('Не удалось загрузить актуальные данные товаров.', 'Failed to load current product data.', 'Neizdevās ielādēt aktuālos produktu datus.'));
        } finally {
            setSaving(false);
        }
    };

    const MODE_OPTIONS: { value: AdjustMode; label: string; placeholder: string }[] = [
        { value: 'percent', label: l('% изменение', '% change', '% izmaiņa'), placeholder: l('напр. -10 или 5', 'e.g. -10 or 5', 'piem., -10 vai 5') },
        { value: 'fixed_add', label: l('Добавить сумму', 'Add amount', 'Pievienot summu'), placeholder: l('напр. 50 или -100', 'e.g. 50 or -100', 'piem., 50 vai -100') },
        { value: 'fixed_set', label: l('Установить цену', 'Set price', 'Iestatīt cenu'), placeholder: l('новая цена', 'new price', 'jaunā cena') },
    ];


    return {
        locale,
        l,
        products,
        setProducts,
        total,
        setTotal,
        page,
        setPage,
        loading,
        setLoading,
        saving,
        setSaving,
        selected,
        setSelected,
        snapshots,
        searchInput,
        setSearchInput,
        search,
        setSearch,
        catFilter,
        setCatFilter,
        mode,
        setMode,
        value,
        setValue,
        oldPriceAction,
        setOldPriceAction,
        pendingAction,
        setPendingAction,
        lastResult,
        setLastResult,
        serverBatches,
        setServerBatches,
        actionMessage,
        setActionMessage,
        historyOpen,
        setHistoryOpen,
        expandedBatchIds,
        setExpandedBatchIds,
        toggleBatch,
        refreshBatches,
        buildParams,
        loadPage,
        numValue,
        priceAdjustmentValid,
        operationValid,
        totalPages,
        toggle,
        clearSelection,
        preview,
        resetAdjustmentFields,
        resetAll,
        getAllProducts,
        putProduct,
        applyChanges,
        performRevert,
        prepareFailedRetry,
        MODE_OPTIONS,
    };
}

export function useBulkPricePage(): ReturnType<typeof useBulkPricePageState> {
    return useBulkPricePageState();
}

