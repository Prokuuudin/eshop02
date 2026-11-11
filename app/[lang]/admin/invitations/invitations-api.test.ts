import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    assignInvitationCard,
    fetchInvitationHolders,
    fetchPhoneMessageTemplate,
    sendInvitationBatch,
    updateCardCampaign,
} from './invitations-api';

afterEach(() => vi.unstubAllGlobals());

describe('invitations api', () => {
    it('builds the holders page query and forwards the abort signal', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ holders: [], total: 0 }),
        });
        vi.stubGlobal('fetch', fetchMock);
        const controller = new AbortController();

        await fetchInvitationHolders({
            take: 25,
            skip: 50,
            search: 'anna',
            sort: 'email',
            dir: 'desc',
            contact: 'complete',
            invitation: 'notInvited',
        }, controller.signal);

        expect(fetchMock).toHaveBeenCalledWith(
            '/api/admin/invitations?take=25&skip=50&search=anna&sort=email&dir=desc&contact=complete&invitation=notInvited',
            { signal: controller.signal }
        );
    });

    it('sends invitation ids using the existing payload shape', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
        vi.stubGlobal('fetch', fetchMock);

        await sendInvitationBatch(['u1', 'u2']);
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ userIds: ['u1', 'u2'] });
    });

    it('gives every send action its own idempotency key', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
        vi.stubGlobal('fetch', fetchMock);

        await sendInvitationBatch(['u1']);
        await sendInvitationBatch(['u1']);
        const keys = fetchMock.mock.calls.map((call) => call[1].headers['Idempotency-Key']);
        expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/u);
        expect(keys[1]).not.toBe(keys[0]);
    });

    it('loads the phone-message template for the selected language', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => [
                { id: 'sms-invite-ru', body: 'RU', variables: [] },
                { id: 'sms-invite-lv', body: 'LV', variables: [] },
            ],
        });
        vi.stubGlobal('fetch', fetchMock);
        const controller = new AbortController();

        await expect(fetchPhoneMessageTemplate('lv', controller.signal)).resolves.toMatchObject({ body: 'LV' });
        expect(fetchMock).toHaveBeenCalledWith('/api/admin/email-templates', { signal: controller.signal });
    });

    it('keeps card assignment and campaign reset payloads stable', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
        vi.stubGlobal('fetch', fetchMock);

        await assignInvitationCard('anna@example.com', '1234');
        await updateCardCampaign(true);

        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
            email: 'anna@example.com',
            cardNumber: '1234',
        });
        expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ reset: true });
    });
});
