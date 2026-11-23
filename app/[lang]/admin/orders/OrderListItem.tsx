'use client';
import { Hint } from '@/components/ui/tooltip';
import { useTranslation } from '@/lib/use-translation';
import { acceptedDeliveryMethodIds, DELIVERY_METHOD_LABEL_KEYS } from '@/lib/delivery';

import React from 'react';
import Image from 'next/image';
import { formatDate, formatEuro } from '@/lib/utils';
import { pointsToEuros } from '@/lib/bonus-program';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { PAYMENT_COLORS, STATUS_COLORS, STATUS_SURFACES, availableOrderStatuses } from './order-config';

import type { useAdminOrdersPage } from './useAdminOrdersPage';
import { OrderEditForm } from './OrderEditForm';
import { formatOrderAddressLatvian } from '@/lib/order-address';
import { getOrderDeliveryDestination } from '@/lib/order-delivery-destination';
import { useAdminLocale } from '@/lib/use-admin-locale';
import { localizeVariantLabel } from '@/lib/variant-group-label';
import type { OrderStatus } from '@/lib/admin-store';
import { OrderQuickActions } from './OrderQuickActions';
import { useToast } from '@/lib/toast-context';
import { StockAcknowledgment } from './StockAcknowledgment';
import { Check, Copy, MessageSquareText } from 'lucide-react';

type OrdersState = ReturnType<typeof useAdminOrdersPage>;
type Order = OrdersState['pageItems'][number];

