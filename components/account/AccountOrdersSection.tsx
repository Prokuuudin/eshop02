import React from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import AccountOrderCard from '@/components/account/AccountOrderCard';

interface AccountOrdersSectionProps {
    userOrders: any[];
    filteredOrders: any[];
    orderFilter: string;
    setOrderFilter: (filter: string) => void;
    getOrderFilterButtonClasses: (filter: string) => string;
    getStatusLabel: (status: string) => string;
    getStatusClasses: (status: string) => string;
    getOrderStatus: (orderId: string) => string;
    locale: string;
    t: (key: string) => string;
    tl: (...args: any[]) => string;
    activeOrdersCount: number;
    completedOrdersCount: number;
    handleRepeatOrder: (orderId: string) => void;
    getDeliveryLabel: (deliveryMethod: string) => string;
}

const AccountOrdersSection: React.FC<AccountOrdersSectionProps> = ({
    userOrders,
    filteredOrders,
    orderFilter,
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
        className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-6"
    >
        <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {t('account.myOrders')}
            </h2>
            <div className="inline-flex w-full rounded-2xl bg-gray-100 p-1 dark:bg-gray-800 md:w-auto">
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
                <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
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
                            detailsLabel={t('account.details')}
                            onRepeatOrder={() => handleRepeatOrder(order.id)}
                        />
                    ))}
                </div>
            ) : (
                <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-10 text-center dark:border-gray-700">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
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
            <div className="text-center py-12">
                <p className="text-gray-600 dark:text-gray-300 mb-4">{t('account.noOrders')}</p>
                <Link href="/catalog">
                    <Button>{t('account.startShopping')}</Button>
                </Link>
            </div>
        )}
    </section>
);

export default AccountOrdersSection;
