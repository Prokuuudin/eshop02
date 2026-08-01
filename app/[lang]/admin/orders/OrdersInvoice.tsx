'use client';

import React from 'react';
import OrderInvoiceModal from '@/components/admin/OrderInvoiceModal';

import type { useAdminOrdersPage } from './useAdminOrdersPage';

type OrdersState = ReturnType<typeof useAdminOrdersPage>;

export default function OrdersInvoice({ state }: { state: OrdersState }): React.ReactElement {
    const {
            invoiceOrder,
            setInvoiceOrder,
          } = state;
    return (
        <>
            {invoiceOrder && (
                <OrderInvoiceModal
                    order={invoiceOrder}
                    open={true}
                    onClose={() => setInvoiceOrder(null)}
                />
            )}
        </>
    );
}
