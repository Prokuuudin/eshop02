'use client';

import React from 'react';
import Image from 'next/image';
import { isOrderTaxIncluded } from '@/lib/tax';
import { formatDate, formatEuro } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { logAdminAction } from '@/lib/admin-log-store';
import {
    DELIVERY_LABELS,
    EDIT_DELIVERY_COSTS,
    PAYMENT_COLORS,
    PAYMENT_LABELS,
    STATUS_COLORS,
    STATUS_LABELS,
    STATUS_LIST,
} from './order-config';

import type { useAdminOrdersPage } from './useAdminOrdersPage';

type OrdersState = ReturnType<typeof useAdminOrdersPage>;

export default function OrdersList({ state }: { state: OrdersState }): React.ReactElement {
    const {
            orders,
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
            locale,
            expandedOrder,
            setExpandedOrder,
            selectedIds,
            setInvoiceOrder,
            filtered,
            pageItems,
            toggleSelect,
            editProductResults,
            startEdit,
            cancelEdit,
            saveEdit,
            editUpdateQty,
            editAddProduct,
          } = state;
    return (
        <>
            <div className="space-y-3">
                {pageItems.map((order) => {
                    const status = getOrderStatus(order.id);
                    const isExpanded = expandedOrder === order.id;
                    const payStatus = order.paymentStatus ?? 'unpaid';

                    return (
                        <div
                            key={order.id}
                            className={[
                                'rounded-xl border overflow-hidden transition-colors',
                                selectedIds.has(order.id)
                                    ? 'border-primary/50 dark:border-primary bg-primary/5/40 dark:bg-primary/20/10'
                                    : 'border-border bg-muted',
                            ].join(' ')}
                        >
                            <div className="flex items-start px-5 py-4 hover:bg-black/[.02] dark:hover:bg-white/[.02] transition-colors">
                                <div className="flex items-center pt-1.5 mr-3 shrink-0">
                                    <Checkbox
                                        checked={selectedIds.has(order.id)}
                                        onCheckedChange={() => toggleSelect(order.id)}
                                        onClick={(e) => e.stopPropagation()}
                                        aria-label={`Ð’Ñ‹Ð±Ñ€Ð°Ñ‚ÑŒ Ð·Ð°ÐºÐ°Ð· ${order.id}`}
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                                    aria-expanded={isExpanded}
                                    className="flex-1 text-left flex flex-wrap items-start gap-3"
                                >
                                    <div className="flex-1 min-w-0 space-y-1.5">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-mono text-xs text-gray-400 dark:text-gray-500">
                                                {order.id}
                                            </span>
                                            <span
                                                className={`text-xs rounded-full px-2 py-0.5 font-medium ${STATUS_COLORS[status]}`}
                                            >
                                                {STATUS_LABELS[status]}
                                            </span>
                                            <span
                                                className={`text-xs rounded-full px-2 py-0.5 font-medium ${PAYMENT_COLORS[payStatus]}`}
                                            >
                                                {PAYMENT_LABELS[payStatus]}
                                            </span>
                                            <span className="text-xs rounded-full px-2 py-0.5 bg-muted text-muted-foreground">
                                                {DELIVERY_LABELS[order.deliveryMethod] ??
                                                    order.deliveryMethod}
                                            </span>
                                        </div>
                                        <p className="text-sm text-foreground">
                                            {order.firstName} {order.lastName}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {order.email} Â· {order.phone}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {formatDate(order.createdAt, locale)}
                                        </p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="font-bold text-foreground">
                                            {formatEuro(order.total, locale)}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {order.items.length}{' '}
                                            {order.items.length === 1
                                                ? 'Ñ‚Ð¾Ð²Ð°Ñ€'
                                                : order.items.length < 5
                                                ? 'Ñ‚Ð¾Ð²Ð°Ñ€Ð°'
                                                : 'Ñ‚Ð¾Ð²Ð°Ñ€Ð¾Ð²'}
                                        </p>
                                    </div>
                                </button>
                            </div>

                            {isExpanded && (
                                <div className="border-t border-border px-5 py-5 space-y-5">
                                    {/* Quick actions */}
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                void navigator.clipboard.writeText(order.id)
                                            }
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                        >
                                            Ð¡ÐºÐ¾Ð¿Ð¸Ñ€Ð¾Ð²Ð°Ñ‚ÑŒ ID
                                        </button>
                                        {!['shipped', 'delivered', 'cancelled'].includes(
                                            status
                                        ) && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    editingOrderId === order.id
                                                        ? cancelEdit()
                                                        : startEdit(order)
                                                }
                                                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                                                    editingOrderId === order.id
                                                        ? 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
                                                        : 'border-primary/50 dark:border-primary/50 text-primary dark:text-primary hover:bg-primary/5 dark:hover:bg-primary/10'
                                                }`}
                                            >
                                                {editingOrderId === order.id
                                                    ? 'ÐžÑ‚Ð¼ÐµÐ½Ð¸Ñ‚ÑŒ Ð¿Ñ€Ð°Ð²ÐºÑƒ'
                                                    : 'âœ Ð ÐµÐ´Ð°ÐºÑ‚Ð¸Ñ€Ð¾Ð²Ð°Ñ‚ÑŒ'}
                                            </button>
                                        )}
                                        <a
                                            href={`mailto:${order.email}`}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                        >
                                            ÐÐ°Ð¿Ð¸ÑÐ°Ñ‚ÑŒ ÐºÐ»Ð¸ÐµÐ½Ñ‚Ñƒ
                                        </a>
                                        <button
                                            type="button"
                                            onClick={() => setInvoiceOrder(order)}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 dark:border-primary/50 px-3 py-1.5 text-xs font-medium text-primary dark:text-primary hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors"
                                        >
                                            ðŸ“„ Ð¡Ñ‡Ñ‘Ñ‚
                                        </button>
                                        <a
                                            href={`tel:${order.phone}`}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                        >
                                            ÐŸÐ¾Ð·Ð²Ð¾Ð½Ð¸Ñ‚ÑŒ
                                        </a>
                                    </div>

                                    {/* â”€â”€ EDIT FORM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                                    {editingOrderId === order.id && (
                                        <div className="rounded-xl border-2 border-primary/30 dark:border-primary/50 bg-primary/5/30 dark:bg-primary/20/10 p-4 space-y-5">
                                            <p className="text-sm font-semibold text-primary dark:text-primary/60">
                                                Ð ÐµÐ´Ð°ÐºÑ‚Ð¸Ñ€Ð¾Ð²Ð°Ð½Ð¸Ðµ Ð·Ð°ÐºÐ°Ð·Ð°
                                            </p>

                                            {/* Address */}
                                            <div className="space-y-2">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                                    ÐÐ´Ñ€ÐµÑ Ð´Ð¾ÑÑ‚Ð°Ð²ÐºÐ¸
                                                </p>
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                    <input
                                                        value={editAddress}
                                                        onChange={(e) =>
                                                            setEditAddress(e.target.value)
                                                        }
                                                        placeholder="ÐÐ´Ñ€ÐµÑ"
                                                        className="sm:col-span-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                                    />
                                                    <input
                                                        value={editPostalCode}
                                                        onChange={(e) =>
                                                            setEditPostalCode(e.target.value)
                                                        }
                                                        placeholder="Ð˜Ð½Ð´ÐµÐºÑ"
                                                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                                    />
                                                    <input
                                                        value={editCity}
                                                        onChange={(e) =>
                                                            setEditCity(e.target.value)
                                                        }
                                                        placeholder="Ð“Ð¾Ñ€Ð¾Ð´"
                                                        className="sm:col-span-3 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                                    />
                                                </div>
                                            </div>

                                            {/* Delivery method */}
                                            <div className="space-y-2">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                                    Ð¡Ð¿Ð¾ÑÐ¾Ð± Ð´Ð¾ÑÑ‚Ð°Ð²ÐºÐ¸
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    {(['pickup', 'courier', 'post'] as const).map(
                                                        (dm) => (
                                                            <button
                                                                key={dm}
                                                                type="button"
                                                                onClick={() => setEditDelivery(dm)}
                                                                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                                                                    editDelivery === dm
                                                                        ? 'border-primary/70 bg-primary/10 text-primary dark:border-primary dark:bg-primary/40 dark:text-primary/60'
                                                                        : 'border-border text-muted-foreground hover:border-gray-400'
                                                                }`}
                                                            >
                                                                {DELIVERY_LABELS[dm]}{' '}
                                                                {EDIT_DELIVERY_COSTS[dm] === 0
                                                                    ? '(Ð±ÐµÑÐ¿Ð»Ð°Ñ‚Ð½Ð¾)'
                                                                    : `(â‚¬${EDIT_DELIVERY_COSTS[dm]})`}
                                                            </button>
                                                        )
                                                    )}
                                                </div>
                                            </div>

                                            {/* Items */}
                                            <div className="space-y-2">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                                    ÐŸÐ¾Ð·Ð¸Ñ†Ð¸Ð¸ Ð·Ð°ÐºÐ°Ð·Ð°
                                                </p>
                                                <div className="rounded-lg border border-border divide-y divide-gray-100 dark:divide-gray-800 bg-card">
                                                    {editItems.map((item) => (
                                                        <div
                                                            key={item.lineKey}
                                                            className="flex items-center gap-3 px-3 py-2.5"
                                                        >
                                                            {item.image && (
                                                                <Image
                                                                    unoptimized
                                                                    src={item.image}
                                                                    alt=""
                                                                    width={36}
                                                                    height={36}
                                                                    className="w-9 h-9 rounded object-cover shrink-0"
                                                                />
                                                            )}
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm text-gray-800 dark:text-gray-200 truncate">
                                                                    {item.title}
                                                                </p>
                                                                {item.variantLabel && (
                                                                    <p className="text-xs text-gray-400 truncate">
                                                                        {item.variantLabel}
                                                                    </p>
                                                                )}
                                                            </div>
                                                            <span className="text-xs text-gray-400 shrink-0">
                                                                â‚¬{item.price.toFixed(2)}
                                                            </span>
                                                            <div className="flex items-center gap-1 shrink-0">
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        editUpdateQty(
                                                                            item.lineKey,
                                                                            item.quantity - 1
                                                                        )
                                                                    }
                                                                    className="h-6 w-6 rounded border border-border text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-base leading-none"
                                                                >
                                                                    âˆ’
                                                                </button>
                                                                <span className="w-7 text-center text-sm tabular-nums">
                                                                    {item.quantity}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        editUpdateQty(
                                                                            item.lineKey,
                                                                            item.quantity + 1
                                                                        )
                                                                    }
                                                                    className="h-6 w-6 rounded border border-border text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-base leading-none"
                                                                >
                                                                    +
                                                                </button>
                                                            </div>
                                                            <span className="text-sm font-medium text-foreground w-16 text-right tabular-nums shrink-0">
                                                                â‚¬
                                                                {(
                                                                    item.price * item.quantity
                                                                ).toFixed(2)}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    editUpdateQty(item.lineKey, 0)
                                                                }
                                                                className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 text-lg leading-none shrink-0"
                                                            >
                                                                Ã—
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Add product search */}
                                                <div className="relative">
                                                    <input
                                                        value={editProductSearch}
                                                        onChange={(e) =>
                                                            setEditProductSearch(e.target.value)
                                                        }
                                                        placeholder="Ð”Ð¾Ð±Ð°Ð²Ð¸Ñ‚ÑŒ Ñ‚Ð¾Ð²Ð°Ñ€ (Ð²Ð²ÐµÐ´Ð¸Ñ‚Ðµ Ð½Ð°Ð·Ð²Ð°Ð½Ð¸Ðµ Ð¸Ð»Ð¸ SKU)..."
                                                        className="w-full rounded-lg border border-dashed border-primary/50 dark:border-primary/50 bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-gray-400"
                                                    />
                                                    {editProductResults.length > 0 && (
                                                        <div className="absolute z-30 left-0 right-0 top-full mt-1 rounded-lg border border-border bg-card shadow-xl max-h-60 overflow-y-auto">
                                                            {editProductResults.map((p) => (
                                                                <button
                                                                    key={p.id}
                                                                    type="button"
                                                                    onClick={() =>
                                                                        editAddProduct(p)
                                                                    }
                                                                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-primary/5 dark:hover:bg-primary/10 border-b border-gray-100 dark:border-gray-800 last:border-0"
                                                                >
                                                                    {p.image && (
                                                                        <Image
                                                                            unoptimized
                                                                            src={p.image}
                                                                            alt=""
                                                                            width={32}
                                                                            height={32}
                                                                            className="h-8 w-8 rounded object-cover shrink-0"
                                                                        />
                                                                    )}
                                                                    <div className="min-w-0 flex-1">
                                                                        <p className="text-sm text-foreground truncate">
                                                                            {p.title}
                                                                        </p>
                                                                        <p className="text-xs text-gray-400">
                                                                            {p.brand}
                                                                            {p.sku
                                                                                ? ` Â· ${p.sku}`
                                                                                : ''}
                                                                        </p>
                                                                    </div>
                                                                    <span className="text-sm font-semibold text-foreground shrink-0">
                                                                        â‚¬{p.price.toFixed(2)}
                                                                    </span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Recalculated summary */}
                                            {editItems.length > 0 &&
                                                (() => {
                                                    const newSub = editItems.reduce(
                                                        (s, i) => s + i.price * i.quantity,
                                                        0
                                                    );
                                                    const newDel =
                                                        EDIT_DELIVERY_COSTS[editDelivery] ?? 0;
                                                    const origPct =
                                                        order.subtotal > 0
                                                            ? order.discount / order.subtotal
                                                            : 0;
                                                    const newDisc =
                                                        order.promoCode && origPct > 0
                                                            ? Math.round(newSub * origPct * 100) /
                                                              100
                                                            : order.discount;
                                                    const taxIncluded = isOrderTaxIncluded(order);
                                                    const newTotal = Math.max(
                                                        0,
                                                        newSub -
                                                            newDisc +
                                                            newDel +
                                                            (taxIncluded ? 0 : order.tax)
                                                    );
                                                    return (
                                                        <div className="flex justify-end">
                                                            <div className="text-sm space-y-1 min-w-[220px]">
                                                                <div className="flex justify-between gap-4 text-muted-foreground">
                                                                    <span>Ð¢Ð¾Ð²Ð°Ñ€Ñ‹</span>
                                                                    <span className="tabular-nums">
                                                                        â‚¬{newSub.toFixed(2)}
                                                                    </span>
                                                                </div>
                                                                {newDisc > 0 && (
                                                                    <div className="flex justify-between gap-4 text-emerald-600 dark:text-emerald-400">
                                                                        <span>Ð¡ÐºÐ¸Ð´ÐºÐ°</span>
                                                                        <span className="tabular-nums">
                                                                            âˆ’â‚¬
                                                                            {newDisc.toFixed(2)}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                                <div className="flex justify-between gap-4 text-muted-foreground">
                                                                    <span>Ð”Ð¾ÑÑ‚Ð°Ð²ÐºÐ°</span>
                                                                    <span className="tabular-nums">
                                                                        {newDel === 0
                                                                            ? 'Ð‘ÐµÑÐ¿Ð»Ð°Ñ‚Ð½Ð¾'
                                                                            : `â‚¬${newDel.toFixed(
                                                                                  2
                                                                              )}`}
                                                                    </span>
                                                                </div>
                                                                <div className="flex justify-between gap-4 font-bold text-base text-foreground pt-1 border-t border-border">
                                                                    <span>Ð˜Ñ‚Ð¾Ð³Ð¾</span>
                                                                    <span className="tabular-nums">
                                                                        â‚¬{newTotal.toFixed(2)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}

                                            {/* Save / Cancel */}
                                            <div className="flex gap-2 pt-1">
                                                <button
                                                    type="button"
                                                    disabled={editSaving || editItems.length === 0}
                                                    onClick={() => saveEdit(order)}
                                                    className="rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-40 transition-colors"
                                                >
                                                    {editSaving
                                                        ? 'Ð¡Ð¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ð¸Ðµ...'
                                                        : 'Ð¡Ð¾Ñ…Ñ€Ð°Ð½Ð¸Ñ‚ÑŒ Ð¸Ð·Ð¼ÐµÐ½ÐµÐ½Ð¸Ñ'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={cancelEdit}
                                                    className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                                >
                                                    ÐžÑ‚Ð¼ÐµÐ½Ð°
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Info blocks */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {/* Customer */}
                                        <div className="rounded-lg border border-border p-4 space-y-2">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                                ÐšÐ»Ð¸ÐµÐ½Ñ‚
                                            </p>
                                            <p className="text-sm font-medium text-foreground">
                                                {order.firstName} {order.lastName}
                                            </p>
                                            <a
                                                href={`mailto:${order.email}`}
                                                className="block text-sm text-primary hover:underline truncate"
                                            >
                                                {order.email}
                                            </a>
                                            <a
                                                href={`tel:${order.phone}`}
                                                className="block text-sm text-gray-700 dark:text-gray-300 hover:underline"
                                            >
                                                {order.phone}
                                            </a>
                                        </div>

                                        {/* Delivery */}
                                        <div className="rounded-lg border border-border p-4 space-y-2">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                                Ð”Ð¾ÑÑ‚Ð°Ð²ÐºÐ°
                                            </p>
                                            <p className="text-sm font-medium text-foreground">
                                                {DELIVERY_LABELS[order.deliveryMethod] ??
                                                    order.deliveryMethod}
                                            </p>
                                            <div className="text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
                                                <p>{order.address}</p>
                                                {order.postalCode && (
                                                    <p>Ð˜Ð½Ð´ÐµÐºÑ: {order.postalCode}</p>
                                                )}
                                                <p>{order.city}</p>
                                            </div>
                                        </div>

                                        {/* Payment */}
                                        <div className="rounded-lg border border-border p-4 space-y-2">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                                ÐžÐ¿Ð»Ð°Ñ‚Ð°
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className={`text-xs rounded-full px-2 py-0.5 font-medium ${PAYMENT_COLORS[payStatus]}`}
                                                >
                                                    {PAYMENT_LABELS[payStatus]}
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-700 dark:text-gray-300">
                                                {order.paymentMethod}
                                            </p>
                                            {order.paymentProvider && (
                                                <p className="text-sm text-muted-foreground">
                                                    ÐŸÑ€Ð¾Ð²Ð°Ð¹Ð´ÐµÑ€:{' '}
                                                    <span className="text-foreground font-medium">
                                                        {order.paymentProvider}
                                                    </span>
                                                </p>
                                            )}
                                            {order.paymentSessionId && (
                                                <div className="pt-1 border-t border-gray-100 dark:border-gray-800">
                                                    <p className="text-xs text-muted-foreground mb-0.5">
                                                        Session ID
                                                    </p>
                                                    <p className="font-mono text-xs text-muted-foreground break-all">
                                                        {order.paymentSessionId}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Items */}
                                    <div>
                                        <p className="text-sm font-semibold text-foreground mb-2">
                                            Ð¡Ð¾ÑÑ‚Ð°Ð² Ð·Ð°ÐºÐ°Ð·Ð°
                                        </p>
                                        <div className="rounded-lg border border-border divide-y divide-gray-200 dark:divide-gray-700">
                                            {order.items.map((item) => (
                                                <div
                                                    key={item.lineKey}
                                                    className="flex items-center gap-3 px-3 py-2.5"
                                                >
                                                    {item.image && (
                                                        <Image
                                                            unoptimized
                                                            src={item.image}
                                                            alt={item.title}
                                                            width={40}
                                                            height={40}
                                                            className="w-10 h-10 object-cover rounded-md shrink-0"
                                                        />
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm text-foreground truncate">
                                                            {item.title}
                                                        </p>
                                                        {item.variantLabel && (
                                                            <p className="text-xs text-muted-foreground truncate">
                                                                {item.variantLabel}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <p className="text-xs text-muted-foreground">
                                                            {item.quantity} ÑˆÑ‚ Ã—{' '}
                                                            {formatEuro(item.price, locale)}
                                                        </p>
                                                        <p className="text-sm font-medium text-foreground">
                                                            {formatEuro(
                                                                item.price * item.quantity,
                                                                locale
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Amounts */}
                                    <div className="flex justify-end">
                                        <div className="text-sm space-y-1.5 min-w-[260px]">
                                            <div className="flex justify-between gap-6">
                                                <span className="text-muted-foreground">
                                                    Ð¡ÑƒÐ¼Ð¼Ð° Ð·Ð° Ñ‚Ð¾Ð²Ð°Ñ€Ñ‹
                                                </span>
                                                <span className="text-foreground">
                                                    {formatEuro(order.subtotal, locale)}
                                                </span>
                                            </div>
                                            {order.discount > 0 && (
                                                <div className="flex justify-between gap-6 text-green-700 dark:text-green-400">
                                                    <span>
                                                        Ð¡ÐºÐ¸Ð´ÐºÐ°
                                                        {order.promoCode
                                                            ? ` (${order.promoCode})`
                                                            : ''}
                                                    </span>
                                                    <span>
                                                        âˆ’{formatEuro(order.discount, locale)}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="flex justify-between gap-6">
                                                <span className="text-muted-foreground">
                                                    Ð”Ð¾ÑÑ‚Ð°Ð²ÐºÐ°
                                                </span>
                                                <span className="text-foreground">
                                                    {order.delivery === 0
                                                        ? 'Ð‘ÐµÑÐ¿Ð»Ð°Ñ‚Ð½Ð¾'
                                                        : formatEuro(order.delivery, locale)}
                                                </span>
                                            </div>
                                            {order.tax > 0 && (
                                                <div className="flex justify-between gap-6">
                                                    <span className="text-muted-foreground">
                                                        ÐÐ°Ð»Ð¾Ð³ (ÐÐ”Ð¡)
                                                    </span>
                                                    <span className="text-foreground">
                                                        {formatEuro(order.tax, locale)}
                                                    </span>
                                                </div>
                                            )}
                                            {(order.bonusSpent ?? 0) > 0 && (
                                                <div className="flex justify-between gap-6 text-amber-700 dark:text-amber-400">
                                                    <span>Ð‘Ð¾Ð½ÑƒÑÑ‹ Ð¸ÑÐ¿Ð¾Ð»ÑŒÐ·Ð¾Ð²Ð°Ð½Ñ‹</span>
                                                    <span>âˆ’{order.bonusSpent}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between gap-6 font-bold text-base pt-2 border-t border-border">
                                                <span className="text-foreground">Ð˜Ñ‚Ð¾Ð³Ð¾</span>
                                                <span className="text-foreground">
                                                    {formatEuro(order.total, locale)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between gap-6 text-emerald-700 dark:text-emerald-400 font-medium">
                                                <span>ÐŸÑ€Ð¸Ð±Ñ‹Ð»ÑŒ</span>
                                                <span>
                                                    {formatEuro(
                                                        order.total - order.tax - order.delivery,
                                                        locale
                                                    )}
                                                </span>
                                            </div>
                                            {(order.bonusEarned ?? 0) > 0 && (
                                                <div className="flex justify-between gap-6 text-xs text-amber-600 dark:text-amber-400">
                                                    <span>Ð‘Ð¾Ð½ÑƒÑÐ¾Ð² Ð½Ð°Ñ‡Ð¸ÑÐ»ÐµÐ½Ð¾</span>
                                                    <span>+{order.bonusEarned}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Status management */}
                                    <div className="pt-2 border-t border-border">
                                        <p className="text-sm font-semibold text-foreground mb-2">
                                            Ð˜Ð·Ð¼ÐµÐ½Ð¸Ñ‚ÑŒ ÑÑ‚Ð°Ñ‚ÑƒÑ
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {STATUS_LIST.map((s) => (
                                                <Button
                                                    key={s}
                                                    size="sm"
                                                    variant={status === s ? 'default' : 'outline'}
                                                    className={
                                                        status === s
                                                            ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                                                            : ''
                                                    }
                                                    onClick={() => {
                                                        const prev = getOrderStatus(order.id);
                                                        setOrderStatus(order.id, s);
                                                        return;
                                                        logAdminAction(
                                                            'order.status_changed',
                                                            {
                                                                type: 'order',
                                                                id: order.id,
                                                                title: `${order.firstName} ${order.lastName}`,
                                                            },
                                                            {
                                                                before: { status: prev },
                                                                after: { status: s },
                                                            }
                                                        );
                                                    }}
                                                >
                                                    {STATUS_LABELS[s]}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Manager note */}
                                    <div className="pt-2 border-t border-border">
                                        <p className="text-sm font-semibold text-foreground mb-2">
                                            Ð—Ð°Ð¼ÐµÑ‚ÐºÐ° Ð¼ÐµÐ½ÐµÐ´Ð¶ÐµÑ€Ð°
                                            <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">
                                                â€” ÐºÐ»Ð¸ÐµÐ½Ñ‚ Ð½Ðµ Ð²Ð¸Ð´Ð¸Ñ‚
                                            </span>
                                        </p>
                                        <textarea
                                            rows={3}
                                            value={noteDrafts[order.id] ?? getOrderNote(order.id)}
                                            onChange={(e) =>
                                                setNoteDrafts((prev) => ({
                                                    ...prev,
                                                    [order.id]: e.target.value,
                                                }))
                                            }
                                            placeholder="Ð’Ð½ÑƒÑ‚Ñ€ÐµÐ½Ð½Ð¸Ð¹ ÐºÐ¾Ð¼Ð¼ÐµÐ½Ñ‚Ð°Ñ€Ð¸Ð¹: ÑÑ‚Ð°Ñ‚ÑƒÑ Ð¿ÐµÑ€ÐµÑÑ‹Ð»ÐºÐ¸, Ð´Ð¾Ð³Ð¾Ð²Ð¾Ñ€Ñ‘Ð½Ð½Ð¾ÑÑ‚Ð¸ Ñ ÐºÐ»Ð¸ÐµÐ½Ñ‚Ð¾Ð¼..."
                                            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-gray-400 dark:placeholder:text-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                                        />
                                        <div className="flex items-center gap-3 mt-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={async () => {
                                                    const noteText =
                                                        noteDrafts[order.id] ??
                                                        getOrderNote(order.id);
                                                    if (!(await setOrderNote(order.id, noteText))) return;
                                                    setNoteDrafts((prev) => {
                                                        const n = { ...prev };
                                                        delete n[order.id];
                                                        return n;
                                                    });
                                                    return;
                                                    logAdminAction(
                                                        'order.note_saved',
                                                        {
                                                            type: 'order',
                                                            id: order.id,
                                                            title: `${order.firstName} ${order.lastName}`,
                                                        },
                                                        { details: noteText }
                                                    );
                                                }}
                                                disabled={
                                                    noteDrafts[order.id] === undefined ||
                                                    noteDrafts[order.id] === getOrderNote(order.id)
                                                }
                                            >
                                                Ð¡Ð¾Ñ…Ñ€Ð°Ð½Ð¸Ñ‚ÑŒ Ð·Ð°Ð¼ÐµÑ‚ÐºÑƒ
                                            </Button>
                                            {getOrderNote(order.id) &&
                                                noteDrafts[order.id] === undefined && (
                                                    <span className="text-xs text-gray-400 dark:text-gray-500">
                                                        Ð—Ð°Ð¼ÐµÑ‚ÐºÐ° ÑÐ¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ð°
                                                    </span>
                                                )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {filtered.length === 0 && (
                    <div className="rounded-xl border border-border p-10 bg-muted text-center text-sm text-muted-foreground">
                        {orders.length === 0
                            ? 'Ð—Ð°ÐºÐ°Ð·Ð¾Ð² Ð¿Ð¾ÐºÐ° Ð½ÐµÑ‚'
                            : 'ÐÐµÑ‚ Ð·Ð°ÐºÐ°Ð·Ð¾Ð² Ð¿Ð¾ Ð²Ñ‹Ð±Ñ€Ð°Ð½Ð½Ñ‹Ð¼ Ñ„Ð¸Ð»ÑŒÑ‚Ñ€Ð°Ð¼'}
                    </div>
                )}
            </div>
        </>
    );
}
