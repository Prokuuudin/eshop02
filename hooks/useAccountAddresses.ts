import { useState } from 'react';
import { SavedAddress } from '@/lib/saved-addresses-store';
import { validateAddress } from '@/utils/accountValidation';

export function useAccountAddresses(user: any, t: (key: string) => string, getByEmail: any, upsertForEmail: any, deleteForEmail: any) {
    const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
    const [addressDraft, setAddressDraft] = useState<SavedAddress | null>(null);
    const [editAddressErrors, setEditAddressErrors] = useState<Record<string, string>>({});
    const [isAddingAddress, setIsAddingAddress] = useState(false);
    const [newAddressDraft, setNewAddressDraft] = useState<SavedAddress | null>(null);
    const [newAddressErrors, setNewAddressErrors] = useState<Record<string, string>>({});

    const savedAddresses = user?.email ? getByEmail(user.email) : [];

    const startEditingAddress = (address: SavedAddress): void => {
        setEditingAddressId(address.id);
        setAddressDraft({ ...address });
        setEditAddressErrors({});
    };

    const cancelEditingAddress = (): void => {
        setEditingAddressId(null);
        setAddressDraft(null);
        setEditAddressErrors({});
    };

    const saveEditingAddress = (): void => {
        if (!user?.email || !addressDraft) return;
        const validationErrors = validateAddress(addressDraft, t);
        if (Object.keys(validationErrors).length > 0) {
            setEditAddressErrors(validationErrors);
            return;
        }
        upsertForEmail(user.email, addressDraft);
        cancelEditingAddress();
    };

    const startAddingAddress = (): void => {
        if (!user?.email) return;
        setIsAddingAddress(true);
        setEditingAddressId(null);
        setAddressDraft(null);
        setNewAddressDraft({
            id: `addr_manual_${Date.now()}`,
            firstName: user.name ?? '',
            lastName: '',
            email: user.email,
            phone: '',
            address: '',
            city: '',
            postalCode: '',
        });
        setNewAddressErrors({});
    };

    const cancelAddingAddress = (): void => {
        setIsAddingAddress(false);
        setNewAddressDraft(null);
        setNewAddressErrors({});
    };

    const saveNewAddress = (): void => {
        if (!user?.email || !newAddressDraft) return;
        const validationErrors = validateAddress(newAddressDraft, t);
        if (Object.keys(validationErrors).length > 0) {
            setNewAddressErrors(validationErrors);
            return;
        }
        upsertForEmail(user.email, newAddressDraft);
        cancelAddingAddress();
    };

    return {
        editingAddressId,
        addressDraft,
        editAddressErrors,
        isAddingAddress,
        newAddressDraft,
        newAddressErrors,
        savedAddresses,
        setAddressDraft,
        setEditAddressErrors,
        setNewAddressDraft,
        setNewAddressErrors,
        startEditingAddress,
        cancelEditingAddress,
        saveEditingAddress,
        startAddingAddress,
        cancelAddingAddress,
        saveNewAddress,
    };
}
