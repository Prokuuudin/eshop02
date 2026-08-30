import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluateCampaignOffer, validatePromoCode } from './checkout-promo-api';

afterEach(() => vi.unstubAllGlobals());

describe('checkout promo api', () => {
    it('normalizes a campaign offer and forwards its items', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ discount: -5, freeShipping: true, campaignName: 'Summer' }),
        });
        vi.stubGlobal('fetch', fetchMock);

        await expect(evaluateCampaignOffer([{ id: 'p1', quantity: 2 }])).resolves.toEqual({
            discount: 0,
            freeShipping: true,
            campaignName: 'Summer',
        });
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
            items: [{ id: 'p1', quantity: 2 }],
        });
    });

    it('returns no campaign offer for an unsuccessful response', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
        await expect(evaluateCampaignOffer([])).resolves.toBeNull();
    });

    it('returns the promo validation response', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            json: async () => ({ valid: true, discount: 10, code: 'SAVE10' }),
        }));
        await expect(validatePromoCode({ code: 'save10', email: 'a@b.test', items: [] }))
            .resolves.toEqual({ valid: true, discount: 10, code: 'SAVE10' });
    });
});
