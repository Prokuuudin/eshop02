import React from 'react';
import { MapPin, Plus } from 'lucide-react';
import AccountAddressCard from '@/components/account/AccountAddressCard';
import { AddressFormDialog } from '@/components/account/AddressFormDialog';
import { SavedAddress } from '@/lib/saved-addresses-store';

interface AccountAddressesSectionProps {
    savedAddresses: SavedAddress[];
    isAddingAddress: boolean;
    newAddressDraft: SavedAddress | null;
    newAddressErrors: Record<string, string>;
    editingAddressId: string | null;
    addressDraft: SavedAddress | null;
    editAddressErrors: Record<string, string>;
    onStartAdd: () => void;
    onCancelAdd: () => void;
    onSaveAdd: () => void;
    onNewDraftChange: (field: string, value: string) => void;
    onStartEdit: (address: SavedAddress) => void;
    onCancelEdit: () => void;
    onSaveEdit: () => void;
    onEditDraftChange: (field: string, value: string) => void;
    onDelete: (addressId: string) => void;
    buildCheckoutAddressLink: (address: SavedAddress) => string;
    labels: {
        firstName: string;
        lastName: string;
        phone: string;
        address: string;
        city: string;
        postalCode: string;
        postalCodeLabel: string;
        useAddress: string;
        editAddress: string;
        deleteAddress: string;
        cancel: string;
        save: string;
        confirmTitle: string;
        confirmDeleteAddress: string;
        delete: string;
    };
    t: (key: string) => string;
}

const AccountAddressesSection: React.FC<AccountAddressesSectionProps> = ({
    savedAddresses,
    isAddingAddress,
    newAddressDraft,
    newAddressErrors,
    editingAddressId,
    addressDraft,
    editAddressErrors,
    onStartAdd,
    onCancelAdd,
    onSaveAdd,
    onNewDraftChange,
    onStartEdit,
    onCancelEdit,
    onSaveEdit,
    onEditDraftChange,
    onDelete,
    buildCheckoutAddressLink,
    labels,
    t,
}) => (
    <section className="account-addresses rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
        {/* Заголовок */}
        <div className="account-addresses__header flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
                    <MapPin className="h-4 w-4" />
                </div>
                <h2 className="text-sm font-semibold text-foreground">
                    {t('account.savedAddressesTitle')}
                </h2>
            </div>
            <button
                onClick={onStartAdd}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
            >
                <Plus className="h-3.5 w-3.5" />
                {t('account.addAddress')}
            </button>
        </div>

        {/* Список */}
        {savedAddresses.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {savedAddresses.slice(0, 5).map((addressItem) => (
                    <AccountAddressCard
                        key={addressItem.id}
                        addressItem={addressItem}
                        isEditing={editingAddressId === addressItem.id}
                        draft={editingAddressId === addressItem.id ? addressDraft : null}
                        errors={editAddressErrors}
                        checkoutHref={buildCheckoutAddressLink(addressItem)}
                        labels={labels}
                        onDraftChange={onEditDraftChange}
                        onCancel={onCancelEdit}
                        onSave={onSaveEdit}
                        onStartEdit={() => onStartEdit(addressItem)}
                        onDelete={() => onDelete(addressItem.id)}
                    />
                ))}
            </div>
        ) : (
            <div className="account-addresses__empty flex flex-col items-center gap-2 py-8 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <MapPin className="h-5 w-5 text-gray-400" />
                </div>
                <p className="text-sm text-muted-foreground">
                    {t('account.noSavedAddresses')}
                </p>
            </div>
        )}

        {isAddingAddress && newAddressDraft && (
            <AddressFormDialog
                open={isAddingAddress}
                onOpenChange={(open) => { if (!open) onCancelAdd(); }}
                title={t('account.addAddress')}
                draft={newAddressDraft}
                errors={newAddressErrors}
                onDraftChange={onNewDraftChange}
                onSave={onSaveAdd}
                onCancel={onCancelAdd}
                labels={labels}
            />
        )}
    </section>
);

export default AccountAddressesSection;
