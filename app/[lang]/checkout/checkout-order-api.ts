type CheckoutOrderPayload = {
    createdAt: Date;
    [key: string]: unknown;
};

export type CheckoutOrderFailure = 'insufficient_stock' | 'server' | 'invalid_response' | 'network';
export type CheckoutOrderResult =
    | { ok: true; orderId: string }
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
                reason: payload?.error === 'insufficient_stock' ? 'insufficient_stock' : 'server',
            };
        }

        const payload = (await response.json()) as { orderId?: string };
        if (payload.orderId) {
            pendingCheckoutKeys.delete(fingerprint);
            return { ok: true, orderId: String(payload.orderId) };
        }
        return { ok: false, reason: 'invalid_response' };
    } catch {
        return { ok: false, reason: 'network' };
    }
}
