'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { type Order } from '@/lib/orders-store';
import { useAdminStore, type OrderStatus } from '@/lib/admin-store';
import { formatEuro } from '@/lib/utils';
import { useTranslation } from '@/lib/use-translation';
import { reportAdminError } from '@/lib/admin-ui-errors';
import {
    DELIVERY_LABELS,
    ALLOWED_STATUS_TRANSITIONS,
    ORDERS_PAGE_SIZE,
    PAYMENT_LABELS,
    STATUS_LABELS,
    STATUS_LIST,
    type CatalogProduct,
    type EditItem,
    type SortDir,
    type SortField,
} from './order-config';

type HydrationStatus = 'idle' | 'loading' | 'loaded' | 'error';

type RawOrder = Omit<Order, 'createdAt'> & { createdAt: string };

type OrdersPageResponse = {
    orders?: RawOrder[];
    total?: number;
};

type OrdersStatsResponse = {
    totalOrderCount?: number;
    shippedDeliveredRevenue?: number;
    statusCounts?: Record<OrderStatus, number>;
};

const EMPTY_STATUS_COUNTS: Record<OrderStatus, number> = {
    pending: 0, confirmed: 0, shipped: 0, delivered: 0, cancelled: 0,
};

function buildOrdersQuery(params: {
    search: string; status: OrderStatus | 'all'; payment: string; delivery: string;
    sortField: SortField; sortDir: SortDir; skip?: number; take?: number;
}): URLSearchParams {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.status !== 'all') qs.set('status', params.status);
    if (params.payment !== 'all') qs.set('payment', params.payment);
    if (params.delivery !== 'all') qs.set('deliveryMethod', params.delivery);
    qs.set('sort', params.sortField === 'total' ? 'total' : 'date');
    qs.set('dir', params.sortDir);
    if (params.skip != null) qs.set('skip', String(params.skip));
    if (params.take != null) qs.set('take', String(params.take));
    return qs;
}

function toOrder(row: RawOrder): Order {
    return { ...row, createdAt: new Date(row.createdAt) };
}

