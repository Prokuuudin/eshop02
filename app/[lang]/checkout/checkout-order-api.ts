type CheckoutOrderPayload = {
    createdAt: Date;
    [key: string]: unknown;
};

export type CheckoutOrderFailure = 'insufficient_stock' | 'product_unavailable' | 'payment_gateway_error' | 'checkout_maintenance' | 'server' | 'invalid_response' | 'network';

export function checkoutOrderFailureMessage(reason: CheckoutOrderFailure, t: (key: string) => string): string {
    if (reason === 'checkout_maintenance') return t('checkout.errors.maintenance');
    if (reason === 'payment_gateway_error') return t('checkout.errors.paymentGateway');
    if (reason === 'product_unavailable') return t('checkout.errors.productUnavailable');
    if (reason === 'insufficient_stock') return 'Некоторых товаров уже нет в достаточном количестве. Обновите корзину и попробуйте снова.';
    if (reason === 'network') return 'Не удалось оформить заказ. Проверьте соединение и попробуйте ещё раз.';
    return 'Не удалось оформить заказ. Попробуйте ещё раз.';
}
export type CheckoutOrderResult =
    | { ok: true; orderId: string; paymentUrl?: string; deliveryLocation?: import('@/lib/delivery-locations').DeliveryLocation }
    | { ok: false; reason: CheckoutOrderFailure };

const pendingCheckoutKeys = new Map<string, string>();

function checkoutFingerprint(order: CheckoutOrderPayload): string {
    const { createdAt: _createdAt, ...stableOrder } = order;
    return JSON.stringify(stableOrder);
}

export async function createCheckoutOrder(
    order: CheckoutOrderPayload,
    turnstileToken: string | null
): Promise<CheckoutOrderResult> {
    const fingerprint = checkoutFingerprint(order);
    const idempotencyKey = pendingCheckoutKeys.get(fingerprint) ?? `checkout-${crypto.randomUUID()}`;
    pendingCheckoutKeys.set(fingerprint, idempotencyKey);
    try {
        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
            body: JSON.stringify({
                order: { ...order, createdAt: order.createdAt.toISOString() },
                turnstileToken,
            }),
        });

        if (!response.ok) {
            pendingCheckoutKeys.delete(fingerprint);
            const payload = (await response.json().catch(() => null)) as { error?: string } | null;
            return {
                ok: false,
                reason: payload?.error === 'insufficient_stock' || payload?.error === 'product_unavailable' || payload?.error === 'payment_gateway_error' || payload?.error === 'checkout_maintenance'
                    ? payload.error : 'server',
            };
        }

        const payload = (await response.json()) as { orderId?: string; paymentUrl?: string; deliveryLocation?: import('@/lib/delivery-locations').DeliveryLocation };
        if (payload.orderId) {
            pendingCheckoutKeys.delete(fingerprint);
            return { ok: true, orderId: String(payload.orderId), paymentUrl: payload.paymentUrl, ...(payload.deliveryLocation ? { deliveryLocation: payload.deliveryLocation } : {}) };
        }
        return { ok: false, reason: 'invalid_response' };
    } catch {
        return { ok: false, reason: 'network' };
    }
}
