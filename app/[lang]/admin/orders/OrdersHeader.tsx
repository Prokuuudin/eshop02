'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

import type { useAdminOrdersPage } from './useAdminOrdersPage';

type OrdersState = ReturnType<typeof useAdminOrdersPage>;

export default function OrdersHeader({ state }: { state: OrdersState }): React.ReactElement {
    const {
            unhandledCount,
            exportOrdersCSV,
            exportCustomersCSV,
          } = state;
    return (
        <>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <h1 className="text-3xl font-bold text-foreground">Заказы</h1>
                    {unhandledCount > 0 && (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-sm font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                            {unhandledCount} необработанных
                        </span>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Link href="/admin/orders/new">
                        <Button
                            size="sm"
                            className="bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                            + Создать заказ
                        </Button>
                    </Link>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={exportOrdersCSV}
                        className="hidden sm:inline-flex gap-1.5"
                    >
                        <Download className="h-3.5 w-3.5" />
                        Заказы (CSV)
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={exportCustomersCSV}
                        className="hidden sm:inline-flex gap-1.5"
                    >
                        <Download className="h-3.5 w-3.5" />
                        Клиенты (CSV)
                    </Button>
                    <Link href="/admin" className="hidden sm:block">
                        <Button variant="outline">Назад в админку</Button>
                    </Link>
                </div>
            </div>
        </>
    );
}
