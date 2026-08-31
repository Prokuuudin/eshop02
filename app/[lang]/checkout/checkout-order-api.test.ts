import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCheckoutOrder } from './checkout-order-api';

afterEach(() => vi.unstubAllGlobals());

describe('createCheckoutOrder', () => {
    it('serializes the creation date and returns the server order id', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ orderId: 1042 }),
        });
        vi.stubGlobal('fetch', fetchMock);
        const createdAt = new Date('2026-08-30T10:00:00.000Z');

        await expect(createCheckoutOrder({ id: 'browser-order-7', createdAt, total: 25 }, 'token')).resolves.toEqual({
            ok: true,
            orderId: '1042',
        });
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
            order: { id: 'browser-order-7', createdAt: createdAt.toISOString(), total: 25 },
            turnstileToken: 'token',
        });
        expect(fetchMock.mock.calls[0][1].headers['Idempotency-Key']).toMatch(/^checkout-/);
    });

    it('preserves the insufficient-stock failure reason', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            json: async () => ({ error: 'insufficient_stock' }),
        }));

        await expect(createCheckoutOrder({ createdAt: new Date() }, null)).resolves.toEqual({
            ok: false,
            reason: 'insufficient_stock',
        });
    });

    it('returns a network failure when fetch rejects', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

        await expect(createCheckoutOrder({ createdAt: new Date() }, null)).resolves.toEqual({
            ok: false,
            reason: 'network',
        });
    });

    it('reuses the same key when retrying after an ambiguous network failure', async () => {
        const fetchMock = vi.fn()
            .mockRejectedValueOnce(new Error('connection lost after send'))
            .mockResolvedValueOnce({ ok: true, json: async () => ({ orderId: '1043' }) });
        vi.stubGlobal('fetch', fetchMock);
        const first = { createdAt: new Date('2026-08-30T10:00:00Z'), total: 25, items: [{ id: 'p1', quantity: 1 }] };
        const retry = { ...first, createdAt: new Date('2026-08-30T10:01:00Z') };

        await expect(createCheckoutOrder(first, 'token-a')).resolves.toMatchObject({ reason: 'network' });
        await expect(createCheckoutOrder(retry, 'token-b')).resolves.toMatchObject({ ok: true, orderId: '1043' });
        expect(fetchMock.mock.calls[0][1].headers['Idempotency-Key'])
            .toBe(fetchMock.mock.calls[1][1].headers['Idempotency-Key']);
    });
});
