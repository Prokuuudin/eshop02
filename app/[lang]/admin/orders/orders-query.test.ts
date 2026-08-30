import { describe, expect, it } from 'vitest';
import { buildOrdersQuery, toOrder, type RawOrder } from './orders-query';

describe('orders query helpers', () => {
    it('omits all-filters and includes pagination', () => {
        const query = buildOrdersQuery({
            search: '',
            status: 'all',
            payment: 'all',
            delivery: 'all',
            sortField: 'date',
            sortDir: 'desc',
            skip: 20,
            take: 20,
        });

        expect(query.toString()).toBe('sort=date&dir=desc&skip=20&take=20');
    });

    it('serializes active filters and total sorting', () => {
        const query = buildOrdersQuery({
            search: 'anna@example.com',
            status: 'confirmed',
            payment: 'paid',
            delivery: 'pickup',
            sortField: 'total',
            sortDir: 'asc',
        });

        expect(Object.fromEntries(query)).toEqual({
            search: 'anna@example.com',
            status: 'confirmed',
            payment: 'paid',
            deliveryMethod: 'pickup',
            sort: 'total',
            dir: 'asc',
        });
    });

    it('converts the API date into a Date instance', () => {
        const raw = {
            id: '1001',
            createdAt: '2026-08-30T10:00:00.000Z',
        } as RawOrder;

        const order = toOrder(raw);

        expect(order.createdAt).toBeInstanceOf(Date);
        expect(order.createdAt.toISOString()).toBe(raw.createdAt);
    });
});
