'use client';

import React from 'react';
import { formatEuro } from '@/lib/utils';
import { STATUS_LIST } from './order-config';
import type { OrderStatus } from '@/lib/admin-store';
import { useAdminLocale } from '@/lib/use-admin-locale';

import type { useAdminOrdersPage } from './useAdminOrdersPage';

type OrdersState = ReturnType<typeof useAdminOrdersPage>;

export default function OrdersStatistics({ state }: { state: OrdersState }): React.ReactElement {
    const { l } = useAdminLocale();
    const statusLabels: Record<OrderStatus, string> = {
        pending: l('Новый', 'New', 'Jauns'), confirmed: l('Подтверждён', 'Confirmed', 'Apstiprināts'),
        shipped: l('Отправлен', 'Shipped', 'Nosūtīts'), delivered: l('Доставлен', 'Delivered', 'Piegādāts'),
        cancelled: l('Отменён', 'Cancelled', 'Atcelts'),
    };
    const {
            totalOrderCount,
            locale,
            statusFilter,
            setStatusFilter,
            statsByStatus,
            totalRevenue,
          } = state;
    return (
        <>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                <div className="col-span-2 md:col-span-2 rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground">{l('Выручка выполненных заказов', 'Completed order revenue', 'Izpildīto pasūtījumu ieņēmumi')}</p>
                    <p className="text-2xl font-bold mt-1 text-foreground">
                        {formatEuro(totalRevenue, locale)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {l(`${totalOrderCount} заказов всего`, `${totalOrderCount} orders total`, `Kopā ${totalOrderCount} pasūtījumi`)}
                    </p>
                </div>
                {STATUS_LIST.map((s) => (
                    <button
                        key={s}
                        type="button"
                        onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
                        className={`rounded-xl border p-4 text-left transition-colors cursor-pointer ${
                            statusFilter === s
                                ? 'border-primary/70 bg-primary/5 dark:border-primary dark:bg-primary/10'
                                : 'border-border bg-card hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                    >
                        <p className="text-xs text-muted-foreground">{statusLabels[s]}</p>
                        <p className="text-2xl font-bold mt-1 text-foreground">
                            {statsByStatus[s] ?? 0}
                        </p>
                    </button>
                ))}
            </div>
        </>
    );
}
