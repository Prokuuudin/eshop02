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
        const emailOptional = isInternalEmail(user?.email || '');
        const errors = validateProfile(profileDraft, t, emailOptional);
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
            email: profileDraft.email.trim() || users[idx].email,
            phone: profileDraft.phone,
            companyName: profileDraft.companyName,
            password: profileDraft.password ? profileDraft.password : users[idx].password,
            avatarUrl: profileDraft.avatarUrl || users[idx].avatarUrl || '',
        };
        users[idx] = updatedUser;
        writeUsers(users);
        writeCurrentUser(updatedUser);
        setIsEditingProfile(false);
        setProfileDraft(null);
        setProfileErrors({});

        // Await DB sync so email update lands before reload — fire-then-reload pattern
        // was broken: reload() cancelled the in-flight fetch before it reached the server
        try {
            const res = await fetch('/api/user/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: updatedUser.name,
                    email: updatedUser.email,
                    phone: updatedUser.phone,
                    avatarUrl: updatedUser.avatarUrl,
                    cardNumber: updatedUser.cardNumber,
                }),
            });
            if (res.status === 409) {
                console.warn('[profile] email already in use in DB, skipping DB update');
            }
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
