'use client';

import AccountProfileSummary from '@/components/account/AccountProfileSummary';
import AccountBonusCard from '@/components/account/AccountBonusCard';
import { useCompanyStore } from '@/lib/company-store';
import AccountSummaryCards from '@/components/account/AccountSummaryCards';
import AccountToolsSection from '@/components/account/AccountToolsSection';
import AccountNotificationsSection from '@/components/account/AccountNotificationsSection';
import { AccountAddressesWidget } from '@/components/account/AccountAddressesWidget';
import { AccountTemplatesWidget } from '@/components/account/AccountTemplatesWidget';
import AccountOrdersSection from '@/components/account/AccountOrdersSection';
import { AccountSubscriptionsSection } from '@/components/account/AccountSubscriptionsSection';
import { AccountWishlistWidget } from '@/components/account/AccountWishlistWidget';
import { AccountViewedProductsWidget } from '@/components/account/AccountViewedProductsWidget';
import { AccountReturnsSection } from '@/components/account/AccountReturnsSection';
import { AccountStockNotificationsSection } from '@/components/account/AccountStockNotificationsSection';
import { AccountReviewsSection } from '@/components/account/AccountReviewsSection';
import { useSubscriptionReminders } from '@/hooks/useSubscriptionReminders';
import B2BChat from '@/components/B2BChat';
import AdminAccountDashboard from '@/components/admin/AdminAccountDashboard';

import { useAccountOrders } from '@/hooks/useAccountOrders';
import { useLocaleHelpers } from '@/hooks/useLocaleHelpers';
import { getAccountTools } from '@/hooks/useAccountTools';
import { getAccountSummaryCards } from '@/hooks/useAccountSummary';
import { useAddressMigration } from '@/hooks/useAddressMigration';
import { useOrders } from '@/lib/orders-store';
import type { Order } from '@/lib/orders-store';
import { useAdminStore } from '@/lib/admin-store';

import { useSavedAddresses } from '@/lib/saved-addresses-store';
import { getCurrentUser, writeCurrentUser } from '@/lib/auth';
import { getLocaleFromLanguage } from '@/lib/utils';
import { useEffect, useState } from 'react';

import type { User } from '@/lib/auth';
import React from 'react';

