import { useState } from 'react';
import { validateProfile } from '@/utils/accountValidation';

export function useAccountProfile(user: any, t: (key: string) => string, readUsers: any, writeUsers: any, writeCurrentUser: any) {
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [profileDraft, setProfileDraft] = useState<any>(null);
    const [profileErrors, setProfileErrors] = useState<any>({});

    const startEditingProfile = () => {
        setProfileDraft({
            name: user?.name || '',
            email: user?.email || '',
            password: '',
            companyName: user?.companyName || '',
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

    const saveProfile = () => {
        if (!profileDraft) return;
        const errors = validateProfile(profileDraft, t);
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
            email: profileDraft.email,
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
