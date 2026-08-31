import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteAdminReviews, loadAdminReviews, updateAdminReviews } from './reviews-api';

afterEach(() => vi.unstubAllGlobals());

describe('reviews api', () => {
    it('loads reviews with trimmed search and status filters', async () => {
        const reviews = [{ id: 'r1' }];
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ data: { reviews } }),
        });
        vi.stubGlobal('fetch', fetchMock);

        await expect(loadAdminReviews({ status: 'pending', search: '  anna  ' }))
            .resolves.toEqual(reviews);
        expect(fetchMock).toHaveBeenCalledWith(
            '/api/admin/reviews?status=pending&search=anna',
            { cache: 'no-store' }
        );
    });

    it('keeps patch and delete request payloads stable', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', fetchMock);

        await updateAdminReviews({ ids: ['r1', 'r2'], status: 'approved' });
        await deleteAdminReviews({ id: 'r3' });

        expect(fetchMock.mock.calls[0][1]).toMatchObject({
            method: 'PATCH',
            body: JSON.stringify({ ids: ['r1', 'r2'], status: 'approved' }),
        });
        expect(fetchMock.mock.calls[1][1]).toMatchObject({
            method: 'DELETE',
            body: JSON.stringify({ id: 'r3' }),
        });
    });

    it('rejects unsuccessful mutations', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
        await expect(updateAdminReviews({ id: 'r1', reply: null })).rejects.toThrow();
    });
});
