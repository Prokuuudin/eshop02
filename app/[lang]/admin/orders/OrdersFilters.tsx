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
import { STATUS_LIST } from './order-config';
import { useAdminLocale } from '@/lib/use-admin-locale';

import type { useAdminOrdersPage } from './useAdminOrdersPage';

type OrdersState = ReturnType<typeof useAdminOrdersPage>;

export default function OrdersFilters({ state }: { state: OrdersState }): React.ReactElement {
    const { l } = useAdminLocale();
    const statusLabels: Record<OrderStatus, string> = {
        pending: l('Новый', 'New', 'Jauns'), confirmed: l('Подтверждён', 'Confirmed', 'Apstiprināts'),
        shipped: l('Отправлен', 'Shipped', 'Nosūtīts'), delivered: l('Доставлен', 'Delivered', 'Piegādāts'),
        cancelled: l('Отменён', 'Cancelled', 'Atcelts'),
    };
    const {
            totalOrderCount,
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
            filteredCount,
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
                            placeholder={l('Поиск по ID, имени, email, телефону...', 'Search by ID, name, email, or phone...', 'Meklēt pēc ID, vārda, e-pasta vai tālruņa...')}
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
                                <SelectItem value="all">{l('Все статусы', 'All statuses', 'Visi statusi')}</SelectItem>
                                {STATUS_LIST.map((s) => (
                                    <SelectItem key={s} value={s}>
                                        {statusLabels[s]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                            <SelectTrigger className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground w-full sm:w-auto">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{l('Все оплаты', 'All payments', 'Visi maksājumi')}</SelectItem>
                                <SelectItem value="unpaid">{l('Не оплачен', 'Unpaid', 'Nav apmaksāts')}</SelectItem>
                                <SelectItem value="pending">{l('Ожидает оплаты', 'Awaiting payment', 'Gaida apmaksu')}</SelectItem>
                                <SelectItem value="paid">{l('Оплачен', 'Paid', 'Apmaksāts')}</SelectItem>
                                <SelectItem value="refunded">{l('Возвращён', 'Refunded', 'Atmaksāts')}</SelectItem>
                                <SelectItem value="failed">{l('Ошибка оплаты', 'Payment failed', 'Maksājuma kļūda')}</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={deliveryFilter} onValueChange={setDeliveryFilter}>
                            <SelectTrigger className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground w-full sm:w-auto">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{l('Все доставки', 'All deliveries', 'Visas piegādes')}</SelectItem>
                                <SelectItem value="courier">{l('Курьер', 'Courier', 'Kurjers')}</SelectItem>
                                <SelectItem value="pickup">{l('Самовывоз', 'Pickup', 'Saņemšana veikalā')}</SelectItem>
                                <SelectItem value="post">{l('Почта (Omniva)', 'Parcel terminal (Omniva)', 'Pakomāts (Omniva)')}</SelectItem>
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
                        <span className="text-xs text-muted-foreground">{l('Выбрать все', 'Select all', 'Atlasīt visu')}</span>
                    </label>
                    <span className="text-xs">{l('Сортировка:', 'Sort:', 'Kārtot:')}</span>
                    <button
                        type="button"
                        onClick={() => toggleSort('date')}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                            sortField === 'date'
                                ? 'bg-primary/10 text-primary dark:bg-primary/40 dark:text-primary'
                                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-muted-foreground'
                        }`}
                    >
                        {l('По дате', 'By date', 'Pēc datuma')}{' '}
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
                        {l('По сумме', 'By total', 'Pēc summas')}{' '}
                        {sortField === 'total' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                    </button>
                    <span className="ml-auto text-xs text-muted-foreground">
                        {l(`${filteredCount} из ${totalOrderCount}`, `${filteredCount} of ${totalOrderCount}`, `${filteredCount} no ${totalOrderCount}`)}
                    </span>
                </div>
            </div>
        </>
    );
}
