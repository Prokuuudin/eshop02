type CheckoutOrderPayload = {
    createdAt: Date;
    [key: string]: unknown;
};

export type CheckoutOrderFailure = 'insufficient_stock' | 'server' | 'invalid_response' | 'network';
export type CheckoutOrderResult =
    | { ok: true; orderId: string }
    | { ok: false; reason: CheckoutOrderFailure };

export async function createCheckoutOrder(
    order: CheckoutOrderPayload,
    turnstileToken: string | null
): Promise<CheckoutOrderResult> {
    try {
        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                order: { ...order, createdAt: order.createdAt.toISOString() },
                turnstileToken,
            }),
        });

        if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as { error?: string } | null;
            return {
                ok: false,
                reason: payload?.error === 'insufficient_stock' ? 'insufficient_stock' : 'server',
            };
        }

        const payload = (await response.json()) as { orderId?: string };
        return payload.orderId
            ? { ok: true, orderId: String(payload.orderId) }
            : { ok: false, reason: 'invalid_response' };
    } catch {
        return { ok: false, reason: 'network' };
    }
}
