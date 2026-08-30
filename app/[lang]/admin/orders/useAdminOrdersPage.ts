'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { type Order } from '@/lib/orders-store';
import { useAdminStore, type OrderStatus } from '@/lib/admin-store';
import { useTranslation } from '@/lib/use-translation';
import { reportAdminError } from '@/lib/admin-ui-errors';
import { ALLOWED_STATUS_TRANSITIONS, ORDERS_PAGE_SIZE, STATUS_LIST, type CatalogProduct, type EditItem, type SortDir, type SortField } from './order-config';
import { buildOrdersQuery, toOrder, type OrdersPageResponse } from './orders-query';
import { useOrdersCsvExport } from './useOrdersCsvExport';
import { addProductToEditItems, findEditProducts, orderToEditItems, updateEditItemQuantity } from './order-edit-model';
import { buildOrdersPrintHtml } from './order-print';

type HydrationStatus = 'idle' | 'loading' | 'loaded' | 'error';

type OrdersStatsResponse = {
    totalOrderCount?: number;
    shippedDeliveredRevenue?: number;
    statusCounts?: Record<OrderStatus, number>;
};

const EMPTY_STATUS_COUNTS: Record<OrderStatus, number> = {
    pending: 0,
    confirmed: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
};

function useAdminOrdersPageState() {
    const { getOrderStatus, setOrderStatus: persistOrderStatus, getOrderNote, setOrderNote: persistOrderNote } = useAdminStore();
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
            setMutationError(
                error instanceof Error ? error.message : l('Не удалось отметить заказ оплаченным', 'Failed to mark the order as paid', 'Neizdevās atzīmēt pasūtījumu kā apmaksātu')
            );
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
            setMutationError(error instanceof Error ? error.message : l('Не удалось изменить статус', 'Failed to change status', 'Neizdevās mainīt statusu'));
        }
    };
    const setOrderNote = async (orderId: string, note: string): Promise<boolean> => {
        setMutationError('');
        try {
            await persistOrderNote(orderId, note);
            return true;
        } catch (error) {
            setMutationError(error instanceof Error ? error.message : l('Не удалось сохранить заметку', 'Failed to save note', 'Neizdevās saglabāt piezīmi'));
            return false;
        }
    };
    const { language } = useTranslation();
    const locale = language === 'ru' ? 'ru-RU' : language === 'lv' ? 'lv-LV' : 'en-US';
    const l = React.useCallback((ru: string, en: string, lv: string) => (language === 'ru' ? ru : language === 'lv' ? lv : en), [language]);
    const STATUS_LABELS: Record<OrderStatus, string> = {
        pending: l('Новый', 'New', 'Jauns'),
        confirmed: l('Подтверждён', 'Confirmed', 'Apstiprināts'),
        shipped: l('Отправлен', 'Shipped', 'Nosūtīts'),
        delivered: l('Доставлен', 'Delivered', 'Piegādāts'),
        cancelled: l('Отменён', 'Cancelled', 'Atcelts'),
    };
    const PAYMENT_LABELS: Record<string, string> = {
        unpaid: l('Не оплачен', 'Unpaid', 'Nav apmaksāts'),
        pending: l('Ожидает оплаты', 'Awaiting payment', 'Gaida apmaksu'),
        paid: l('Оплачен', 'Paid', 'Apmaksāts'),
        refunded: l('Возвращён', 'Refunded', 'Atmaksāts'),
        failed: l('Ошибка оплаты', 'Payment failed', 'Maksājuma kļūda'),
    };
    const DELIVERY_LABELS: Record<string, string> = {
        courier: l('Курьер', 'Courier', 'Kurjers'),
        pickup: l('Самовывоз', 'Pickup', 'Saņemšana veikalā'),
        post: l('Почта (Omniva)', 'Post (Omniva)', 'Pasts (Omniva)'),
        venipak: 'Venipak',
    };

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
            search: debouncedSearch,
            status: statusFilter,
            payment: paymentFilter,
            delivery: deliveryFilter,
            sortField,
            sortDir,
            skip: page * ORDERS_PAGE_SIZE,
            take: ORDERS_PAGE_SIZE,
        });
        fetch(`/api/admin/orders?${qs.toString()}`, {
            signal: controller.signal,
            cache: 'no-store',
        })
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
                reportAdminError(error instanceof Error ? error : new Error('orders_page_load_failed'), l('Заказы', 'Orders', 'Pasūtījumi'));
            });
        return () => controller.abort();
    }, [debouncedSearch, statusFilter, paymentFilter, deliveryFilter, sortField, sortDir, page, pageRefreshTick, l]);

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
            setMutationError(error instanceof Error ? error.message : l('Не удалось изменить статусы', 'Failed to change statuses', 'Neizdevās mainīt statusus'));
        }
    };

    const printSelected = () => {
        const selected = pageItems.filter((o) => selectedIds.has(o.id));
        const win = window.open('', '_blank', 'width=820,height=700');
        if (!win) return;
        win.document.write(buildOrdersPrintHtml({
            orders: selected,
            locale,
            getOrderStatus,
            statusLabels: STATUS_LABELS,
            paymentLabels: PAYMENT_LABELS,
            title: l('Заказы', 'Orders', 'Pasūtījumi'),
            totalLabel: l('Итого', 'Total', 'Kopā'),
        }));
        win.document.close();
        win.focus();
        win.print();
    };

    // ── Edit helpers ─────────────────────────────────────────────────────────

    const editProductResults = useMemo(() => {
        return findEditProducts(catalog, editProductSearch);
    }, [catalog, editProductSearch]);

    const startEdit = (order: Order) => {
        setEditingOrderId(order.id);
        setEditItems(orderToEditItems(order));
        setEditAddress(order.address);
        setEditCity(order.city);
        setEditPostalCode(order.postalCode ?? '');
        setEditDelivery(order.deliveryMethod);
        setEditProductSearch('');
        if (catalog.length === 0) {
            fetch('/api/admin/products')
                .then((r) => r.json())
                .then((d: { data?: { products?: CatalogProduct[] } }) => setCatalog(d.data?.products ?? []))
                .catch((error) => reportAdminError(error, l('Каталог для редактирования заказа', 'Catalog for order editing', 'Katalogs pasūtījuma rediģēšanai')));
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
                    items: editItems.map(({ id, quantity, lineKey, variantLabel }) => ({
                        id,
                        quantity,
                        lineKey,
                        variantLabel,
                    })),
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
            setMutationError(error instanceof Error ? error.message : l('Не удалось сохранить заказ', 'Failed to save order', 'Neizdevās saglabāt pasūtījumu'));
        } finally {
            setEditSaving(false);
        }
    };

    const editUpdateQty = (lineKey: string, qty: number) => {
        setEditItems((prev) => updateEditItemQuantity(prev, lineKey, qty));
    };

    const editAddProduct = (p: CatalogProduct) => {
        setEditItems((prev) => addProductToEditItems(prev, p));
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

    const { exportOrdersCSV, exportCustomersCSV, exportingOrders, exportingCustomers } = useOrdersCsvExport({
        search: debouncedSearch,
        status: statusFilter,
        payment: paymentFilter,
        delivery: deliveryFilter,
        sortField,
        sortDir,
        locale,
        l,
        getOrderStatus,
        statusLabels: STATUS_LABELS,
        paymentLabels: PAYMENT_LABELS,
        deliveryLabels: DELIVERY_LABELS,
        onError: setMutationError,
    });

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
    return useAdminOrdersPageState();
}
