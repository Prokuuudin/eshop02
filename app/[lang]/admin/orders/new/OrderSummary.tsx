'use client';

import { Button } from '@/components/ui/button';
import type { DeliveryMethod } from '@/lib/orders-store';
import { formatEuro } from '@/lib/utils';
import type { useNewOrderPage } from './useNewOrderPage';

type State = ReturnType<typeof useNewOrderPage>;
export type DeliveryOption = { value: DeliveryMethod; label: string; cost: number };

type Props = {
    state: State;
    deliveryOptions: DeliveryOption[];
};

export default function OrderSummary({ state, deliveryOptions }: Props): React.ReactElement {
    const {
        l,
        locale,
        email,
        firstName,
        lastName,
        items,
        promoResult,
        manualDiscountPct,
        deliveryMethod,
        paymentMethod,
        paymentStatus,
        submitting,
        subtotal,
        discountFromPromo,
        discountFromManual,
        discount,
        deliveryCost,
        total,
        handleSubmit,
    } = state;

    return (
        <div className="lg:col-span-1">
            <div className="sticky top-6 rounded-xl border border-border bg-card p-5 space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {l('Сводка заказа', 'Order summary', 'Pasūtījuma kopsavilkums')}
                </h2>
        
                {/* Customer */}
                {(firstName || email) && (
                    <div className="rounded-lg bg-muted px-3 py-2.5 text-sm">
                        <p className="font-medium text-foreground">
                            {[firstName, lastName].filter(Boolean).join(' ') || '—'}
                        </p>
                        <p className="text-muted-foreground text-xs mt-0.5">{email}</p>
                    </div>
                )}
        
                {/* Items */}
                {items.length > 0 && (
                    <div className="space-y-1">
                        {items.map((item) => (
                            <div
                                key={item.product.id}
                                className="flex justify-between text-sm gap-2"
                            >
                                <span className="truncate text-foreground flex-1">
                                    {item.product.title} ×{item.quantity}
                                </span>
                                <span className="shrink-0 text-foreground tabular-nums">
                                    {formatEuro(item.unitPrice * item.quantity, locale)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
        
                {items.length > 0 && (
                    <div className="border-t border-border pt-3 space-y-1.5 text-sm">
                        <div className="flex justify-between text-muted-foreground">
                            <span>{l('Товары', 'Products', 'Preces')}</span>
                            <span className="tabular-nums">
                                {formatEuro(subtotal, locale)}
                            </span>
                        </div>
                        {discount > 0 && (
                            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                                <span>
                                    {l('Скидка', 'Discount', 'Atlaide')}
                                    {promoResult &&
                                    discountFromPromo >= discountFromManual
                                        ? ` (${promoResult.code})`
                                        : manualDiscountPct
                                        ? ` (${manualDiscountPct}%)`
                                        : ''}
                                </span>
                                <span className="tabular-nums">
                                    −{formatEuro(discount, locale)}
                                </span>
                            </div>
                        )}
                        <div className="flex justify-between text-muted-foreground">
                            <span>
                                {l('Доставка', 'Delivery', 'Piegāde')} (
                                {
                                    deliveryOptions.find(
                                        (d) => d.value === deliveryMethod
                                    )?.label
                                }
                                )
                            </span>
                            <span className="tabular-nums">
                                {deliveryCost === 0
                                    ? l('бесплатно', 'free', 'bez maksas')
                                    : formatEuro(deliveryCost, locale)}
                            </span>
                        </div>
                        <div className="flex justify-between font-bold text-lg text-foreground pt-1 border-t border-border">
                            <span>{l('Итого', 'Total', 'Kopā')}</span>
                            <span className="tabular-nums">
                                {formatEuro(total, locale)}
                            </span>
                        </div>
                    </div>
                )}
        
                {/* Payment summary */}
                <div className="text-xs text-muted-foreground space-y-0.5">
                    <p>{l('Оплата:', 'Payment:', 'Apmaksa:')} {paymentMethod}</p>
                    <p>
                        {l('Статус:', 'Status:', 'Statuss:')}{' '}
                        {paymentStatus === 'paid' ? `✓ ${l('Оплачен', 'Paid', 'Apmaksāts')}` : `⚠ ${l('Не оплачен', 'Unpaid', 'Nav apmaksāts')}`}
                    </p>
                </div>
        
                <Button
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                    disabled={submitting || items.length === 0}
                    onClick={handleSubmit}
                >
                    {submitting
                        ? l('Создание...', 'Creating...', 'Izveido...')
                        : `${l('Создать заказ', 'Create order', 'Izveidot pasūtījumu')}${
                              total > 0 ? ` · ${formatEuro(total, locale)}` : ''
                          }`}
                </Button>
        
                {items.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center">
                        {l('Добавьте товары чтобы создать заказ', 'Add products to create the order', 'Pievienojiet preces, lai izveidotu pasūtījumu')}
                    </p>
                )}
            </div>
        </div>
    );
}
