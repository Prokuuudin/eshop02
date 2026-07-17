'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MapPin, Plus, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AccountAddressCard from '@/components/account/AccountAddressCard';
import { AddressFormDialog } from '@/components/account/AddressFormDialog';
import { getCurrentUser } from '@/lib/auth';
import type { SavedAddress } from '@/lib/saved-addresses-store';

function buildCheckoutUrl(a: SavedAddress): string {
    const p = new URLSearchParams();
    if (a.firstName)  p.set('firstName',  a.firstName);
    if (a.lastName)   p.set('lastName',   a.lastName);
    if (a.phone)      p.set('phone',      a.phone);
    if (a.address)    p.set('address',    a.address);
    if (a.city)       p.set('city',       a.city);
    if (a.postalCode) p.set('postalCode', a.postalCode);
    return `/checkout?${p.toString()}`;
}
import { useSavedAddresses, hydrateSavedAddressesFromServer } from '@/lib/saved-addresses-store';
import { useAccountAddresses } from '@/hooks/useAccountAddresses';
import { useLocaleHelpers } from '@/hooks/useLocaleHelpers';

export default function AccountAddressesPage() {
    const { t } = useLocaleHelpers();
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const { getByEmail, upsertForEmail, deleteForEmail, replaceForEmail } = useSavedAddresses();

    useEffect(() => {
        const u = getCurrentUser();
        if (!u) { router.replace('/auth/login'); return; }
        setUser(u);
    }, [router]);

    useEffect(() => {
        if (user?.email) void hydrateSavedAddressesFromServer(user.email, replaceForEmail);
    }, [user?.email, replaceForEmail]);

    const addresses = useAccountAddresses(user, t, getByEmail, upsertForEmail);

    if (!user) return null;

    const labels = {
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
    };

    return (
        <main className="w-full max-w-3xl mx-auto px-4 py-10">
            {/* Шапка */}
            <div className="mb-8">
                <Link
                    href="/account"
                    className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors mb-4"
                >
                    <ArrowLeft className="w-4 h-4" />
                    {t('common.back')}
                </Link>
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
                            <MapPin className="h-5 w-5" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-foreground">
                                {t('account.savedAddressesTitle')}
                            </h1>
                            {addresses.savedAddresses.length > 0 && (
                                <p className="text-sm text-muted-foreground">
                                    {addresses.savedAddresses.length} {t('account.addressCount')}
                                </p>
                            )}
                        </div>
                    </div>
                    <Button
                        onClick={addresses.startAddingAddress}
                        className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                    >
                        <Plus className="h-4 w-4" />
                        {t('account.addAddress')}
                    </Button>
                </div>
            </div>

            {/* Список */}
            {addresses.savedAddresses.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {addresses.savedAddresses.map((addressItem: SavedAddress) => (
                        <AccountAddressCard
                            key={addressItem.id}
                            addressItem={addressItem}
                            isEditing={addresses.editingAddressId === addressItem.id}
                            draft={addresses.editingAddressId === addressItem.id ? addresses.addressDraft : null}
                            errors={addresses.editAddressErrors}
                            checkoutHref={buildCheckoutUrl(addressItem)}
                            labels={labels}
                            onDraftChange={(field, value) => {
                                if (!addresses.addressDraft?.id) return;
                                addresses.setAddressDraft({ ...addresses.addressDraft, [field]: value });
                            }}
                            onCancel={addresses.cancelEditingAddress}
                            onSave={addresses.saveEditingAddress}
                            onStartEdit={() => addresses.startEditingAddress(addressItem)}
                            onDelete={() => deleteForEmail(user.email, addressItem.id)}
                        />
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center gap-4 py-20 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                        <MapPin className="h-8 w-8 text-gray-400" />
                    </div>
                    <div>
                        <p className="text-base font-medium text-gray-700 dark:text-gray-300">
                            {t('account.noSavedAddresses')}
                        </p>
                        <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
                            {t('account.page.savedAddressesHint')}
                        </p>
                    </div>
                    <Button onClick={addresses.startAddingAddress} className="gap-2 bg-emerald-600 hover:bg-emerald-700 mt-2">
                        <Plus className="h-4 w-4" />
                        {t('account.addAddress')}
                    </Button>
                </div>
            )}

            {/* Диалог добавления */}
            {addresses.isAddingAddress && addresses.newAddressDraft && (
                <AddressFormDialog
                    open={addresses.isAddingAddress}
                    onOpenChange={(open) => { if (!open) addresses.cancelAddingAddress(); }}
                    title={t('account.addAddress')}
                    draft={addresses.newAddressDraft}
                    errors={addresses.newAddressErrors}
                    onDraftChange={(field, value) => {
                        if (!addresses.newAddressDraft?.id) return;
                        addresses.setNewAddressDraft({ ...addresses.newAddressDraft, [field]: value });
                    }}
                    onSave={addresses.saveNewAddress}
                    onCancel={addresses.cancelAddingAddress}
                    labels={labels}
                />
            )}
        </main>
    );
}
