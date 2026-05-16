'use client';

import AccountProfileCard from '@/components/account/AccountProfileCard';
import { useCompanyStore } from '@/lib/company-store';
import AccountSummaryCards from '@/components/account/AccountSummaryCards';
import AccountToolsSection from '@/components/account/AccountToolsSection';
import AccountAddressesSection from '@/components/account/AccountAddressesSection';
import AccountOrdersSection from '@/components/account/AccountOrdersSection';
import B2BChat from '@/components/B2BChat';

import { useAccountProfile } from '@/hooks/useAccountProfile';
import { useAccountAddresses } from '@/hooks/useAccountAddresses';
import { useAccountOrders } from '@/hooks/useAccountOrders';
import { useLocaleHelpers } from '@/hooks/useLocaleHelpers';
import { getAccountTools } from '@/hooks/useAccountTools';
import { getAccountSummaryCards } from '@/hooks/useAccountSummary';
import { useAddressMigration } from '@/hooks/useAddressMigration';
import { useOrders } from '@/lib/orders-store';
import { useAdminStore } from '@/lib/admin-store';

import { useSavedAddresses } from '@/lib/saved-addresses-store';
import { getCurrentUser, readUsers, writeUsers, writeCurrentUser } from '@/lib/auth';
import { getLocaleFromLanguage } from '@/lib/utils';
import { useEffect, useState } from 'react';

import type { User } from '@/lib/auth';
import React from 'react';
import { ClipboardList } from 'lucide-react';

export default function AccountPage(): React.ReactElement {
    const { t, language, tl } = useLocaleHelpers();
    const [user, setUser] = useState<User | null>(null);
    const companyStore = useCompanyStore();
    const [loading, setLoading] = useState(true);
    const ordersStore = useOrders();
    const { getOrderStatus } = useAdminStore();
    const { getByEmail, replaceForEmail, upsertForEmail, deleteForEmail } = useSavedAddresses();
    const allOrders = ordersStore.orders;
    const locale = getLocaleFromLanguage(language);
    useEffect(() => {
        const currentUser = getCurrentUser();
        if (!currentUser) {
            setLoading(false);
            return;
        }
        setUser(currentUser as User);
        setLoading(false);
    }, []);
    const userOrders = allOrders.filter((o) => o.email === user?.email);
    const totalSpent = userOrders.reduce((sum, order) => sum + order.total, 0);
    const isAdmin = user?.platformRole === 'admin';
    useAddressMigration(user, userOrders, getByEmail, replaceForEmail);
    const profile = useAccountProfile(user, t, readUsers, writeUsers, writeCurrentUser);
    const addresses = useAccountAddresses(user, t, getByEmail, upsertForEmail, deleteForEmail);
    const [orderFilter, setOrderFilter] = useState<'all' | 'active' | 'completed'>('all');
    const orders = useAccountOrders(userOrders, getOrderStatus, orderFilter);
    const accountTools = getAccountTools(user, tl);
    const summaryCards = getAccountSummaryCards(
        t,
        tl,
        userOrders,
        addresses.savedAddresses,
        totalSpent,
        locale
    );

    // Возвраты только после всех хуков и useEffect
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

    return (
        <main className="w-full px-4 py-12">
            <div className="mx-auto max-w-7xl">
                <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
                    <aside className="xl:col-span-4">
                        <AccountProfileCard
                            user={{ ...user, cardNumber: company?.cardNumber }}
                            isEditing={profile.isEditingProfile}
                            profileDraft={profile.profileDraft}
                            profileErrors={profile.profileErrors}
                            onEdit={profile.startEditingProfile}
                            onCancel={profile.cancelEditingProfile}
                            onSave={profile.saveProfile}
                            onChange={(field, value) =>
                                profile.setProfileDraft({ ...profile.profileDraft, [field]: value })
                            }
                            t={t}
                            tl={tl}
                        />
                        <div className="mt-6">
                            <AccountSummaryCards summaryCards={summaryCards} />
                        </div>
                        {/* Уведомления удалены по запросу */}
                    </aside>
                    <div className="space-y-6 xl:col-span-8">
                        <AccountToolsSection accountTools={accountTools} />
                        {!isAdmin && (
                            <AccountAddressesSection
                                savedAddresses={addresses.savedAddresses}
                                isAddingAddress={addresses.isAddingAddress}
                                newAddressDraft={addresses.newAddressDraft}
                                newAddressErrors={addresses.newAddressErrors}
                                editingAddressId={addresses.editingAddressId}
                                addressDraft={addresses.addressDraft}
                                editAddressErrors={addresses.editAddressErrors}
                                onStartAdd={addresses.startAddingAddress}
                                onCancelAdd={addresses.cancelAddingAddress}
                                onSaveAdd={addresses.saveNewAddress}
                                onNewDraftChange={(field: string, value: string) => {
                                    if (!addresses.newAddressDraft?.id) return;
                                    addresses.setNewAddressDraft({
                                        ...addresses.newAddressDraft,
                                        [field]: value,
                                    });
                                }}
                                onStartEdit={addresses.startEditingAddress}
                                onCancelEdit={addresses.cancelEditingAddress}
                                onSaveEdit={addresses.saveEditingAddress}
                                onEditDraftChange={(field: string, value: string) => {
                                    if (!addresses.addressDraft?.id) return;
                                    addresses.setAddressDraft({
                                        ...addresses.addressDraft,
                                        [field]: value,
                                    });
                                }}
                                onDelete={(addressId) =>
                                    user?.email && deleteForEmail(user.email, addressId)
                                }
                                buildCheckoutAddressLink={() => '#'}
                                labels={{
                                    firstName: t('checkout.firstName'),
                                    lastName: t('checkout.lastName'),
                                    phone: t('checkout.phone'),
                                    address: t('checkout.address'),
                                    city: t('checkout.city'),
                                    postalCode: t('checkout.postalCode'),
                                    postalCodeLabel: t('order.postalCode'),
                                    useAddress: t('account.useAddress'),
                                    editAddress: t('account.editAddress'),
                                    deleteAddress: t('account.deleteAddress'),
                                    cancel: t('common.cancel'),
                                    save: t('common.save'),
                                    confirmTitle: t('confirm.title'),
                                    confirmDeleteAddress: t('account.confirmDeleteAddress'),
                                    delete: t('common.delete'),
                                }}
                                t={t}
                            />
                        )}
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
