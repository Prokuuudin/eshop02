'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { useAdminLocale } from '@/lib/use-admin-locale';

import type { useAdminOrdersPage } from './useAdminOrdersPage';

type OrdersState = ReturnType<typeof useAdminOrdersPage>;

export default function OrdersHeader({ state }: { state: OrdersState }): React.ReactElement {
    const { l } = useAdminLocale();
    const {
            unhandledCount,
            exportOrdersCSV,
            exportCustomersCSV,
            exportingOrders,
            exportingCustomers,
          } = state;
    return (
        <>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <h1 className="text-3xl font-bold text-foreground">{l('Заказы', 'Orders', 'Pasūtījumi')}</h1>
                    {unhandledCount > 0 && (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-sm font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                            {l(`${unhandledCount} необработанных`, `${unhandledCount} unprocessed`, `${unhandledCount} neapstrādāti`)}
                        </span>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Link href="/admin/orders/new">
                        <Button
                            size="sm"
                            className="bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                            + {l('Создать заказ', 'Create order', 'Izveidot pasūtījumu')}
                        </Button>
                    </Link>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={exportOrdersCSV}
                        disabled={exportingOrders}
                        className="hidden sm:inline-flex gap-1.5"
                    >
                        <Download className="h-3.5 w-3.5" />
                        {exportingOrders ? l('Экспорт…', 'Exporting…', 'Eksportē…') : l('Заказы (CSV)', 'Orders (CSV)', 'Pasūtījumi (CSV)')}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={exportCustomersCSV}
                        disabled={exportingCustomers}
                        className="hidden sm:inline-flex gap-1.5"
                    >
                        <Download className="h-3.5 w-3.5" />
                        {exportingCustomers ? l('Экспорт…', 'Exporting…', 'Eksportē…') : l('Клиенты (CSV)', 'Customers (CSV)', 'Klienti (CSV)')}
                    </Button>
                    <Link href="/admin" className="hidden sm:block">
                        <Button variant="outline">{l('Назад в админку', 'Back to admin', 'Atpakaļ uz administrāciju')}</Button>
                    </Link>
                </div>
            </div>
        </>
    );
}
