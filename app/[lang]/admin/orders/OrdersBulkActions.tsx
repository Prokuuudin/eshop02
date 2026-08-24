'use client';

import React from 'react';
import { type OrderStatus } from '@/lib/admin-store';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Printer } from 'lucide-react';
import { useAdminLocale } from '@/lib/use-admin-locale';

import type { useAdminOrdersPage } from './useAdminOrdersPage';

type OrdersState = ReturnType<typeof useAdminOrdersPage>;

export default function OrdersBulkActions({ state }: { state: OrdersState }): React.ReactElement {
    const { l } = useAdminLocale();
    const statusLabels: Record<OrderStatus, string> = {
        pending: l('Новый', 'New', 'Jauns'), confirmed: l('Подтверждён', 'Confirmed', 'Apstiprināts'),
        shipped: l('Отправлен', 'Shipped', 'Nosūtīts'), delivered: l('Доставлен', 'Delivered', 'Piegādāts'),
        cancelled: l('Отменён', 'Cancelled', 'Atcelts'),
    };
    const {
            selectedIds,
            setSelectedIds,
            bulkStatus,
            setBulkStatus,
            applyBulkStatus,
            availableBulkStatuses,
            printSelected,
          } = state;
    return (
        <>
            {selectedIds.size > 0 && (
                <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 dark:border-primary/50 bg-primary/5 dark:bg-primary/15 px-4 py-3">
                    <span className="text-sm font-medium text-primary dark:text-primary/60">
                        {l('Выбрано', 'Selected', 'Atlasīti')}: {selectedIds.size}
                    </span>
                    <div className="flex items-center gap-2">
                        <Select
                            value={bulkStatus}
                            onValueChange={(v) => setBulkStatus(v as OrderStatus | '')}
                        >
                            <SelectTrigger className="rounded-lg border border-primary/50 dark:border-primary bg-card px-3 py-1.5 text-sm text-foreground">
                                <SelectValue placeholder={l('Изменить статус...', 'Change status...', 'Mainīt statusu...')} />
                            </SelectTrigger>
                            <SelectContent>
                                {availableBulkStatuses.map((s) => (
                                    <SelectItem key={s} value={s}>
                                        {statusLabels[s]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button
                            size="sm"
                            disabled={!bulkStatus || !availableBulkStatuses.includes(bulkStatus)}
                            onClick={applyBulkStatus}
                        >
                            {l('Применить', 'Apply', 'Lietot')}
                        </Button>
                    </div>
                    <Button size="sm" variant="outline" onClick={printSelected} className="gap-1.5">
                        <Printer className="h-3.5 w-3.5" />
                        {l('Печать', 'Print', 'Drukāt')}
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedIds(new Set())}
                        className="ml-auto text-primary dark:text-primary"
                    >
                        {l('Снять выбор', 'Clear selection', 'Noņemt atlasi')}
                    </Button>
                </div>
            )}
        </>
    );
}
