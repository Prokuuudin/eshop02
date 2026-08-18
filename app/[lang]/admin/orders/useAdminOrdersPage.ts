'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useOrders } from '@/lib/orders-store';
import { useAdminOrdersSync } from '@/lib/use-admin-orders-sync';
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

function useAdminOrdersPageState() {
    // Refresh on every visit: order status, notes and repaired legacy snapshot
    // titles must not remain stale in the session-wide Zustand store.
    useAdminOrdersSync({ refreshIfLoaded: true });
    const { orders, upsertOrder, hydrationStatus } = useOrders();
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
    const setOrderStatus = async (orderId: string, status: OrderStatus): Promise<void> => {
        setMutationError('');
        try {
            await persistOrderStatus(orderId, status);
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

    useEffect(() => {
        const q = searchParams.get('q');
        if (q) queueMicrotask(() => setSearch(q));
    }, [searchParams]);
    const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
    const [paymentFilter, setPaymentFilter] = useState('all');
    const [deliveryFilter, setDeliveryFilter] = useState('all');
    const [sortField, setSortField] = useState<SortField>('date');
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [invoiceOrder, setInvoiceOrder] = useState<import('@/lib/orders-store').Order | null>(
        null
    );
    const [bulkStatus, setBulkStatus] = useState<OrderStatus | ''>('');
    const [page, setPageState] = useState(0);

    const statsByStatus = useMemo(() => {
        return STATUS_LIST.reduce((acc, s) => {
            acc[s] = orders.filter((o) => getOrderStatus(o.id) === s).length;
            return acc;
        }, {} as Record<OrderStatus, number>);
    }, [orders, getOrderStatus]);

    const totalRevenue = useMemo(
        () => orders.reduce((sum, order) => {
            const status = getOrderStatus(order.id);
            return status === 'shipped' || status === 'delivered' ? sum + order.total : sum;
        }, 0),
        [orders, getOrderStatus]
    );

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        const result = orders.filter((order) => {
            const matchSearch =
                !q ||
                order.id.toLowerCase().includes(q) ||
                order.firstName.toLowerCase().includes(q) ||
                order.lastName.toLowerCase().includes(q) ||
                order.email.toLowerCase().includes(q) ||
                order.phone.toLowerCase().includes(q);

            const orderStatus = getOrderStatus(order.id);
            const matchStatus = statusFilter === 'all' || orderStatus === statusFilter;
            const matchPayment =
                paymentFilter === 'all' || (order.paymentStatus ?? 'unpaid') === paymentFilter;
            const matchDelivery =
                deliveryFilter === 'all' || order.deliveryMethod === deliveryFilter;

            return matchSearch && matchStatus && matchPayment && matchDelivery;
        });

        result.sort((a, b) => {
            if (sortField === 'date') {
                const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                return sortDir === 'asc' ? diff : -diff;
            }
            const diff = a.total - b.total;
            return sortDir === 'asc' ? diff : -diff;
        });

        return result;
    }, [
        orders,
        search,
        statusFilter,
        paymentFilter,
        deliveryFilter,
        sortField,
        sortDir,
        getOrderStatus,
    ]);

    // Reset page when filters change
    React.useEffect(() => {
        queueMicrotask(() => {
            setPageState(0);
            setSelectedIds(new Set());
            setBulkStatus('');
        });
    }, [search, statusFilter, paymentFilter, deliveryFilter, sortField, sortDir]);

    const setPage: React.Dispatch<React.SetStateAction<number>> = (nextPage) => {
        setPageState(nextPage);
        setSelectedIds(new Set());
        setBulkStatus('');
    };

    const totalPages = Math.max(1, Math.ceil(filtered.length / ORDERS_PAGE_SIZE));
    const pageItems = filtered.slice(page * ORDERS_PAGE_SIZE, (page + 1) * ORDERS_PAGE_SIZE);

    const unhandledCount = useMemo(
        () => orders.filter((o) => ['pending', 'confirmed'].includes(getOrderStatus(o.id))).length,
        [orders, getOrderStatus]
    );

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
        const selected = orders.filter((o) => selectedIds.has(o.id));
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

    const startEdit = (order: (typeof orders)[number]) => {
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

    const saveEdit = async (order: (typeof orders)[number]) => {
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
            upsertOrder(payload.order as import('@/lib/orders-store').Order);
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

    const exportOrdersCSV = () => {
        const header = [
            'ID',
            'Дата',
            'Имя',
            'Фамилия',
            'Email',
            'Телефон',
            'Статус',
            'Оплата',
            'Доставка',
            'Адрес',
            'Город',
            'Индекс',
            'Товары',
            'Сумма',
        ];
        const rows = filtered.map((o) => {
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
    };

    const exportCustomersCSV = () => {
        const seen = new Set<string>();
        const header = [
            'Имя',
            'Фамилия',
            'Email',
            'Телефон',
            'Город',
            'Заказов',
            'Сумма (€)',
        ];
        const rows: string[][] = [];
        filtered.forEach((o) => {
            if (seen.has(o.email)) return;
            seen.add(o.email);
            const customerOrders = filtered.filter((x) => x.email === o.email);
            const spent = customerOrders.reduce((s, x) => s + x.total, 0);
            rows.push([
                o.firstName,
                o.lastName,
                o.email,
                o.phone,
                o.city,
                String(customerOrders.length),
                spent.toFixed(2),
            ]);
        });
        downloadCSV([header, ...rows], `customers-${csvDate()}.csv`);
    };

    return {
        orders,
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
        filtered,
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
    };
}

export function useAdminOrdersPage(): ReturnType<typeof useAdminOrdersPageState> {
  return useAdminOrdersPageState()
}
