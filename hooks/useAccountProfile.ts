import { useState } from 'react';
import { validateProfile } from '@/utils/accountValidation';

const isInternalEmail = (email: string) => email.endsWith('@client.local');

export function useAccountProfile(user: any, t: (key: string) => string, readUsers: any, writeUsers: any, writeCurrentUser: any) {
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [profileDraft, setProfileDraft] = useState<any>(null);
    const [profileErrors, setProfileErrors] = useState<any>({});

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
        if (!profileDraft) return;
        // Email is read-only in the form (the server has no verified email-change flow and
        // rejects any change), so it never enters the draft as editable — validate without it.
        const errors = validateProfile(profileDraft, t, true);
        if (Object.keys(errors).length > 0) {
            setProfileErrors(errors);
            return;
        }
        const users = readUsers();
        const idx = users.findIndex((u: any) => u.id === user.id);
        if (idx === -1) return;
        const updatedUser = {
            ...users[idx],
            name: profileDraft.name,
            // email intentionally NOT changed — keep the server-authoritative value so order
            // history (matched by email) stays in sync with the DB.
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

        // Only safe personal fields — never email or cardNumber (both server-rejected/ignored).
        try {
            await fetch('/api/user/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: updatedUser.name,
                    phone: updatedUser.phone,
                    avatarUrl: updatedUser.avatarUrl,
                }),
            });
        } catch {
            // localStorage already saved — non-critical if DB sync fails
        }

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