function useAdminOrdersPageState() {
    const { getOrderStatus, setOrderStatus: persistOrderStatus, getOrderNote, setOrderNote: persistOrderNote } =
        useAdminStore();
    const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

    // ── Edit mode ─────────────────────────────────────────────────────────────
    const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
    const [editItems, setEditItems] = useState<EditItem[]>([]);
    const [editAddress, setEditAddress] = useState('');
    const [editCity, setEditCity] = useState('');
    const [editPostalCode, setEditPostalCode] = useState('');
    const [editDelivery, setEditDelivery] = useState<string>('pickup');
    const [editProductSearch, setEditProductSearch] = useState('');
    const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
    const [editSaving, setEditSaving] = useState(false);
    const [mutationError, setMutationError] = useState('');
    const [paymentSavingIds, setPaymentSavingIds] = useState<Set<string>>(new Set());

    // Patches one row in the currently-loaded page in place - the equivalent
    // of the old global-store upsert, but scoped to what's actually on screen
    // since orders are no longer synced wholesale into a client-side store.
    const patchPageItem = (order: Order): void => {
        setPageItems((prev) => prev.map((o) => (o.id === order.id ? order : o)));
    };

    const markOrderPaid = async (orderId: string): Promise<void> => {
        setMutationError('');
        setPaymentSavingIds((prev) => new Set(prev).add(orderId));
        try {
            const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paymentStatus: 'paid', paymentProvider: 'manual' }),
            });
            const payload = await res.json().catch(() => null);
            if (!res.ok) throw new Error(payload?.error ?? 'payment_update_failed');
            patchPageItem(payload.order as Order);
        } catch (error) {
            setMutationError(error instanceof Error ? error.message : 'Не удалось отметить заказ оплаченным');
        } finally {
            setPaymentSavingIds((prev) => {
                const next = new Set(prev);
                next.delete(orderId);
                return next;
            });
        }
    };
    const setOrderStatus = async (orderId: string, status: OrderStatus): Promise<void> => {
        setMutationError('');
        try {
            await persistOrderStatus(orderId, status);
            setStatsRefreshTick((t) => t + 1);
            setPageRefreshTick((t) => t + 1);
        } catch (error) {
            setMutationError(error instanceof Error ? error.message : 'Не удалось изменить статус');
        }
    };
    const setOrderNote = async (orderId: string, note: string): Promise<boolean> => {
        setMutationError('');
        try {
            await persistOrderNote(orderId, note);
            return true;
        } catch (error) {
            setMutationError(error instanceof Error ? error.message : 'Не удалось сохранить заметку');
            return false;
        }
    };
    const { language } = useTranslation();
    const locale = language === 'ru' ? 'ru-RU' : language === 'lv' ? 'lv-LV' : 'en-US';

    const searchParams = useSearchParams();
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        const q = searchParams.get('q');
        if (q) queueMicrotask(() => setSearch(q));
    }, [searchParams]);

    // Debounce the free-text search before it drives a network request - every
    // other filter fires immediately since those are discrete picks, not typing.
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
        return () => clearTimeout(t);
    }, [search]);

    const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
    const [paymentFilter, setPaymentFilter] = useState('all');
    const [deliveryFilter, setDeliveryFilter] = useState('all');
    const [sortField, setSortField] = useState<SortField>('date');
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [invoiceOrder, setInvoiceOrder] = useState<Order | null>(null);
    const [bulkStatus, setBulkStatus] = useState<OrderStatus | ''>('');
    const [page, setPageState] = useState(0);

    // ── Order rows: one server-paginated page at a time, not the whole table ──
    const [pageItems, setPageItems] = useState<Order[]>([]);
    const [filteredCount, setFilteredCount] = useState(0);
    // Starts 'loading' (a fetch always fires on mount) and is only ever
    // updated from the fetch's own callbacks afterwards - a filter/page change
    // just swaps in fresh rows once they arrive rather than flashing back to
    // a loading state, since the previous page's rows are still valid to show
    // meanwhile.
    const [hydrationStatus, setHydrationStatus] = useState<HydrationStatus>('loading');
    const [pageRefreshTick, setPageRefreshTick] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        const qs = buildOrdersQuery({
            search: debouncedSearch, status: statusFilter, payment: paymentFilter, delivery: deliveryFilter,
            sortField, sortDir, skip: page * ORDERS_PAGE_SIZE, take: ORDERS_PAGE_SIZE,
        });
        fetch(`/api/admin/orders?${qs.toString()}`, { signal: controller.signal, cache: 'no-store' })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`status_${res.status}`))))
            .then((data: OrdersPageResponse) => {
                const rows = (data.orders ?? []).map(toOrder);
                setPageItems(rows);
                setFilteredCount(data.total ?? rows.length);
                setHydrationStatus('loaded');
                void useAdminStore.getState().loadOrderMeta(rows.map((o) => o.id));
            })
            .catch((error) => {
                if (error instanceof Error && error.name === 'AbortError') return;
                setPageItems([]);
                setFilteredCount(0);
                setHydrationStatus('error');
                reportAdminError(error instanceof Error ? error : new Error('orders_page_load_failed'), 'Заказы');
            });
        return () => controller.abort();
    }, [debouncedSearch, statusFilter, paymentFilter, deliveryFilter, sortField, sortDir, page, pageRefreshTick]);

    // ── Global stats (independent of which page is currently shown) ──────────
    const [statsByStatus, setStatsByStatus] = useState<Record<OrderStatus, number>>(EMPTY_STATUS_COUNTS);
    const [totalRevenue, setTotalRevenue] = useState(0);
    const [totalOrderCount, setTotalOrderCount] = useState(0);
    const [statsRefreshTick, setStatsRefreshTick] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        fetch('/api/admin/orders/stats', { signal: controller.signal, cache: 'no-store' })
            .then((res) => (res.ok ? res.json() : null))
            .then((data: OrdersStatsResponse | null) => {
                if (!data) return;
                setTotalOrderCount(data.totalOrderCount ?? 0);
                setTotalRevenue(data.shippedDeliveredRevenue ?? 0);
                if (data.statusCounts) setStatsByStatus({ ...EMPTY_STATUS_COUNTS, ...data.statusCounts });
            })
            .catch(() => {});
        return () => controller.abort();
    }, [statsRefreshTick]);

    // Reset page when filters change
    React.useEffect(() => {
        queueMicrotask(() => {
            setPageState(0);
            setSelectedIds(new Set());
            setBulkStatus('');
        });
    }, [debouncedSearch, statusFilter, paymentFilter, deliveryFilter, sortField, sortDir]);

    const setPage: React.Dispatch<React.SetStateAction<number>> = (nextPage) => {
        setPageState(nextPage);
        setSelectedIds(new Set());
        setBulkStatus('');
    };

    const totalPages = Math.max(1, Math.ceil(filteredCount / ORDERS_PAGE_SIZE));

    const unhandledCount = statsByStatus.pending + statsByStatus.confirmed;

    const isAllSelected = pageItems.length > 0 && pageItems.every((o) => selectedIds.has(o.id));
    const isSomeSelected = pageItems.some((o) => selectedIds.has(o.id));
    const availableBulkStatuses = STATUS_LIST.filter((candidate) =>
        Array.from(selectedIds).every((id) => {
            const current = getOrderStatus(id);
            return current === candidate || ALLOWED_STATUS_TRANSITIONS[current].includes(candidate);
        })
    );

    const toggleSelect = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (isAllSelected) {
            setSelectedIds((prev) => {
                const next = new Set(prev);
                pageItems.forEach((order) => next.delete(order.id));
                return next;
            });
        } else {
            setSelectedIds((prev) => {
                const next = new Set(prev);
                pageItems.forEach((order) => next.add(order.id));
                return next;
            });
        }
    };

    const applyBulkStatus = async () => {
        if (!bulkStatus || !availableBulkStatuses.includes(bulkStatus)) return;
        const ids = Array.from(selectedIds);
        setMutationError('');
        try {
            const res = await fetch('/api/admin/order-meta/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderIds: ids, status: bulkStatus }),
            });
            const payload = await res.json().catch(() => null);
            if (!res.ok) throw new Error(payload?.error ?? 'bulk_status_failed');
            useAdminStore.setState((state) => ({
                orderStatuses: {
                    ...state.orderStatuses,
                    ...Object.fromEntries(ids.map((id) => [id, bulkStatus as OrderStatus])),
                },
            }));
            setSelectedIds(new Set());
            setBulkStatus('');
            setStatsRefreshTick((t) => t + 1);
            setPageRefreshTick((t) => t + 1);
        } catch (error) {
            setMutationError(error instanceof Error ? error.message : 'Не удалось изменить статусы');
        }
    };

    const printSelected = () => {
        const escapeHtml = (s: string): string =>
            s.replace(
                /[&<>"']/g,
                (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)
            );
        const selected = pageItems.filter((o) => selectedIds.has(o.id));
        const rows = selected
            .map((order) => {
                const status = getOrderStatus(order.id);
                const payStatus = order.paymentStatus ?? 'unpaid';
                const items = order.items
                    .map(
                        (item) =>
                            `<div style="display:flex;justify-content:space-between;font-size:12px;margin:3px 0">
          <span>${escapeHtml(item.title)}${
                                item.variantLabel
                                    ? ` <span style="color:#6b7280">(${escapeHtml(
                                          item.variantLabel
                                      )})</span>`
                                    : ''
                            } × ${item.quantity}</span>
          <span>${formatEuro(item.price * item.quantity, locale)}</span>
        </div>`
                    )
                    .join('');
                return `<div style="margin-bottom:20px;padding:16px;border:1px solid #e5e7eb;border-radius:8px;page-break-inside:avoid">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-family:monospace;font-size:11px;color:#6b7280">${escapeHtml(
              order.id
          )}</span>
          <div style="display:flex;gap:8px">
            <span style="font-size:12px;font-weight:600">${STATUS_LABELS[status]}</span>
            <span style="font-size:12px;color:#6b7280">${PAYMENT_LABELS[payStatus]}</span>
          </div>
        </div>
        <p style="margin:2px 0;font-size:14px;font-weight:600">${escapeHtml(
            order.firstName
        )} ${escapeHtml(order.lastName)}</p>
        <p style="margin:2px 0;font-size:12px;color:#374151">${escapeHtml(
            order.email
        )} · ${escapeHtml(order.phone)}</p>
        <p style="margin:2px 0;font-size:12px;color:#374151">${escapeHtml(
            order.address
        )}, ${escapeHtml(order.city)}${
                    order.postalCode ? ', ' + escapeHtml(order.postalCode) : ''
                }</p>
        <p style="margin:2px 0 8px;font-size:11px;color:#9ca3af">${new Date(
            order.createdAt
        ).toLocaleDateString('ru-RU')}</p>
        <hr style="margin:8px 0;border:none;border-top:1px solid #e5e7eb"/>
        ${items}
        <hr style="margin:8px 0;border:none;border-top:1px solid #e5e7eb"/>
        <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px">
          <span>Итого</span><span>${formatEuro(order.total, locale)}</span>
        </div>
      </div>`;
            })
            .join('');

        const win = window.open('', '_blank', 'width=820,height=700');
        if (!win) return;
        win.document.write(`<!DOCTYPE html><html><head><title>Заказы</title>
      <style>body{font-family:sans-serif;padding:20px;max-width:760px;margin:0 auto}@media print{body{padding:0}}</style>
      </head><body>${rows}</body></html>`);
        win.document.close();
        win.focus();
        win.print();
    };

    // ── Edit helpers ─────────────────────────────────────────────────────────

    const editProductResults = useMemo(() => {
        const q = editProductSearch.trim().toLowerCase();
        if (!q || q.length < 2) return [];
        return catalog
            .filter(
                (p) =>
                    p.title.toLowerCase().includes(q) ||
                    p.brand.toLowerCase().includes(q) ||
                    (p.sku ?? '').toLowerCase().includes(q)
            )
            .slice(0, 8);
    }, [catalog, editProductSearch]);

    const startEdit = (order: Order) => {
        setEditingOrderId(order.id);
        setEditItems(
            order.items.map((i, index) => ({
                id: i.id,
                // Legacy imported orders predate lineKey. Give every row a stable,
                // unique identity so duplicate products can be edited independently.
                lineKey: i.lineKey || `legacy:${order.id}:${index}`,
                title: i.title,
                price: i.price,
                quantity: i.quantity,
                image: i.image,
                variantLabel: i.variantLabel,
            }))
        );
        setEditAddress(order.address);
        setEditCity(order.city);
        setEditPostalCode(order.postalCode ?? '');
        setEditDelivery(order.deliveryMethod);
        setEditProductSearch('');
        if (catalog.length === 0) {
            fetch('/api/admin/products')
                .then((r) => r.json())
                .then((d: { data?: { products?: CatalogProduct[] } }) =>
                    setCatalog(d.data?.products ?? [])
                )
                .catch((error) => reportAdminError(error, 'Каталог для редактирования заказа'));
        }
    };

    const cancelEdit = () => {
        setEditingOrderId(null);
        setEditProductSearch('');
    };

    const saveEdit = async (order: Order) => {
        setEditSaving(true);
        setMutationError('');
        try {
            const res = await fetch('/api/admin/orders', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: order.id,
                    items: editItems.map(({ id, quantity, lineKey, variantLabel }) => ({ id, quantity, lineKey, variantLabel })),
                    address: editAddress.trim() || order.address,
                    city: editCity.trim() || order.city,
                    postalCode: editPostalCode.trim() || undefined,
                    deliveryMethod: editDelivery,
                }),
            });
            const payload = await res.json().catch(() => null);
            if (!res.ok) throw new Error(payload?.message ?? payload?.error ?? 'order_update_failed');
            patchPageItem(payload.order as Order);
            setEditingOrderId(null);
            setEditProductSearch('');
        } catch (error) {
            setMutationError(error instanceof Error ? error.message : 'Не удалось сохранить заказ');
        } finally {
            setEditSaving(false);
        }
    };

    const editUpdateQty = (lineKey: string, qty: number) => {
        if (qty <= 0) {
            setEditItems((prev) => prev.filter((i) => i.lineKey !== lineKey));
        } else {
            setEditItems((prev) =>
                prev.map((i) => (i.lineKey === lineKey ? { ...i, quantity: qty } : i))
            );
        }
    };

    const editAddProduct = (p: CatalogProduct) => {
        setEditItems((prev) => {
            const existing = prev.find((i) => i.lineKey === p.id);
            if (existing)
                return prev.map((i) =>
                    i.lineKey === p.id ? { ...i, quantity: i.quantity + 1 } : i
                );
            return [
                ...prev,
                {
                    id: p.id,
                    lineKey: p.id,
                    title: p.title,
                    price: p.price,
                    quantity: 1,
                    image: p.image,
                },
            ];
        });
        setEditProductSearch('');
    };

    const toggleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDir('desc');
        }
    };

    const downloadCSV = (rows: string[][], filename: string) => {
        const content = rows
            .map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
            .join('\n');
        const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const csvDate = () => new Date().toISOString().slice(0, 10);

    // CSV export needs every row matching the current filters, not just the
    // visible page - fetched only when the export button is actually clicked
    // (not on page load), scoped by the same filter querystring as the table.
    const [exportingOrders, setExportingOrders] = useState(false);
    const [exportingCustomers, setExportingCustomers] = useState(false);

    const fetchAllMatchingOrders = async (): Promise<Order[]> => {
        const all: Order[] = [];
        let skip = 0;
        const take = 200;
        for (;;) {
            const qs = buildOrdersQuery({
                search: debouncedSearch, status: statusFilter, payment: paymentFilter, delivery: deliveryFilter,
                sortField, sortDir, skip, take,
            });
            const res = await fetch(`/api/admin/orders?${qs.toString()}`, { cache: 'no-store' });
            if (!res.ok) throw new Error(`export_fetch_failed:${res.status}`);
            const data = (await res.json()) as OrdersPageResponse;
            const rows = (data.orders ?? []).map(toOrder);
            all.push(...rows);
            const total = data.total ?? all.length;
            if (all.length >= total || rows.length < take) return all;
            skip += rows.length;
        }
    };

    const exportOrdersCSV = async () => {
        setExportingOrders(true);
        try {
            const all = await fetchAllMatchingOrders();
            const header = [
                'ID', 'Дата', 'Имя', 'Фамилия', 'Email', 'Телефон', 'Статус', 'Оплата',
                'Доставка', 'Адрес', 'Город', 'Индекс', 'Товары', 'Сумма',
            ];
            const rows = all.map((o) => {
                const status = getOrderStatus(o.id);
                return [
                    o.id,
                    new Date(o.createdAt).toLocaleDateString('ru-RU'),
                    o.firstName,
                    o.lastName,
                    o.email,
                    o.phone,
                    STATUS_LABELS[status],
                    PAYMENT_LABELS[o.paymentStatus ?? 'unpaid'],
                    DELIVERY_LABELS[o.deliveryMethod] ?? o.deliveryMethod,
                    o.address,
                    o.city,
                    o.postalCode ?? '',
                    o.items.map((i) => `${i.title} ×${i.quantity}`).join('; '),
                    o.total.toFixed(2),
                ];
            });
            downloadCSV([header, ...rows], `orders-${csvDate()}.csv`);
        } catch (error) {
            setMutationError(error instanceof Error ? error.message : 'Не удалось выгрузить заказы');
        } finally {
            setExportingOrders(false);
        }
    };

    const exportCustomersCSV = async () => {
        setExportingCustomers(true);
        try {
            const all = await fetchAllMatchingOrders();
            const seen = new Set<string>();
            const header = ['Имя', 'Фамилия', 'Email', 'Телефон', 'Город', 'Заказов', 'Сумма (€)'];
            const rows: string[][] = [];
            all.forEach((o) => {
                if (seen.has(o.email)) return;
                seen.add(o.email);
                const customerOrders = all.filter((x) => x.email === o.email);
                const spent = customerOrders.reduce((s, x) => s + x.total, 0);
                rows.push([
                    o.firstName, o.lastName, o.email, o.phone, o.city,
                    String(customerOrders.length), spent.toFixed(2),
                ]);
            });
            downloadCSV([header, ...rows], `customers-${csvDate()}.csv`);
        } catch (error) {
            setMutationError(error instanceof Error ? error.message : 'Не удалось выгрузить клиентов');
        } finally {
            setExportingCustomers(false);
        }
    };

    return {
        hydrationStatus,
        getOrderStatus,
        setOrderStatus,
        getOrderNote,
        setOrderNote,
        noteDrafts,
        setNoteDrafts,
        editingOrderId,
        editItems,
        editAddress,
        setEditAddress,
        editCity,
        setEditCity,
        editPostalCode,
        setEditPostalCode,
        editDelivery,
        setEditDelivery,
        editProductSearch,
        setEditProductSearch,
        editSaving,
        mutationError,
        paymentSavingIds,
        markOrderPaid,
        language,
        locale,
        search,
        setSearch,
        statusFilter,
        setStatusFilter,
        paymentFilter,
        setPaymentFilter,
        deliveryFilter,
        setDeliveryFilter,
        sortField,
        sortDir,
        expandedOrder,
        setExpandedOrder,
        selectedIds,
        setSelectedIds,
        invoiceOrder,
        setInvoiceOrder,
        bulkStatus,
        setBulkStatus,
        availableBulkStatuses,
        page,
        setPage,
        statsByStatus,
        totalRevenue,
        totalOrderCount,
        filteredCount,
        totalPages,
        pageItems,
        unhandledCount,
        isAllSelected,
        isSomeSelected,
        toggleSelect,
        toggleSelectAll,
        applyBulkStatus,
        printSelected,
        editProductResults,
        startEdit,
        cancelEdit,
        saveEdit,
        editUpdateQty,
        editAddProduct,
        toggleSort,
        exportOrdersCSV,
        exportCustomersCSV,
        exportingOrders,
        exportingCustomers,
    };
}

export function useAdminOrdersPage(): ReturnType<typeof useAdminOrdersPageState> {
  return useAdminOrdersPageState()
}
