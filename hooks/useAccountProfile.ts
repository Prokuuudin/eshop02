import { useState, type Dispatch, type SetStateAction } from 'react';
import { validateProfile } from '@/utils/accountValidation';
import type { User } from '@/lib/auth';
import type { CheckoutProfile } from '@/lib/auth-types';

const isInternalEmail = (email: string) => email.endsWith('@client.local');

export type ProfileDraft = {
    name: string;
    email: string;
    phone: string;
    password: string;
    companyName: string;
    avatarUrl: string;
} & CheckoutProfile;

const EMPTY_CHECKOUT_PROFILE: CheckoutProfile = {
    customerType: 'individual', personalCode: '', companyName: '', regNumber: '', vatNumber: '',
    legalAddress: '', bankName: '', iban: '', firstName: '', lastName: '', phone: '', address: '',
    city: '', postalCode: '',
};

type AccountProfileResult = {
    isEditingProfile: boolean;
    profileDraft: ProfileDraft | null;
    profileErrors: Record<string, string>;
    setProfileDraft: Dispatch<SetStateAction<ProfileDraft | null>>;
    setProfileErrors: Dispatch<SetStateAction<Record<string, string>>>;
    startEditingProfile: () => void;
    cancelEditingProfile: () => void;
    saveProfile: () => Promise<void>;
};

function useAccountProfileImpl(
    user: User | null,
    t: (key: string) => string,
    readUsers: () => User[],
    writeUsers: (users: User[]) => void,
    writeCurrentUser: (user: User) => void
): AccountProfileResult {
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [profileDraft, setProfileDraft] = useState<ProfileDraft | null>(null);
    const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});

    const startEditingProfile = () => {
        const nameParts = (user?.name || '').trim().split(/\s+/, 2);
        setProfileDraft({
            name: user?.name || '',
            email: isInternalEmail(user?.email || '') ? '' : (user?.email || ''),
            ...EMPTY_CHECKOUT_PROFILE,
            firstName: nameParts[0] || '',
            lastName: nameParts[1] || '',
            ...user?.checkoutProfile,
            phone: user?.checkoutProfile?.phone || user?.phone || '',
            password: '',
            companyName: user?.checkoutProfile?.companyName || (user?.companyId ? '' : (user?.companyName || '')),
            avatarUrl: user?.avatarUrl || '',
        });
        setProfileErrors({});
        setIsEditingProfile(true);
    };

    const cancelEditingProfile = () => {
        setIsEditingProfile(false);
        setProfileDraft(null);
        setProfileErrors({});
    };

    const saveProfile = async () => {
        if (!profileDraft || !user) return;
        const errors = validateProfile(profileDraft, t);
        if (Object.keys(errors).length > 0) {
            setProfileErrors(errors);
            return;
        }
        const normalizedEmail = profileDraft.email.trim().toLowerCase();
        try {
            const response = await fetch('/api/user/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: profileDraft.name,
                    email: normalizedEmail,
                    phone: profileDraft.phone,
                    avatarUrl: profileDraft.avatarUrl,
                    checkoutProfile: {
                        customerType: profileDraft.customerType,
                        personalCode: profileDraft.personalCode,
                        companyName: profileDraft.companyName,
                        regNumber: profileDraft.regNumber,
                        vatNumber: profileDraft.vatNumber,
                        legalAddress: profileDraft.legalAddress,
                        bankName: profileDraft.bankName,
                        iban: profileDraft.iban,
                        firstName: profileDraft.firstName,
                        lastName: profileDraft.lastName,
                        phone: profileDraft.phone,
                        address: profileDraft.address,
                        city: profileDraft.city,
                        postalCode: profileDraft.postalCode,
                    },
                }),
            });
            const result = await response.json().catch(() => ({})) as { error?: string };
            if (!response.ok) {
                const message = result.error === 'email_taken'
                    ? t('account.errors.emailTaken')
                    : result.error === 'invalid_email'
                        ? t('account.errors.emailInvalid')
                        : result.error === 'unauthorized'
                            ? t('account.errors.sessionExpired')
                            : t('account.errors.saveFailed');
                setProfileErrors({ email: message });
                return;
            }
        } catch {
            setProfileErrors({ email: t('account.errors.saveFailed') });
            return;
        }

        const users = readUsers();
        const idx = users.findIndex((candidate) => candidate.id === user.id);
        if (idx === -1) return;
        const updatedUser = {
            ...users[idx],
            name: profileDraft.name,
            email: normalizedEmail,
            phone: profileDraft.phone,
            companyName: profileDraft.companyName,
            avatarUrl: profileDraft.avatarUrl || users[idx].avatarUrl || '',
            checkoutProfile: {
                customerType: profileDraft.customerType, personalCode: profileDraft.personalCode,
                companyName: profileDraft.companyName, regNumber: profileDraft.regNumber,
                vatNumber: profileDraft.vatNumber, legalAddress: profileDraft.legalAddress,
                bankName: profileDraft.bankName, iban: profileDraft.iban, firstName: profileDraft.firstName,
                lastName: profileDraft.lastName, phone: profileDraft.phone, address: profileDraft.address,
                city: profileDraft.city, postalCode: profileDraft.postalCode,
            },
        };
        users[idx] = updatedUser;
        writeUsers(users);
        writeCurrentUser(updatedUser);
        setIsEditingProfile(false);
        setProfileDraft(null);
        setProfileErrors({});

        window.location.reload();
    };

    return {
        isEditingProfile,
        profileDraft,
        profileErrors,
        setProfileDraft,
        setProfileErrors,
        startEditingProfile,
        cancelEditingProfile,
        saveProfile,
    };
}

export const useAccountProfile: typeof useAccountProfileImpl = useAccountProfileImpl;