export function OrderListItem({ order, state }: { order: Order; state: OrdersState }): React.ReactElement {
    const { t, language } = useTranslation();
    const { l } = useAdminLocale();
    const { showToast } = useToast();
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
    const DELIVERY_LABELS = Object.fromEntries(acceptedDeliveryMethodIds.map(id => [id, t(DELIVERY_METHOD_LABEL_KEYS[id])]));
    const PAYMENT_METHOD_LABELS: Record<string, string> = {
        bank: l('Банковский перевод', 'Bank transfer', 'Bankas pārskaitījums'),
        cash: l('Оплата при получении', 'Cash on delivery', 'Skaidra nauda saņemot'),
        card: l('Банковская карта', 'Bank card', 'Bankas karte'),
        paysera: l('Онлайн-оплата (Paysera)', 'Online payment (Paysera)', 'Tiešsaistes apmaksa (Paysera)'),
        paypal: l('Онлайн-оплата (PayPal)', 'Online payment (PayPal)', 'Tiešsaistes apmaksa (PayPal)'),
    };
    const PROVIDER_LABELS: Record<string, string> = {
        manual: l('Вручную', 'Manual', 'Manuāli'),
        paysera: 'Paysera',
        paypal: 'PayPal',
    };
    const {
      getOrderStatus, setOrderStatus, getOrderNote, setOrderNote, noteDrafts, setNoteDrafts,
      locale, expandedOrders, toggleExpanded, selectedIds, toggleSelect,
      paymentSavingIds, markOrderPaid, statusSavingIds, recordFullRefund, retryBonusShortfall,
    } = state;

                    const status = getOrderStatus(order.id);
                    const isExpanded = expandedOrders.has(order.id);
                    const payStatus = order.paymentStatus ?? 'unpaid';
                    const isStatusSaving = statusSavingIds.has(order.id);
                    const destination = getOrderDeliveryDestination(order);
                    const customerComment = order.customerComment?.trim();
                    const rowRef = React.useRef<HTMLDivElement>(null);
                    const [emailCopied, setEmailCopied] = React.useState(false);
                    const [refundFormOpen, setRefundFormOpen] = React.useState(false);
                    const [refundConfirmed, setRefundConfirmed] = React.useState(false);
                    const [refundReason, setRefundReason] = React.useState('');
                    const bonusShortfall = order.bonusShortfall?.shortfallPoints ? order.bonusShortfall : null;
                    const closeRefundForm = () => { setRefundFormOpen(false); setRefundConfirmed(false); setRefundReason(''); };
                    const emailCopiedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
                    React.useEffect(() => () => {
                        if (emailCopiedTimer.current) clearTimeout(emailCopiedTimer.current);
                    }, []);

                    const handleCopyEmail = () => {
                        if (!navigator.clipboard) {
                            showToast(l('Копирование недоступно в этом окружении', 'Copying unavailable in this environment', 'Kopēšana nav pieejama šajā vidē'), 'error');
                            return;
                        }
                        navigator.clipboard.writeText(order.email)
                            .then(() => {
                                setEmailCopied(true);
                                if (emailCopiedTimer.current) clearTimeout(emailCopiedTimer.current);
                                emailCopiedTimer.current = setTimeout(() => setEmailCopied(false), 1500);
                            })
                            .catch(() => showToast(l('Не удалось скопировать email', 'Failed to copy email', 'Neizdevās nokopēt e-pastu'), 'error'));
                    };

                    React.useEffect(() => {
                        if (!isExpanded || !rowRef.current) return;
                        // Sticky header's real height varies (AdminHeaderNav wraps on narrow
                        // viewports), so a fixed scroll-margin would misjudge it — measure it.
                        const headerHeight = document.querySelector('header')?.getBoundingClientRect().height ?? 0;
                        const rect = rowRef.current.getBoundingClientRect();
                        const targetTop = window.scrollY + rect.top - headerHeight - 12;
                        window.scrollTo({ top: Math.max(targetTop, 0), behavior: 'smooth' });
                    }, [isExpanded]);

                    return (
                        <div
                            key={order.id}
                            ref={rowRef}
                            className={[
                                'overflow-hidden rounded-xl border border-l-4 transition-colors shadow-sm',
                                selectedIds.has(order.id)
                                    ? 'border-primary/60 bg-primary/10 ring-1 ring-primary/20 dark:border-primary dark:bg-primary/15'
                                    : `border-border ${STATUS_SURFACES[status]}`,
                            ].join(' ')}
                        >
                            <div className="flex items-center px-4 py-2.5 hover:bg-black/[.02] dark:hover:bg-white/[.02] transition-colors">
                                <div className="mr-3 flex shrink-0 items-center">
                                    <Checkbox
                                        checked={selectedIds.has(order.id)}
                                        onCheckedChange={() => toggleSelect(order.id)}
                                        onClick={(e) => e.stopPropagation()}
                                        aria-label={l(`Выбрать заказ ${order.id}`, `Select order ${order.id}`, `Atlasīt pasūtījumu ${order.id}`)}
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => toggleExpanded(order.id)}
                                    aria-expanded={isExpanded}
                                    // Scrolls the whole order card itself (effect above).
                                    data-disclosure-autoscroll="off"
                                    className="flex flex-1 flex-wrap items-center gap-3 text-left"
                                >
                                    <div className="min-w-0 flex-1 space-y-1">
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
                                            {customerComment && (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                                                    <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
                                                    {l('Комментарий покупателя', 'Customer comment', 'Klienta komentārs')}
                                                </span>
                                            )}
                                            {order.operationalExceptions?.some((exception) => exception.code === 'late_payment_stock_unavailable') && (
                                                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950 dark:text-red-200">
                                                    {l('Оплата получена — товара недостаточно', 'Payment received — stock unavailable', 'Maksājums saņemts — prece nav pieejama')}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                            <span className="text-sm font-medium text-foreground">
                                                {order.firstName} {order.lastName}
                                            </span>
                                            <span>{order.email} · {order.phone}</span>
                                            <span>{formatDate(order.createdAt, locale)}</span>
                                        </div>
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
                                <div className="border-t border-border px-4 py-4 space-y-3">
                                    {customerComment && (
                                        <section className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-50" aria-labelledby={`customer-comment-${order.id}`}>
                                            <h3 id={`customer-comment-${order.id}`} className="flex items-center gap-2 text-sm font-bold">
                                                <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                                                {l('Комментарий покупателя', 'Customer comment', 'Klienta komentārs')}
                                            </h3>
                                            <p className="mt-2 whitespace-pre-wrap break-words text-sm">{customerComment}</p>
                                        </section>
                                    )}
                                    <OrderQuickActions order={order} state={state} status={status} />

                                    <StockAcknowledgment orderId={order.id} />

                                    <OrderEditForm order={order} state={state} />

                                    {/* Info blocks */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        {/* Customer */}
                                        <div className="rounded-lg border border-border bg-card p-3 space-y-1">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                {l('Клиент', 'Customer', 'Klients')}
                                            </p>
                                            <p className="text-sm font-medium text-foreground">
                                                {order.firstName} {order.lastName}
                                            </p>
                                            <div className="flex min-w-0 items-center gap-1">
                                                <a
                                                    href={`mailto:${order.email}`}
                                                    className="min-w-0 truncate text-sm text-primary hover:underline"
                                                >
                                                    {order.email}
                                                </a>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                                                    aria-label={l('Скопировать email', 'Copy email', 'Kopēt e-pastu')}
                                                    title={l('Скопировать email', 'Copy email', 'Kopēt e-pastu')}
                                                    onClick={handleCopyEmail}
                                                >
                                                    {emailCopied
                                                        ? <Check className="h-4 w-4 text-green-600 dark:text-green-400" aria-hidden="true" />
                                                        : <Copy className="h-4 w-4" aria-hidden="true" />}
                                                </Button>
                                                <span aria-live="polite" className="shrink-0 text-xs font-medium text-green-600 dark:text-green-400">
                                                    {emailCopied ? l('Скопировано', 'Copied', 'Nokopēts') : ''}
                                                </span>
                                            </div>
                                            <a
                                                href={`tel:${order.phone}`}
                                                className="block text-sm text-foreground hover:underline"
                                            >
                                                {order.phone}
                                            </a>
                                        </div>

                                        {/* Delivery */}
                                        <div className="rounded-lg border border-border bg-card p-3 space-y-1">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                {l('Доставка', 'Delivery', 'Piegāde')}
                                            </p>
                                            <p className="text-sm font-medium text-foreground">
                                                {DELIVERY_LABELS[order.deliveryMethod] ??
                                                    order.deliveryMethod}
                                            </p>
                                            <div className="text-sm text-foreground space-y-0.5">
                                                <p>{formatOrderAddressLatvian(order)}{order.country && order.country !== 'LV' ? `, ${order.country}` : ''}</p>
                                                {destination && <>
                                                    <p className="font-medium">{destination.carrier ? `${destination.carrier.toUpperCase()} — ${destination.name}` : t(`stores.${destination.name}.name`)}</p>
                                                    <p>{destination.address}, {destination.city}{destination.postalCode ? `, ${destination.postalCode}` : ''}</p>
                                                </>}
                                            </div>
                                        </div>

                                        {/* Payment */}
                                        <div className="rounded-lg border border-border bg-card p-3 space-y-1">
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
                                                {PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}
                                            </p>
                                            {order.paymentProvider && (
                                                <p className="text-sm text-muted-foreground">
                                                    {l('Провайдер:', 'Provider:', 'Pakalpojuma sniedzējs:')}{' '}
                                                    <span className="text-foreground font-medium">
                                                        {PROVIDER_LABELS[order.paymentProvider] ?? order.paymentProvider}
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
                                            {payStatus !== 'paid' && payStatus !== 'refunded' && (
                                                <Button
                                                    size="sm"
                                                    className="w-full"
                                                    disabled={paymentSavingIds.has(order.id)}
                                                    onClick={() => markOrderPaid(order.id)}
                                                >
                                                    {paymentSavingIds.has(order.id) ? l('Сохранение…', 'Saving…', 'Saglabā…') : l('Отметить оплаченным', 'Mark as paid', 'Atzīmēt kā apmaksātu')}
                                                </Button>
                                            )}
                                            {bonusShortfall && (
                                                <div role="alert" className="mt-1 space-y-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                                                    <p>
                                                        {l(
                                                            `Не удалось удержать ${bonusShortfall.shortfallPoints} бонусных баллов: на балансе клиента ${bonusShortfall.availablePoints}. Частичного списания не было.`,
                                                            `${bonusShortfall.shortfallPoints} bonus points could not be taken back: the customer has ${bonusShortfall.availablePoints}. Nothing was taken partially.`,
                                                            `Neizdevās noņemt ${bonusShortfall.shortfallPoints} bonusa punktus: klientam ir ${bonusShortfall.availablePoints}. Daļēja norakstīšana netika veikta.`
                                                        )}
                                                    </p>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="w-full"
                                                        disabled={paymentSavingIds.has(order.id)}
                                                        onClick={() => void retryBonusShortfall(order.id)}
                                                    >
                                                        {l('Повторить удержание', 'Retry deduction', 'Atkārtot norakstīšanu')}
                                                    </Button>
                                                </div>
                                            )}
                                            {payStatus === 'paid' && !refundFormOpen && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="w-full"
                                                    onClick={() => setRefundFormOpen(true)}
                                                >
                                                    {l('Зафиксировать полный возврат', 'Record full refund', 'Reģistrēt pilnu atmaksu')}
                                                </Button>
                                            )}
                                            {payStatus === 'paid' && refundFormOpen && (
                                                <div className="mt-1 space-y-2 rounded-md border border-border p-2">
                                                    <p className="text-xs text-muted-foreground">
                                                        {l(
                                                            'Действие не переводит деньги. Сначала верните всю сумму в Paysera или банке. Начисленные за заказ баллы будут отозваны, списанные — возвращены.',
                                                            'This action does not move money. Return the full amount in Paysera or the bank first. Points earned for the order are revoked and spent points are returned.',
                                                            'Šī darbība nepārskaita naudu. Vispirms atmaksājiet visu summu Paysera vai bankā. Par pasūtījumu piešķirtie punkti tiks atsaukti, izmantotie — atgriezti.'
                                                        )}
                                                    </p>
                                                    <label className="flex items-start gap-2 text-xs text-foreground">
                                                        <Checkbox
                                                            checked={refundConfirmed}
                                                            onCheckedChange={(checked) => setRefundConfirmed(checked === true)}
                                                        />
                                                        <span>{l('Подтверждаю: вся сумма уже возвращена клиенту', 'I confirm the full amount has already been returned to the customer', 'Apstiprinu: visa summa klientam jau ir atmaksāta')}</span>
                                                    </label>
                                                    <Textarea
                                                        value={refundReason}
                                                        onChange={(event) => setRefundReason(event.target.value)}
                                                        rows={2}
                                                        maxLength={1000}
                                                        placeholder={l('Как и когда возвращены деньги (мин. 10 символов)', 'How and when the money was returned (min. 10 characters)', 'Kā un kad nauda atmaksāta (min. 10 rakstzīmes)')}
                                                        aria-label={l('Основание возврата', 'Refund reason', 'Atmaksas pamatojums')}
                                                    />
                                                    <div className="flex gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="destructive"
                                                            className="flex-1"
                                                            disabled={!refundConfirmed || refundReason.trim().length < 10 || paymentSavingIds.has(order.id)}
                                                            onClick={async () => {
                                                                if (await recordFullRefund(order.id, refundReason.trim())) closeRefundForm();
                                                            }}
                                                        >
                                                            {l('Зафиксировать возврат', 'Record refund', 'Reģistrēt atmaksu')}
                                                        </Button>
                                                        <Button size="sm" variant="outline" onClick={closeRefundForm}>
                                                            {l('Отмена', 'Cancel', 'Atcelt')}
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Items */}
                                    <div>
                                        <p className="text-sm font-semibold text-foreground mb-1.5">
                                            {l('Состав заказа', 'Order contents', 'Pasūtījuma saturs')}
                                        </p>
                                        <div className="rounded-lg border border-border divide-y divide-border">
                                            {order.items.map((item, index) => (
                                                <div
                                                    key={item.lineKey || `legacy:${order.id}:${index}`}
                                                    className="flex items-center gap-2 px-3 py-1.5"
                                                >
                                                    {item.image && (
                                                        <Image
                                                            unoptimized
                                                            src={item.image}
                                                            alt={item.title}
                                                            width={32}
                                                            height={32}
                                                            className="w-8 h-8 object-cover rounded-md shrink-0"
                                                        />
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm text-foreground truncate">
                                                            {item.title}
                                                        </p>
                                                        {item.variantLabel && (
                                                            <p className="text-xs text-muted-foreground truncate">
                                                                {localizeVariantLabel(item.variantLabel, language)}
                                                            </p>
                                                        )}
                                                        {item.sku?.trim() && (
                                                            <p className="text-xs text-muted-foreground truncate">
                                                                {l('Артикул', 'SKU', 'Artikuls')}: <span className="font-mono select-all">{item.sku.trim()}</span>
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

                                    {/* Status, manager note & amounts */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-border">
                                        <div className="space-y-3">
                                            {/* Status management */}
                                            <div>
                                                <p className="text-sm font-semibold text-foreground mb-1.5">
                                                    {l('Изменить статус', 'Change status', 'Mainīt statusu')}
                                                </p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {availableOrderStatuses(status).map((s) => (
                                                        <Hint content={s === 'cancelled' && payStatus === 'paid'
                                                                ? l('Сначала оформите возврат платежа', 'Refund the payment before cancelling', 'Pirms atcelšanas atmaksājiet maksājumu')
                                                                : undefined} key={s}><Button
                                                            size="sm"
                                                            variant={status === s ? 'default' : 'outline'}
                                                            className={
                                                                status === s
                                                                    ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                                                                    : ''
                                                            }
                                                            onClick={async () => {
                                                                if (s === 'cancelled') {
                                                                    const confirmed = window.confirm(l(
                                                                        `Отменить заказ ${order.id}? Товары будут возвращены на склад.`,
                                                                        `Cancel order ${order.id}? Reserved items will be returned to stock.`,
                                                                        `Atcelt pasūtījumu ${order.id}? Rezervētās preces tiks atgrieztas noliktavā.`
                                                                    ));
                                                                    if (!confirmed) return;
                                                                }
                                                                if (status === 'cancelled' && s === 'pending') {
                                                                    const confirmed = window.confirm(l(
                                                                        `Восстановить заказ ${order.id}? Товары снова будут списаны со склада.`,
                                                                        `Restore order ${order.id}? Its items will be reserved from stock again.`,
                                                                        `Atjaunot pasūtījumu ${order.id}? Preces atkal tiks rezervētas noliktavā.`
                                                                    ));
                                                                    if (!confirmed) return;
                                                                }
                                                                const saved = await setOrderStatus(order.id, s);
                                                                if (saved) showToast(
                                                                    s === 'cancelled'
                                                                        ? l('Заказ отменён', 'Order cancelled', 'Pasūtījums atcelts')
                                                                        : l(`Статус изменён: ${STATUS_LABELS[s]}`, `Status changed: ${STATUS_LABELS[s]}`, `Statuss mainīts: ${STATUS_LABELS[s]}`),
                                                                    'success'
                                                                );
                                                                else showToast(l('Не удалось изменить статус', 'Failed to change status', 'Neizdevās mainīt statusu'), 'error');
                                                            }}
                                                            disabled={status === s || isStatusSaving || (s === 'cancelled' && payStatus === 'paid')}
                                                            aria-busy={isStatusSaving}
                                                        >
                                                            {STATUS_LABELS[s]}
                                                        </Button></Hint>
                                                    ))}
                                                </div>
                                                {isStatusSaving && (
                                                    <p className="mt-2 text-xs text-muted-foreground" role="status">
                                                        {l('Сохраняем новый статус…', 'Saving the new status…', 'Saglabā jauno statusu…')}
                                                    </p>
                                                )}
                                                {payStatus === 'paid' && availableOrderStatuses(status).includes('cancelled') && (
                                                    <p className="mt-2 text-xs text-muted-foreground">
                                                        {l('Для отмены оплаченного заказа сначала оформите возврат платежа.', 'Refund the payment before cancelling a paid order.', 'Pirms apmaksāta pasūtījuma atcelšanas atmaksājiet maksājumu.')}
                                                    </p>
                                                )}
                                            </div>

                                            {/* Manager note */}
                                            <div className="pt-2 border-t border-border">
                                                <p className="text-sm font-semibold text-foreground mb-1.5">
                                                    {l('Заметка менеджера', 'Manager note', 'Vadītāja piezīme')}
                                                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                                                        {l('— клиент не видит', '— hidden from customer', '— klients neredz')}
                                                    </span>
                                                </p>
                                                <Textarea
                                                    rows={2}
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
                                                <div className="flex items-center gap-3 mt-1.5">
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

                                        {/* Amounts */}
                                        <div className="flex lg:justify-end">
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
                                                        <span>{payStatus === 'paid'
                                                            ? l('Бонусов начислено', 'Bonuses earned', 'Piešķirtie bonusi')
                                                            : payStatus === 'refunded'
                                                                ? l('Начисление отозвано (возврат)', 'Earning revoked (refund)', 'Piešķīrums atsaukts (atmaksa)')
                                                                : l('Бонусы после оплаты (прогноз)', 'Bonuses after payment (forecast)', 'Bonusi pēc apmaksas (prognoze)')}</span>
                                                        <span>
                                                            +{order.bonusEarned}
                                                            {' '}({formatEuro(pointsToEuros(order.bonusEarned ?? 0), locale)})
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );

}
