import { describe, expect, it } from 'vitest';
import type { Order } from '@/lib/orders-store';
import { buildOrdersPrintHtml } from './order-print';

describe('order print model', () => {
    it('builds a printable document and escapes customer content', () => {
        const order = {
            id: 'order-1',
            firstName: '<Anna>',
            lastName: 'Ozola',
            email: 'anna@example.com',
            phone: '+371 20000000',
            address: 'Main & First',
            city: 'Riga',
            createdAt: '2026-01-10T12:00:00.000Z',
            paymentStatus: 'paid',
            total: 24,
            items: [{ title: 'Repair "Mask"', price: 12, quantity: 2 }],
        } as unknown as Order;

        const html = buildOrdersPrintHtml({
            orders: [order],
            locale: 'en-US',
            getOrderStatus: () => 'confirmed',
            statusLabels: {
                pending: 'New',
                confirmed: 'Confirmed',
                shipped: 'Shipped',
                delivered: 'Delivered',
                cancelled: 'Cancelled',
            },
            paymentLabels: { paid: 'Paid' },
            title: 'Orders',
            totalLabel: 'Total',
        });

        expect(html).toContain('<title>Orders</title>');
        expect(html).toContain('&lt;Anna&gt;');
        expect(html).toContain('Main &amp; First');
        expect(html).toContain('Repair &quot;Mask&quot;');
        expect(html).toContain('Confirmed');
        expect(html).toContain('Paid');
        expect(html).not.toContain('<Anna>');
    });
});
