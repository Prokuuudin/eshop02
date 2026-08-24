'use client';

import React from 'react';

import { useAdminOrdersPage } from './useAdminOrdersPage';
import OrdersHeader from './OrdersHeader';
import OrdersStatistics from './OrdersStatistics';
import OrdersFilters from './OrdersFilters';
import OrdersBulkActions from './OrdersBulkActions';
import OrdersList from './OrdersList';
import OrdersPagination from './OrdersPagination';
import OrdersInvoice from './OrdersInvoice';
import { useAdminLocale } from '@/lib/use-admin-locale';
export default function AdminOrdersPage(): React.ReactElement {
    const { l } = useAdminLocale();
    const state = useAdminOrdersPage();
    return (
        <main className="w-full py-4 space-y-6">
            <OrdersHeader state={state} />
            {state.mutationError && (
                <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {l('Операция не сохранена:', 'Operation was not saved:', 'Darbība netika saglabāta:')} {state.mutationError}
                </div>
            )}
            <OrdersStatistics state={state} />
            <OrdersFilters state={state} />
            <OrdersBulkActions state={state} />
            <OrdersList state={state} />
            <OrdersPagination state={state} />
            <OrdersInvoice state={state} />
        </main>
    );
}
