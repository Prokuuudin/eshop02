import React from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import AccountOrderCard from '@/components/account/AccountOrderCard';
import type { Order } from '@/lib/orders-store';

interface AccountOrdersSectionProps {
    userOrders: Order[];
    filteredOrders: Order[];
    setOrderFilter: (filter: string) => void;
    getOrderFilterButtonClasses: (filter: string) => string;
    getStatusLabel: (status: string) => string;
    getStatusClasses: (status: string) => string;
    getOrderStatus: (orderId: string) => string;
    locale: string;
    t: (key: string) => string;
    tl: (key: string, ru: string, en: string, lv: string, params?: Record<string, string | number>) => string;
    activeOrdersCount: number;
    completedOrdersCount: number;
    handleRepeatOrder: (orderId: string) => void;
    getDeliveryLabel: (deliveryMethod: string) => string;
}

const AccountOrdersSection: React.FC<AccountOrdersSectionProps> = ({
    userOrders,
    filteredOrders,
    setOrderFilter,
    getOrderFilterButtonClasses,
    getStatusLabel,
    getStatusClasses,
    getOrderStatus,
    locale,
    t,
    tl,
    activeOrdersCount,
    completedOrdersCount,
    handleRepeatOrder,
    getDeliveryLabel,
}) => (
    <section
        id="orders-history"
        className="account-orders-section overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
    >
        <div className="flex flex-col gap-4 border-b border-gray-100 bg-gray-50/70 px-4 py-5 dark:border-gray-800 dark:bg-gray-950/30 sm:px-6 md:flex-row md:items-center md:justify-between">
            <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                {t('account.myOrders')}
            </h2>
            <div className="grid w-full grid-cols-3 rounded-xl bg-gray-200/70 p-1 dark:bg-gray-800 md:w-auto">
                <button
                    type="button"
                    className={getOrderFilterButtonClasses('all')}
                    onClick={() => setOrderFilter('all')}
                >
                    {tl(
                        'account.page.ordersFilter.allWithCount',
                        'Все ({count})',
                        'All ({count})',
                        'Visi ({count})',
                        { count: userOrders.length }
                    )}
                </button>
                <button
                    type="button"
                    className={getOrderFilterButtonClasses('active')}
                    onClick={() => setOrderFilter('active')}
                >
                    {tl(
                        'account.page.ordersFilter.activeWithCount',
                        'Активные ({count})',
                        'Active ({count})',
                        'Aktivie ({count})',
                        { count: activeOrdersCount }
                    )}
                </button>
                <button
                    type="button"
                    className={getOrderFilterButtonClasses('completed')}
                    onClick={() => setOrderFilter('completed')}
                >
                    {tl(
                        'account.page.ordersFilter.completedWithCount',
                        'Завершённые ({count})',
                        'Completed ({count})',
                        'Pabeigtie ({count})',
                        { count: completedOrdersCount }
                    )}
                </button>
            </div>
        </div>
        {userOrders.length > 0 ? (
            filteredOrders.length > 0 ? (
                <div className="space-y-4 p-4 sm:p-6">
                    {filteredOrders.map((order) => (
                        <AccountOrderCard
                            key={order.id}
                            order={order}
                            statusLabel={getStatusLabel(getOrderStatus(order.id))}
                            statusClasses={getStatusClasses(getOrderStatus(order.id))}
                            locale={locale}
                            itemsUnit={t('account.itemsUnit')}
                            deliveryLabel={getDeliveryLabel(order.deliveryMethod)}
                            promoCodeLabel={t('account.promoCode')}
                            bonusSpentLabel={t('account.bonus.spent')}
                            bonusEarnedLabel={t('account.bonus.earned')}
                            repeatOrderLabel={t('account.repeatOrder')}
                            saveAsTemplateLabel={t('templates.saveAsTemplate')}
                            detailsLabel={t('account.details')}
                            onRepeatOrder={() => handleRepeatOrder(order.id)}
                        />
                    ))}
                </div>
            ) : (
                <div className="m-4 rounded-2xl border border-dashed border-gray-300 px-4 py-10 text-center dark:border-gray-700 sm:m-6">
                    <p className="text-sm text-muted-foreground">
                        {tl(
                            'account.page.noOrdersForFilter',
                            'Для выбранного фильтра заказов пока нет.',
                            'There are no orders for the selected filter yet.',
                            'Izveletajam filtram vel nav pasutijumu.'
                        )}
                    </p>
                </div>
            )
        ) : (
            <div className="px-4 py-12 text-center sm:px-6">
                <p className="text-muted-foreground mb-4">{t('account.noOrders')}</p>
                <Link href="/catalog">
                    <Button>{t('account.startShopping')}</Button>
                </Link>
            </div>
        )}
    </section>
);

export default AccountOrdersSection;
