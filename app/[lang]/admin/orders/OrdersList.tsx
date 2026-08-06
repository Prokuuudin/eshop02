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
                                        aria-label={`Выбрать заказ ${order.id}`}
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
                                            {order.email} · {order.phone}
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
                                                ? 'товар'
                                                : order.items.length < 5
                                                ? 'товара'
                                                : 'товаров'}
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
                                            Скопировать ID
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
                                                    ? 'Отменить правку'
                                                    : '✏ Редактировать'}
                                            </button>
                                        )}
                                        <a
                                            href={`mailto:${order.email}`}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                        >
                                            Написать клиенту
                                        </a>
                                        <button
                                            type="button"
                                            onClick={() => setInvoiceOrder(order)}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 dark:border-primary/50 px-3 py-1.5 text-xs font-medium text-primary dark:text-primary hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors"
                                        >
                                            📄 Счёт
                                        </button>
                                        <a
                                            href={`tel:${order.phone}`}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                        >
                                            Позвонить
                                        </a>
                                    </div>

                                    {/* ── EDIT FORM ─────────────────────────────────────────── */}
                                    {editingOrderId === order.id && (
                                        <div className="rounded-xl border-2 border-primary/30 dark:border-primary/50 bg-primary/5/30 dark:bg-primary/20/10 p-4 space-y-5">
                                            <p className="text-sm font-semibold text-primary dark:text-primary/60">
                                                Редактирование заказа
                                            </p>

                                            {/* Address */}
                                            <div className="space-y-2">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                                    Адрес доставки
                                                </p>
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                    <input
                                                        value={editAddress}
                                                        onChange={(e) =>
                                                            setEditAddress(e.target.value)
                                                        }
                                                        placeholder="Адрес"
                                                        className="sm:col-span-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                                    />
                                                    <input
                                                        value={editPostalCode}
                                                        onChange={(e) =>
                                                            setEditPostalCode(e.target.value)
                                                        }
                                                        placeholder="Индекс"
                                                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                                    />
                                                    <input
                                                        value={editCity}
                                                        onChange={(e) =>
                                                            setEditCity(e.target.value)
                                                        }
                                                        placeholder="Город"
                                                        className="sm:col-span-3 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                                    />
                                                </div>
                                            </div>

                                            {/* Delivery method */}
                                            <div className="space-y-2">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                                    Способ доставки
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
                                                                    ? '(бесплатно)'
                                                                    : `(€${EDIT_DELIVERY_COSTS[dm]})`}
                                                            </button>
                                                        )
                                                    )}
                                                </div>
                                            </div>

                                            {/* Items */}
                                            <div className="space-y-2">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                                    Позиции заказа
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
                                                                €{item.price.toFixed(2)}
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
                                                                    −
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
                                                                €
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
                                                                ×
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
                                                        placeholder="Добавить товар (введите название или SKU)..."
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
                                                                                ? ` · ${p.sku}`
                                                                                : ''}
                                                                        </p>
                                                                    </div>
                                                                    <span className="text-sm font-semibold text-foreground shrink-0">
                                                                        €{p.price.toFixed(2)}
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
                                                                    <span>Товары</span>
                                                                    <span className="tabular-nums">
                                                                        €{newSub.toFixed(2)}
                                                                    </span>
                                                                </div>
                                                                {newDisc > 0 && (
                                                                    <div className="flex justify-between gap-4 text-emerald-600 dark:text-emerald-400">
                                                                        <span>Скидка</span>
                                                                        <span className="tabular-nums">
                                                                            −€
                                                                            {newDisc.toFixed(2)}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                                <div className="flex justify-between gap-4 text-muted-foreground">
                                                                    <span>Доставка</span>
                                                                    <span className="tabular-nums">
                                                                        {newDel === 0
                                                                            ? 'Бесплатно'
                                                                            : `€${newDel.toFixed(
                                                                                  2
                                                                              )}`}
                                                                    </span>
                                                                </div>
                                                                <div className="flex justify-between gap-4 font-bold text-base text-foreground pt-1 border-t border-border">
                                                                    <span>Итого</span>
                                                                    <span className="tabular-nums">
                                                                        €{newTotal.toFixed(2)}
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
                                                        ? 'Сохранение...'
                                                        : 'Сохранить изменения'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={cancelEdit}
                                                    className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                                >
                                                    Отмена
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Info blocks */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {/* Customer */}
                                        <div className="rounded-lg border border-border p-4 space-y-2">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                                Клиент
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
                                                Доставка
                                            </p>
                                            <p className="text-sm font-medium text-foreground">
                                                {DELIVERY_LABELS[order.deliveryMethod] ??
                                                    order.deliveryMethod}
                                            </p>
                                            <div className="text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
                                                <p>{order.address}</p>
                                                {order.postalCode && (
                                                    <p>Индекс: {order.postalCode}</p>
                                                )}
                                                <p>{order.city}</p>
                                            </div>
                                        </div>

                                        {/* Payment */}
                                        <div className="rounded-lg border border-border p-4 space-y-2">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                                Оплата
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
                                                    Провайдер:{' '}
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
                                            Состав заказа
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
                                                            {item.quantity} шт ×{' '}
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
                                                    Сумма за товары
                                                </span>
                                                <span className="text-foreground">
                                                    {formatEuro(order.subtotal, locale)}
                                                </span>
                                            </div>
                                            {order.discount > 0 && (
                                                <div className="flex justify-between gap-6 text-green-700 dark:text-green-400">
                                                    <span>
                                                        Скидка
                                                        {order.promoCode
                                                            ? ` (${order.promoCode})`
                                                            : ''}
                                                    </span>
                                                    <span>
                                                        −{formatEuro(order.discount, locale)}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="flex justify-between gap-6">
                                                <span className="text-muted-foreground">
                                                    Доставка
                                                </span>
                                                <span className="text-foreground">
                                                    {order.delivery === 0
                                                        ? 'Бесплатно'
                                                        : formatEuro(order.delivery, locale)}
                                                </span>
                                            </div>
                                            {order.tax > 0 && (
                                                <div className="flex justify-between gap-6">
                                                    <span className="text-muted-foreground">
                                                        Налог (НДС)
                                                    </span>
                                                    <span className="text-foreground">
                                                        {formatEuro(order.tax, locale)}
                                                    </span>
                                                </div>
                                            )}
                                            {(order.bonusSpent ?? 0) > 0 && (
                                                <div className="flex justify-between gap-6 text-amber-700 dark:text-amber-400">
                                                    <span>Бонусы использованы</span>
                                                    <span>−{order.bonusSpent}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between gap-6 font-bold text-base pt-2 border-t border-border">
                                                <span className="text-foreground">Итого</span>
                                                <span className="text-foreground">
                                                    {formatEuro(order.total, locale)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between gap-6 text-emerald-700 dark:text-emerald-400 font-medium">
                                                <span>Прибыль</span>
                                                <span>
                                                    {formatEuro(
                                                        order.total - order.tax - order.delivery,
                                                        locale
                                                    )}
                                                </span>
                                            </div>
                                            {(order.bonusEarned ?? 0) > 0 && (
                                                <div className="flex justify-between gap-6 text-xs text-amber-600 dark:text-amber-400">
                                                    <span>Бонусов начислено</span>
                                                    <span>+{order.bonusEarned}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Status management */}
                                    <div className="pt-2 border-t border-border">
                                        <p className="text-sm font-semibold text-foreground mb-2">
                                            Изменить статус
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
                                            Заметка менеджера
                                            <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">
                                                — клиент не видит
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
                                            placeholder="Внутренний комментарий: статус пересылки, договорённости с клиентом..."
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
                                                Сохранить заметку
                                            </Button>
                                            {getOrderNote(order.id) &&
                                                noteDrafts[order.id] === undefined && (
                                                    <span className="text-xs text-gray-400 dark:text-gray-500">
                                                        Заметка сохранена
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
                            ? 'Заказов пока нет'
                            : 'Нет заказов по выбранным фильтрам'}
                    </div>
                )}
            </div>
        </>
    );
}
