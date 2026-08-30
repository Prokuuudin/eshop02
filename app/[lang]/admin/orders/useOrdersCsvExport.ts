'use client';

import { useState } from 'react';
import type { Order } from '@/lib/orders-store';
import type { OrderStatus } from '@/lib/admin-store';
import type { SortDir, SortField } from './order-config';
import { buildOrdersQuery, toOrder, type OrdersPageResponse } from './orders-query';

type Localize = (ru: string, en: string, lv: string) => string;

type OrdersCsvExportOptions = {
    search: string;
    status: OrderStatus | 'all';
    payment: string;
    delivery: string;
    sortField: SortField;
    sortDir: SortDir;
    locale: string;
    l: Localize;
    getOrderStatus: (orderId: string) => OrderStatus;
    statusLabels: Record<OrderStatus, string>;
    paymentLabels: Record<string, string>;
    deliveryLabels: Record<string, string>;
    onError: (message: string) => void;
};

function useOrdersCsvExportState({
    search, status, payment, delivery, sortField, sortDir, locale, l, getOrderStatus,
    statusLabels: STATUS_LABELS, paymentLabels: PAYMENT_LABELS, deliveryLabels: DELIVERY_LABELS, onError,
}: OrdersCsvExportOptions) {
    const downloadCSV = (rows: string[][], filename: string) => {
        const content = rows.map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const csvDate = () => new Date().toISOString().slice(0, 10);

    // CSV export needs every row matching the current filters, not just the
    // visible page - fetched only when the export button is actually clicked
    // (not on page load), scoped by the same filter querystring as the table.
    const [exportingOrders, setExportingOrders] = useState(false);
    const [exportingCustomers, setExportingCustomers] = useState(false);

    const fetchAllMatchingOrders = async (): Promise<Order[]> => {
        const all: Order[] = [];
        let skip = 0;
        const take = 200;
        for (;;) {
            const qs = buildOrdersQuery({
                search: search,
                status: status,
                payment: payment,
                delivery: delivery,
                sortField,
                sortDir,
                skip,
                take,
            });
            const res = await fetch(`/api/admin/orders?${qs.toString()}`, { cache: 'no-store' });
            if (!res.ok) throw new Error(`export_fetch_failed:${res.status}`);
            const data = (await res.json()) as OrdersPageResponse;
            const rows = (data.orders ?? []).map(toOrder);
            all.push(...rows);
            const total = data.total ?? all.length;
            if (all.length >= total || rows.length < take) return all;
            skip += rows.length;
        }
    };

    const exportOrdersCSV = async () => {
        setExportingOrders(true);
        try {
            const all = await fetchAllMatchingOrders();
            const header = [
                'ID',
                l('Дата', 'Date', 'Datums'),
                l('Имя', 'First name', 'Vārds'),
                l('Фамилия', 'Last name', 'Uzvārds'),
                'Email',
                l('Телефон', 'Phone', 'Tālrunis'),
                l('Статус', 'Status', 'Statuss'),
                l('Оплата', 'Payment', 'Apmaksa'),
                l('Доставка', 'Delivery', 'Piegāde'),
                l('Адрес', 'Address', 'Adrese'),
                l('Город', 'City', 'Pilsēta'),
                l('Индекс', 'Postal code', 'Pasta indekss'),
                l('Товары', 'Products', 'Produkti'),
                l('Сумма', 'Total', 'Summa'),
            ];
            const rows = all.map((o) => {
                const status = getOrderStatus(o.id);
                return [
                    o.id,
                    new Date(o.createdAt).toLocaleDateString(locale),
                    o.firstName,
                    o.lastName,
                    o.email,
                    o.phone,
                    STATUS_LABELS[status],
                    PAYMENT_LABELS[o.paymentStatus ?? 'unpaid'],
                    DELIVERY_LABELS[o.deliveryMethod] ?? o.deliveryMethod,
                    o.address,
                    o.city,
                    o.postalCode ?? '',
                    o.items.map((i) => `${i.title} ×${i.quantity}`).join('; '),
                    o.total.toFixed(2),
                ];
            });
            downloadCSV([header, ...rows], `orders-${csvDate()}.csv`);
        } catch (error) {
            onError(error instanceof Error ? error.message : l('Не удалось выгрузить заказы', 'Failed to export orders', 'Neizdevās eksportēt pasūtījumus'));
        } finally {
            setExportingOrders(false);
        }
    };

    const exportCustomersCSV = async () => {
        setExportingCustomers(true);
        try {
            const all = await fetchAllMatchingOrders();
            const seen = new Set<string>();
            const header = [
                l('Имя', 'First name', 'Vārds'),
                l('Фамилия', 'Last name', 'Uzvārds'),
                'Email',
                l('Телефон', 'Phone', 'Tālrunis'),
                l('Город', 'City', 'Pilsēta'),
                l('Заказов', 'Orders', 'Pasūtījumi'),
                l('Сумма (€)', 'Total (€)', 'Summa (€)'),
            ];
            const rows: string[][] = [];
            all.forEach((o) => {
                if (seen.has(o.email)) return;
                seen.add(o.email);
                const customerOrders = all.filter((x) => x.email === o.email);
                const spent = customerOrders.reduce((s, x) => s + x.total, 0);
                rows.push([o.firstName, o.lastName, o.email, o.phone, o.city, String(customerOrders.length), spent.toFixed(2)]);
            });
            downloadCSV([header, ...rows], `customers-${csvDate()}.csv`);
        } catch (error) {
            onError(error instanceof Error ? error.message : l('Не удалось выгрузить клиентов', 'Failed to export customers', 'Neizdevās eksportēt klientus'));
        } finally {
            setExportingCustomers(false);
        }
    };


    return { exportOrdersCSV, exportCustomersCSV, exportingOrders, exportingCustomers };
}

export function useOrdersCsvExport(options: OrdersCsvExportOptions): ReturnType<typeof useOrdersCsvExportState> {
    return useOrdersCsvExportState(options);
}
