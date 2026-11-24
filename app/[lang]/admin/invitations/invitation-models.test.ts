import { describe, expect, it } from 'vitest';
import type { EligibleUser, Holder } from './invitation-models';
import { bulkInviteOutcome, isEligibleUserSent, nextSort, sortEligibleByStatus, sortHoldersByStatus, tallyInviteChunk } from './invitation-models';

describe('bulk invitation results', () => {
    it('counts sent, errors and skipped (already invited, pending, or not returned by the server)', () => {
        const results = [{ status: 'sent' }, { status: 'error' }, { status: 'skipped' }, { status: 'pending' }];
        expect(tallyInviteChunk(5, results)).toEqual({ sent: 1, failed: 1, skipped: 3, suppressed: 0 });
    });

    it('counts clients excluded by «Рассылки запрещены» separately from skipped and errors', () => {
        const results = [{ status: 'sent' }, { status: 'suppressed' }, { status: 'suppressed' }];
        expect(tallyInviteChunk(4, results)).toEqual({ sent: 1, failed: 0, skipped: 1, suppressed: 2 });
        expect(bulkInviteOutcome({ sent: 0, skipped: 0, failed: 0, suppressed: 5 }, { requestFailed: false, stopped: false })).toBe('done');
    });

    it('never reports "done" when a request failed or nothing was sent', () => {
        const none = { sent: 0, skipped: 0, failed: 0 };
        expect(bulkInviteOutcome(none, { requestFailed: true, stopped: false })).toBe('failed');
        expect(bulkInviteOutcome({ sent: 0, skipped: 0, failed: 5 }, { requestFailed: false, stopped: false })).toBe('failed');
        expect(bulkInviteOutcome({ sent: 10, skipped: 0, failed: 0 }, { requestFailed: true, stopped: false })).toBe('partial');
        expect(bulkInviteOutcome({ sent: 32, skipped: 0, failed: 3 }, { requestFailed: false, stopped: false })).toBe('partial');
        expect(bulkInviteOutcome({ sent: 5, skipped: 0, failed: 0 }, { requestFailed: false, stopped: true })).toBe('stopped');
        expect(bulkInviteOutcome({ sent: 30, skipped: 5, failed: 0 }, { requestFailed: false, stopped: false })).toBe('done');
    });
});

const holder = (userId: string, status: Holder['status']): Holder => ({
    userId,
    status,
    name: null,
    email: `${userId}@example.com`,
    phone: null,
    cardNumber: userId,
    sentAt: null,
    inviteUrl: null,
});

describe('invitation models', () => {
    it('cycles sort state through ascending, descending and off', () => {
        expect(nextSort(null, 'email')).toEqual({ key: 'email', dir: 'asc' });
        expect(nextSort({ key: 'email', dir: 'asc' }, 'email')).toEqual({ key: 'email', dir: 'desc' });
        expect(nextSort({ key: 'email', dir: 'desc' }, 'email')).toBeNull();
    });

    it('sorts holder statuses without mutating the source', () => {
        const holders = [holder('2', 'accepted'), holder('1', 'none')];
        expect(sortHoldersByStatus(holders, 'asc').map((item) => item.status)).toEqual(['none', 'accepted']);
        expect(holders[0].status).toBe('accepted');
    });

    it('sorts campaign users using the cursor boundary', () => {
        const users: EligibleUser[] = [
            { id: 'b', name: null, email: 'b@example.com' },
            { id: 'a', name: null, email: 'a@example.com' },
        ];
        expect(isEligibleUserSent('a', 'a')).toBe(true);
        expect(isEligibleUserSent('b', 'a')).toBe(false);
        expect(sortEligibleByStatus(users, 'a', 'asc').map((user) => user.id)).toEqual(['b', 'a']);
    });
});
