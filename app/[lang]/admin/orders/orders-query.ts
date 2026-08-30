import type { Order } from '@/lib/orders-store';
import type { OrderStatus } from '@/lib/admin-store';
import type { SortDir, SortField } from './order-config';

export type RawOrder = Omit<Order, 'createdAt'> & { createdAt: string };

export type OrdersPageResponse = {
    orders?: RawOrder[];
    total?: number;
};

export type OrdersQuery = {
    search: string;
    status: OrderStatus | 'all';
    payment: string;
    delivery: string;
    sortField: SortField;
    sortDir: SortDir;
    skip?: number;
    take?: number;
};

export function buildOrdersQuery(params: OrdersQuery): URLSearchParams {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.status !== 'all') qs.set('status', params.status);
    if (params.payment !== 'all') qs.set('payment', params.payment);
    if (params.delivery !== 'all') qs.set('deliveryMethod', params.delivery);
    qs.set('sort', params.sortField === 'total' ? 'total' : 'date');
    qs.set('dir', params.sortDir);
    if (params.skip != null) qs.set('skip', String(params.skip));
    if (params.take != null) qs.set('take', String(params.take));
    return qs;
}

export function toOrder(row: RawOrder): Order {
    return { ...row, createdAt: new Date(row.createdAt) };
}

