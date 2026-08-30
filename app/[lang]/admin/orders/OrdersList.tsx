'use client';

import React from 'react';
import type { useAdminOrdersPage } from './useAdminOrdersPage';
import { useAdminLocale } from '@/lib/use-admin-locale';
import { OrderListItem } from './OrderListItem';

type OrdersState = ReturnType<typeof useAdminOrdersPage>;

export default function OrdersList({ state }: { state: OrdersState }): React.ReactElement {
    const { l } = useAdminLocale();
    const { totalOrderCount, hydrationStatus, filteredCount, pageItems } = state;
    return (
        <>
            <div className="space-y-3">
                {pageItems.map((order) => (
                    <OrderListItem key={order.id} order={order} state={state} />
                ))}

                {filteredCount === 0 && hydrationStatus === 'loading' && (
                    <div className="rounded-xl border border-border p-10 bg-muted text-center text-sm text-muted-foreground" role="status">
                        {l('Загружаем заказы…', 'Loading orders…', 'Ielādē pasūtījumus…')}
                    </div>
                )}
                {filteredCount === 0 && hydrationStatus === 'error' && (
                    <div className="rounded-xl border border-destructive/40 p-10 bg-destructive/10 text-center text-sm text-destructive" role="alert">
                        {l('Не удалось загрузить заказы. Обновите страницу и попробуйте ещё раз.', 'Failed to load orders. Refresh the page and try again.', 'Neizdevās ielādēt pasūtījumus. Atsvaidziniet lapu un mēģiniet vēlreiz.')}
                    </div>
                )}
                {filteredCount === 0 && hydrationStatus !== 'loading' && hydrationStatus !== 'error' && (
                    <div className="rounded-xl border border-border p-10 bg-muted text-center text-sm text-muted-foreground">
                        {totalOrderCount === 0
                            ? l('Заказов пока нет', 'No orders yet', 'Pasūtījumu vēl nav')
                            : l('Нет заказов по выбранным фильтрам', 'No orders match the selected filters', 'Atlasītajiem filtriem nav atbilstošu pasūtījumu')}
                    </div>
                )}
            </div>
        </>
    );
}
