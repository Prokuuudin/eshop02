'use client';

import React from 'react';
import { type OrderStatus } from '@/lib/admin-store';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Search } from 'lucide-react';
import { STATUS_LABELS, STATUS_LIST } from './order-config';

import type { useAdminOrdersPage } from './useAdminOrdersPage';

type OrdersState = ReturnType<typeof useAdminOrdersPage>;

export default function OrdersFilters({ state }: { state: OrdersState }): React.ReactElement {
    const {
            orders,
            search,
            setSearch,
            statusFilter,
            setStatusFilter,
            paymentFilter,
            setPaymentFilter,
            deliveryFilter,
            setDeliveryFilter,
            sortField,
            sortDir,
            filtered,
            isAllSelected,
            isSomeSelected,
            toggleSelectAll,
            toggleSort,
          } = state;
    return (
        <>
            <div className="bg-card rounded-xl border border-border p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
                    <div className="flex flex-1 min-w-[220px] items-center gap-2">
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Поиск по ID, имени, email, телефону..."
                            className="h-9 flex-1"
                        />
                        <Search className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="grid grid-cols-3 sm:contents gap-2">
                        <Select
                            value={statusFilter}
                            onValueChange={(v) => setStatusFilter(v as OrderStatus | 'all')}
                        >
                            <SelectTrigger className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground w-full sm:w-auto">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Все статусы</SelectItem>
                                {STATUS_LIST.map((s) => (
                                    <SelectItem key={s} value={s}>
                                        {STATUS_LABELS[s]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                            <SelectTrigger className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground w-full sm:w-auto">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Все оплаты</SelectItem>
                                <SelectItem value="unpaid">Не оплачен</SelectItem>
                                <SelectItem value="pending">Ожидает оплаты</SelectItem>
                                <SelectItem value="paid">Оплачен</SelectItem>
                                <SelectItem value="refunded">Возвращён</SelectItem>
                                <SelectItem value="failed">Ошибка оплаты</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={deliveryFilter} onValueChange={setDeliveryFilter}>
                            <SelectTrigger className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground w-full sm:w-auto">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Все доставки</SelectItem>
                                <SelectItem value="courier">Курьер</SelectItem>
                                <SelectItem value="pickup">Самовывоз</SelectItem>
                                <SelectItem value="post">Почта (Omniva)</SelectItem>
                                <SelectItem value="venipak">Venipak</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                    <label
                        htmlFor="select-all-orders"
                        className="flex items-center gap-1.5 cursor-pointer mr-2"
                    >
                        <Checkbox
                            id="select-all-orders"
                            checked={
                                isAllSelected ? true : isSomeSelected ? 'indeterminate' : false
                            }
                            onCheckedChange={toggleSelectAll}
                        />
                        <span className="text-xs text-muted-foreground">Выбрать все</span>
                    </label>
                    <span className="text-xs">Сортировка:</span>
                    <button
                        type="button"
                        onClick={() => toggleSort('date')}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                            sortField === 'date'
                                ? 'bg-primary/10 text-primary dark:bg-primary/40 dark:text-primary'
                                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-muted-foreground'
                        }`}
                    >
                        По дате{' '}
                        {sortField === 'date' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                    </button>
                    <button
                        type="button"
                        onClick={() => toggleSort('total')}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                            sortField === 'total'
                                ? 'bg-primary/10 text-primary dark:bg-primary/40 dark:text-primary'
                                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-muted-foreground'
                        }`}
                    >
                        По сумме{' '}
                        {sortField === 'total' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                    </button>
                    <span className="ml-auto text-xs text-muted-foreground">
                        {filtered.length} из {orders.length}
                    </span>
                </div>
            </div>
        </>
    );
}
