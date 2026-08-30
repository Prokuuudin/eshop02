import { describe, expect, it } from 'vitest';
import type { EligibleUser, Holder } from './invitation-models';
import { isEligibleUserSent, nextSort, sortEligibleByStatus, sortHoldersByStatus } from './invitation-models';

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
