'use client';

import React from 'react';
import Image from 'next/image';
import { formatDate, formatEuro } from '@/lib/utils';
import { pointsToEuros } from '@/lib/bonus-program';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { PAYMENT_COLORS, STATUS_COLORS, availableOrderStatuses } from './order-config';

import type { useAdminOrdersPage } from './useAdminOrdersPage';
import { OrderEditForm } from './OrderEditForm';
import { formatOrderAddressLatvian } from '@/lib/order-address';
import { useAdminLocale } from '@/lib/use-admin-locale';
import type { OrderStatus } from '@/lib/admin-store';

type OrdersState = ReturnType<typeof useAdminOrdersPage>;
type Order = OrdersState['pageItems'][number];

export function OrderListItem({ order, state }: { order: Order; state: OrdersState }): React.ReactElement {
    const { l } = useAdminLocale();
    const STATUS_LABELS: Record<OrderStatus, string> = {
        pending: l('Новый', 'New', 'Jauns'), confirmed: l('Подтверждён', 'Confirmed', 'Apstiprināts'),
        shipped: l('Отправлен', 'Shipped', 'Nosūtīts'), delivered: l('Доставлен', 'Delivered', 'Piegādāts'),
        cancelled: l('Отменён', 'Cancelled', 'Atcelts'),
    };
    const PAYMENT_LABELS: Record<string, string> = {
        unpaid: l('Не оплачен', 'Unpaid', 'Nav apmaksāts'), pending: l('Ожидает оплаты', 'Awaiting payment', 'Gaida apmaksu'),
        paid: l('Оплачен', 'Paid', 'Apmaksāts'), refunded: l('Возвращён', 'Refunded', 'Atmaksāts'),
        failed: l('Ошибка оплаты', 'Payment failed', 'Maksājuma kļūda'),
    };
    const DELIVERY_LABELS: Record<string, string> = {
        courier: l('Курьер', 'Courier', 'Kurjers'), pickup: l('Самовывоз', 'Pickup', 'Saņemšana veikalā'),
        post: l('Почта (Omniva)', 'Parcel terminal (Omniva)', 'Pakomāts (Omniva)'), venipak: 'Venipak',
    };
    const {
      getOrderStatus, setOrderStatus, getOrderNote, setOrderNote, noteDrafts, setNoteDrafts,
      editingOrderId, locale, expandedOrder, setExpandedOrder, selectedIds, setInvoiceOrder,
      toggleSelect, startEdit, cancelEdit,
      paymentSavingIds, markOrderPaid,
    } = state;

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
                                        aria-label={l(`Выбрать заказ ${order.id}`, `Select order ${order.id}`, `Atlasīt pasūtījumu ${order.id}`)}
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
                                            <span className="font-mono text-xs text-muted-foreground">
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
                                            {l('товаров', 'items', 'preces')}
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
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                        >
                                            {l('Скопировать ID', 'Copy ID', 'Kopēt ID')}
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
                                                    ? l('Отменить правку', 'Cancel editing', 'Atcelt rediģēšanu')
                                                    : `✏ ${l('Редактировать', 'Edit', 'Rediģēt')}`}
                                            </button>
                                        )}
                                        <a
                                            href={`mailto:${order.email}`}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                        >
                                            {l('Написать клиенту', 'Email customer', 'Rakstīt klientam')}
                                        </a>
                                        <button
                                            type="button"
                                            onClick={() => setInvoiceOrder(order)}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 dark:border-primary/50 px-3 py-1.5 text-xs font-medium text-primary dark:text-primary hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors"
                                        >
                                            📄 {l('Счёт', 'Invoice', 'Rēķins')}
                                        </button>
                                        <a
                                            href={`tel:${order.phone}`}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                        >
                                            {l('Позвонить', 'Call', 'Zvanīt')}
                                        </a>
                                    </div>

                                    <OrderEditForm order={order} state={state} />

                                    {/* Info blocks */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {/* Customer */}
                                        <div className="rounded-lg border border-border p-4 space-y-2">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                {l('Клиент', 'Customer', 'Klients')}
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
                                                className="block text-sm text-foreground hover:underline"
                                            >
                                                {order.phone}
                                            </a>
                                        </div>

                                        {/* Delivery */}
                                        <div className="rounded-lg border border-border p-4 space-y-2">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                {l('Доставка', 'Delivery', 'Piegāde')}
                                            </p>
                                            <p className="text-sm font-medium text-foreground">
                                                {DELIVERY_LABELS[order.deliveryMethod] ??
                                                    order.deliveryMethod}
                                            </p>
                                            <div className="text-sm text-foreground space-y-0.5">
                                                <p>{formatOrderAddressLatvian(order)}</p>
                                            </div>
                                        </div>

                                        {/* Payment */}
                                        <div className="rounded-lg border border-border p-4 space-y-2">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                {l('Оплата', 'Payment', 'Apmaksa')}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className={`text-xs rounded-full px-2 py-0.5 font-medium ${PAYMENT_COLORS[payStatus]}`}
                                                >
                                                    {PAYMENT_LABELS[payStatus]}
                                                </span>
                                            </div>
                                            <p className="text-sm text-foreground">
                                                {order.paymentMethod}
                                            </p>
                                            {order.paymentProvider && (
                                                <p className="text-sm text-muted-foreground">
                                                    {l('Провайдер:', 'Provider:', 'Pakalpojuma sniedzējs:')}{' '}
                                                    <span className="text-foreground font-medium">
                                                        {order.paymentProvider}
                                                    </span>
                                                </p>
                                            )}
                                            {order.paymentSessionId && (
                                                <div className="pt-1 border-t border-border">
                                                    <p className="text-xs text-muted-foreground mb-0.5">
                                                        Session ID
                                                    </p>
                                                    <p className="font-mono text-xs text-muted-foreground break-all">
                                                        {order.paymentSessionId}
                                                    </p>
                                                </div>
                                            )}
                                            {payStatus !== 'paid' && (
                                                <Button
                                                    size="sm"
                                                    className="w-full"
                                                    disabled={paymentSavingIds.has(order.id)}
                                                    onClick={() => markOrderPaid(order.id)}
                                                >
                                                    {paymentSavingIds.has(order.id) ? l('Сохранение…', 'Saving…', 'Saglabā…') : l('Отметить оплаченным', 'Mark as paid', 'Atzīmēt kā apmaksātu')}
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Items */}
                                    <div>
                                        <p className="text-sm font-semibold text-foreground mb-2">
                                            {l('Состав заказа', 'Order contents', 'Pasūtījuma saturs')}
                                        </p>
                                        <div className="rounded-lg border border-border divide-y divide-border">
                                            {order.items.map((item, index) => (
                                                <div
                                                    key={item.lineKey || `legacy:${order.id}:${index}`}
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
                                                            {item.quantity} {l('шт', 'pcs', 'gab.')} ×{' '}
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
                                                    {l('Сумма за товары', 'Product subtotal', 'Preču starpsumma')}
                                                </span>
                                                <span className="text-foreground">
                                                    {formatEuro(order.subtotal, locale)}
                                                </span>
                                            </div>
                                            {order.discount > 0 && (
                                                <div className="flex justify-between gap-6 text-green-700 dark:text-green-400">
                                                    <span>
                                                        {l('Скидка', 'Discount', 'Atlaide')}
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
                                                    {l('Доставка', 'Delivery', 'Piegāde')}
                                                </span>
                                                <span className="text-foreground">
                                                    {order.delivery === 0
                                                        ? l('Бесплатно', 'Free', 'Bez maksas')
                                                        : formatEuro(order.delivery, locale)}
                                                </span>
                                            </div>
                                            {order.tax > 0 && (
                                                <div className="flex justify-between gap-6">
                                                    <span className="text-muted-foreground">
                                                        {l('Налог (НДС)', 'Tax (VAT)', 'Nodoklis (PVN)')}
                                                    </span>
                                                    <span className="text-foreground">
                                                        {formatEuro(order.tax, locale)}
                                                    </span>
                                                </div>
                                            )}
                                            {(order.bonusSpent ?? 0) > 0 && (
                                                <div className="flex justify-between gap-6 text-amber-700 dark:text-amber-400">
                                                    <span>{l('Бонусы использованы', 'Bonuses used', 'Izmantotie bonusi')}</span>
                                                    <span>
                                                        −{order.bonusSpent}
                                                        {' '}({formatEuro(pointsToEuros(order.bonusSpent ?? 0), locale)})
                                                    </span>
                                                </div>
                                            )}
                                            <div className="flex justify-between gap-6 font-bold text-base pt-2 border-t border-border">
                                                <span className="text-foreground">{l('Итого', 'Total', 'Kopā')}</span>
                                                <span className="text-foreground">
                                                    {formatEuro(order.total, locale)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between gap-6 text-emerald-700 dark:text-emerald-400 font-medium">
                                                <span>{l('Прибыль', 'Profit', 'Peļņa')}</span>
                                                <span>
                                                    {formatEuro(
                                                        order.total - order.tax - order.delivery,
                                                        locale
                                                    )}
                                                </span>
                                            </div>
                                            {(order.bonusEarned ?? 0) > 0 && (
                                                <div className="flex justify-between gap-6 text-xs text-amber-600 dark:text-amber-400">
                                                    <span>{l('Бонусов начислено', 'Bonuses earned', 'Piešķirtie bonusi')}</span>
                                                    <span>
                                                        +{order.bonusEarned}
                                                        {' '}({formatEuro(pointsToEuros(order.bonusEarned ?? 0), locale)})
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Status management */}
                                    <div className="pt-2 border-t border-border">
                                        <p className="text-sm font-semibold text-foreground mb-2">
                                            {l('Изменить статус', 'Change status', 'Mainīt statusu')}
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {availableOrderStatuses(status).map((s) => (
                                                <Button
                                                    key={s}
                                                    size="sm"
                                                    variant={status === s ? 'default' : 'outline'}
                                                    className={
                                                        status === s
                                                            ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                                                            : ''
                                                    }
                                                    onClick={() => void setOrderStatus(order.id, s)}
                                                    disabled={status === s}
                                                >
                                                    {STATUS_LABELS[s]}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Manager note */}
                                    <div className="pt-2 border-t border-border">
                                        <p className="text-sm font-semibold text-foreground mb-2">
                                            {l('Заметка менеджера', 'Manager note', 'Vadītāja piezīme')}
                                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                                                {l('— клиент не видит', '— hidden from customer', '— klients neredz')}
                                            </span>
                                        </p>
                                        <Textarea
                                            rows={3}
                                            value={noteDrafts[order.id] ?? getOrderNote(order.id)}
                                            onChange={(e) =>
                                                setNoteDrafts((prev) => ({
                                                    ...prev,
                                                    [order.id]: e.target.value,
                                                }))
                                            }
                                            placeholder={l('Внутренний комментарий: статус пересылки, договорённости с клиентом...', 'Internal comment: shipping status, customer arrangements...', 'Iekšējs komentārs: nosūtīšanas statuss, vienošanās ar klientu...')}
                                            className="w-full resize-none text-sm"
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
                                                }}
                                                disabled={
                                                    noteDrafts[order.id] === undefined ||
                                                    noteDrafts[order.id] === getOrderNote(order.id)
                                                }
                                            >
                                                {l('Сохранить заметку', 'Save note', 'Saglabāt piezīmi')}
                                            </Button>
                                            {getOrderNote(order.id) &&
                                                noteDrafts[order.id] === undefined && (
                                                    <span className="text-xs text-muted-foreground">
                                                        {l('Заметка сохранена', 'Note saved', 'Piezīme saglabāta')}
                                                    </span>
                                                )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );

}

