'use client';

import React from 'react';
import { formatEuro } from '@/lib/utils';
import { STATUS_LABELS, STATUS_LIST } from './order-config';

import type { useAdminOrdersPage } from './useAdminOrdersPage';

type OrdersState = ReturnType<typeof useAdminOrdersPage>;

export default function OrdersStatistics({ state }: { state: OrdersState }): React.ReactElement {
    const {
            orders,
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
                    <p className="text-xs text-muted-foreground">Ð’Ñ‹Ñ€ÑƒÑ‡ÐºÐ°</p>
                    <p className="text-2xl font-bold mt-1 text-foreground">
                        {formatEuro(totalRevenue, locale)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {orders.length} Ð·Ð°ÐºÐ°Ð·Ð¾Ð² Ð²ÑÐµÐ³Ð¾
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
                        <p className="text-xs text-muted-foreground">{STATUS_LABELS[s]}</p>
                        <p className="text-2xl font-bold mt-1 text-foreground">
                            {statsByStatus[s] ?? 0}
                        </p>
                    </button>
                ))}
            </div>
        </>
    );
}