export default function AccountPage(): React.ReactElement {
    const { t, language, tl } = useLocaleHelpers();
    const [user, setUser] = useState<User | null>(null);
    const companyStore = useCompanyStore();
    const [loading, setLoading] = useState(true);
    const ordersStore = useOrders();
    const { getOrderStatus } = useAdminStore();
    const { getByEmail, replaceForEmail } = useSavedAddresses();
    const allOrders = ordersStore.orders;
    const { upsertOrder } = ordersStore;
    const locale = getLocaleFromLanguage(language);
    useEffect(() => {
        const currentUser = getCurrentUser();
        if (!currentUser) {
            setLoading(false);
            return;
        }
        setUser(currentUser as User);
        setLoading(false);

        // Load order history from DB and merge into Zustand
        fetch('/api/orders/my')
            .then((r) => r.json())
            .then(({ orders: dbOrders }) => {
                if (Array.isArray(dbOrders)) {
                    dbOrders.forEach((o: Order) => upsertOrder(o));
                }
            })
            .catch(() => {});

        // Sync bonus points from DB (server is authoritative)
        fetch('/api/user/bonus')
            .then((r) => r.json())
            .then(({ bonusPoints }) => {
                if (typeof bonusPoints === 'number' && bonusPoints !== currentUser.bonusPoints) {
                    const updated = { ...currentUser, bonusPoints };
                    writeCurrentUser(updated);
                    setUser(updated as User);
                }
            })
            .catch(() => {});
    }, []);
    const userOrders = allOrders.filter((o) => o.email === user?.email);
    const totalSpent = userOrders.reduce((sum, order) => sum + order.total, 0);
    const totalBonusEarned = userOrders.reduce((sum, o) => sum + (o.bonusEarned ?? 0), 0);
    const totalBonusSpent = userOrders.reduce((sum, o) => sum + (o.bonusSpent ?? 0), 0);
    const isAdmin = user?.platformRole === 'admin';
    const savedAddresses = user?.email ? getByEmail(user.email) : [];
    useAddressMigration(user, userOrders, getByEmail, replaceForEmail);
    useSubscriptionReminders(user?.id ?? null);
    const [orderFilter, setOrderFilter] = useState<'all' | 'active' | 'completed'>('all');
    const orders = useAccountOrders(userOrders, getOrderStatus, orderFilter);
    const accountTools = getAccountTools(user, tl);
    const summaryCards = getAccountSummaryCards(
        t,
        tl,
        userOrders,
        savedAddresses,
        totalSpent,
        locale
    );

    if (loading) {
        return (
            <main className="w-full px-4 py-12">
                <p className="text-gray-600 dark:text-gray-300">{t('common.loading')}</p>
            </main>
        );
    }
    if (!user) {
        return (
            <main className="w-full px-4 py-12">
                <p className="text-gray-600 dark:text-gray-300">{t('account.authRequired')}</p>
            </main>
        );
    }

    const company = user?.companyId ? companyStore.getCompany(user.companyId) : null;

    if (isAdmin) {
        return (
            <main className="w-full px-4 py-12">
                <div className="mx-auto max-w-7xl">
                    <AdminAccountDashboard user={user} />
                </div>
            </main>
        );
    }

    return (
        <main className="w-full px-4 py-12">
            <div className="mx-auto max-w-7xl">
                <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
                    <aside className="xl:col-span-4">
                        <AccountProfileSummary
                            user={{ ...user, cardNumber: company?.cardNumber }}
                            t={t}
                            tl={tl}
                        />
                        <div className="mt-4">
                            <AccountBonusCard
                                bonusPoints={user.bonusPoints ?? 0}
                                totalEarned={totalBonusEarned}
                                totalSpent={totalBonusSpent}
                                t={t}
                            />
                        </div>
                        <div className="mt-4">
                            <AccountSummaryCards summaryCards={summaryCards} />
                        </div>
                    </aside>
                    <div className="space-y-6 xl:col-span-8">
                        <AccountNotificationsSection />
                        <AccountToolsSection accountTools={accountTools}>
                            {!isAdmin && <AccountAddressesWidget />}
                            {!isAdmin && <AccountTemplatesWidget />}
                            {!isAdmin && <AccountWishlistWidget />}
                            {!isAdmin && <AccountViewedProductsWidget />}
                        </AccountToolsSection>
                        {!isAdmin && <AccountSubscriptionsSection />}
                        {!isAdmin && <AccountStockNotificationsSection />}
                        {!isAdmin && <AccountReturnsSection />}
                        {!isAdmin && <AccountReviewsSection />}
                        {!isAdmin && (
                            <AccountOrdersSection
                                userOrders={userOrders}
                                filteredOrders={orders.filteredOrders}
                                orderFilter={orderFilter}
                                setOrderFilter={(filter: string) =>
                                    setOrderFilter(filter as 'all' | 'active' | 'completed')
                                }
                                getOrderFilterButtonClasses={(filter: string) =>
                                    orders.getOrderFilterButtonClasses(
                                        filter as 'all' | 'active' | 'completed'
                                    )
                                }
                                getStatusLabel={(status) => orders.getStatusLabel(status, t)}
                                getStatusClasses={orders.getStatusClasses}
                                getOrderStatus={getOrderStatus}
                                locale={locale}
                                t={t}
                                tl={tl}
                                activeOrdersCount={orders.activeOrdersCount}
                                completedOrdersCount={orders.completedOrdersCount}
                                handleRepeatOrder={(orderId) =>
                                    orders.handleRepeatOrder(orderId, userOrders, () => {}, {
                                        push: () => {},
                                    })
                                }
                                getDeliveryLabel={(method) => orders.getDeliveryLabel(method, t)}
                            />
                        )}
                    </div>
                </div>
            </div>
            {user?.companyId && <B2BChat />}
        </main>
    );
}
