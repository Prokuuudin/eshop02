import { useState, type Dispatch, type SetStateAction } from 'react';
import { validateProfile } from '@/utils/accountValidation';
import type { User } from '@/lib/auth';

const isInternalEmail = (email: string) => email.endsWith('@client.local');

type ProfileDraft = {
    name: string;
    email: string;
    phone: string;
    password: string;
    companyName: string;
    avatarUrl: string;
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
        setProfileDraft({
            name: user?.name || '',
            email: isInternalEmail(user?.email || '') ? '' : (user?.email || ''),
            phone: user?.phone || '',
            password: '',
            companyName: user?.companyId ? '' : (user?.companyName || ''),
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
