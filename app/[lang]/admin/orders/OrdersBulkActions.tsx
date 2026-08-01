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
import { STATUS_LABELS, STATUS_LIST } from './order-config';

import type { useAdminOrdersPage } from './useAdminOrdersPage';

type OrdersState = ReturnType<typeof useAdminOrdersPage>;

export default function OrdersBulkActions({ state }: { state: OrdersState }): React.ReactElement {
    const {
            selectedIds,
            setSelectedIds,
            bulkStatus,
            setBulkStatus,
            applyBulkStatus,
            printSelected,
          } = state;
    return (
        <>
            {selectedIds.size > 0 && (
                <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 dark:border-primary/50 bg-primary/5 dark:bg-primary/15 px-4 py-3">
                    <span className="text-sm font-medium text-primary dark:text-primary/60">
                        Ð’Ñ‹Ð±Ñ€Ð°Ð½Ð¾: {selectedIds.size}
                    </span>
                    <div className="flex items-center gap-2">
                        <Select
                            value={bulkStatus}
                            onValueChange={(v) => setBulkStatus(v as OrderStatus | '')}
                        >
                            <SelectTrigger className="rounded-lg border border-primary/50 dark:border-primary bg-card px-3 py-1.5 text-sm text-foreground">
                                <SelectValue placeholder="Ð˜Ð·Ð¼ÐµÐ½Ð¸Ñ‚ÑŒ ÑÑ‚Ð°Ñ‚ÑƒÑ..." />
                            </SelectTrigger>
                            <SelectContent>
                                {STATUS_LIST.map((s) => (
                                    <SelectItem key={s} value={s}>
                                        {STATUS_LABELS[s]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button size="sm" disabled={!bulkStatus} onClick={applyBulkStatus}>
                            ÐŸÑ€Ð¸Ð¼ÐµÐ½Ð¸Ñ‚ÑŒ
                        </Button>
                    </div>
                    <Button size="sm" variant="outline" onClick={printSelected} className="gap-1.5">
                        <Printer className="h-3.5 w-3.5" />
                        ÐŸÐµÑ‡Ð°Ñ‚ÑŒ
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedIds(new Set())}
                        className="ml-auto text-primary dark:text-primary"
                    >
                        Ð¡Ð½ÑÑ‚ÑŒ Ð²Ñ‹Ð±Ð¾Ñ€
                    </Button>
                </div>
            )}
        </>
    );
}
