import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import AccountAddressCard from '@/components/account/AccountAddressCard';
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
    labels: any;
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
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
            <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {t('account.savedAddressesTitle')}
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    {t('account.page.savedAddressesHint')}
                </p>
            </div>
            {!isAddingAddress && (
                <button
                    className="text-sm text-indigo-600 dark:text-indigo-300"
                    onClick={onStartAdd}
                >
                    {t('account.addAddress')}
                </button>
            )}
        </div>
        {isAddingAddress && newAddressDraft && (
            <div className="mb-4 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                <div className="account-address__fields grid grid-cols-1 gap-2 md:grid-cols-2">
                    <Input
                        className={`account-address__input ${
                            newAddressErrors.firstName
                                ? 'account-address__input--error border-red-500'
                                : ''
                        }`}
                        value={newAddressDraft.firstName}
                        onChange={(e) => onNewDraftChange('firstName', e.target.value)}
                        placeholder={labels.firstName}
                    />
                    {newAddressErrors.firstName && (
                        <p className="account-address__error text-red-600 text-xs">
                            {newAddressErrors.firstName}
                        </p>
                    )}
                    <Input
                        className={`account-address__input ${
                            newAddressErrors.lastName
                                ? 'account-address__input--error border-red-500'
                                : ''
                        }`}
                        value={newAddressDraft.lastName}
                        onChange={(e) => onNewDraftChange('lastName', e.target.value)}
                        placeholder={labels.lastName}
                    />
                    {newAddressErrors.lastName && (
                        <p className="account-address__error text-red-600 text-xs">
                            {newAddressErrors.lastName}
                        </p>
                    )}
                    <Input
                        className={`account-address__input ${
                            newAddressErrors.phone
                                ? 'account-address__input--error border-red-500'
                                : ''
                        }`}
                        value={newAddressDraft.phone}
                        onChange={(e) => onNewDraftChange('phone', e.target.value)}
                        placeholder={labels.phone}
                    />
                    {newAddressErrors.phone && (
                        <p className="account-address__error text-red-600 text-xs">
                            {newAddressErrors.phone}
                        </p>
                    )}
                    <Input
                        className={`account-address__input ${
                            newAddressErrors.address
                                ? 'account-address__input--error border-red-500'
                                : ''
                        }`}
                        value={newAddressDraft.address}
                        onChange={(e) => onNewDraftChange('address', e.target.value)}
                        placeholder={labels.address}
                    />
                    {newAddressErrors.address && (
                        <p className="account-address__error text-red-600 text-xs">
                            {newAddressErrors.address}
                        </p>
                    )}
                    <Input
                        className={`account-address__input ${
                            newAddressErrors.city
                                ? 'account-address__input--error border-red-500'
                                : ''
                        }`}
                        value={newAddressDraft.city}
                        onChange={(e) => onNewDraftChange('city', e.target.value)}
                        placeholder={labels.city}
                    />
                    {newAddressErrors.city && (
                        <p className="account-address__error text-red-600 text-xs">
                            {newAddressErrors.city}
                        </p>
                    )}
                    <Input
                        className="account-address__input"
                        value={newAddressDraft.postalCode ?? ''}
                        onChange={(e) => onNewDraftChange('postalCode', e.target.value)}
                        placeholder={labels.postalCode}
                    />
                </div>
                <div className="flex gap-2 mt-2">
                    <Button size="sm" variant="outline" onClick={onCancelAdd}>
                        {labels.cancel}
                    </Button>
                    <Button size="sm" onClick={onSaveAdd}>
                        {labels.save}
                    </Button>
                </div>
            </div>
        )}
        {savedAddresses.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
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
            <p className="text-sm text-gray-500 dark:text-gray-300">
                {t('account.noSavedAddresses')}
            </p>
        )}
    </section>
);

export default AccountAddressesSection;
