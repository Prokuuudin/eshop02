'use client';

import React from 'react';
import { formatEuro } from '@/lib/utils';
import { STATUS_LIST, STATUS_SURFACES } from './order-config';
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
                <div className="col-span-2 rounded-xl border border-border border-l-4 border-l-emerald-500 bg-emerald-50 p-4 shadow-sm dark:bg-emerald-950/20 md:col-span-2">
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
                        className={`cursor-pointer rounded-xl border border-l-4 p-4 text-left shadow-sm transition-colors ${STATUS_SURFACES[s]} ${
                            statusFilter === s
                                ? 'ring-2 ring-primary/50 ring-offset-1 dark:ring-offset-background'
                                : 'border-border hover:brightness-[0.98] dark:hover:brightness-110'
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
