'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AccountProfileCard from '@/components/account/AccountProfileCard';
import { AccountPasswordSection } from '@/components/account/AccountPasswordSection';
import { useLocaleHelpers } from '@/hooks/useLocaleHelpers';
import { useAccountProfile } from '@/hooks/useAccountProfile';
import { getCurrentUser, readUsers, writeUsers, writeCurrentUser } from '@/lib/auth';
import type { User } from '@/lib/auth';

export default function AccountProfilePage(): React.ReactElement {
    const { t, tl } = useLocaleHelpers();
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const currentUser = getCurrentUser();
        if (!currentUser) {
            router.replace('/');
            return;
        }
        setUser(currentUser as User);
        setLoading(false);
    }, [router]);

    const profile = useAccountProfile(user, t, readUsers, writeUsers, writeCurrentUser);

    useEffect(() => {
        if (user) {
            profile.startEditingProfile();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    if (loading) {
        return (
            <main className="w-full px-4 py-12">
                <p className="text-muted-foreground">{t('common.loading')}</p>
            </main>
        );
    }

    if (!user) {
        return (
            <main className="w-full px-4 py-12">
                <p className="text-muted-foreground">{t('account.authRequired')}</p>
            </main>
        );
    }

    return (
        <main className="w-full px-4 py-12">
            <div className="mx-auto max-w-6xl">
                <div className="mb-6">
                    <Link
                        href="/account"
                        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 active:bg-primary/80 transition-colors"
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        {t('account.goToAccount')}
                    </Link>
                </div>
                <h1 className="mb-1 text-2xl font-bold text-foreground">
                    {t('account.myProfile')}
                </h1>
                <p className="mb-6 text-sm text-muted-foreground">
                    {t('account.profileHint')}
                </p>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-stretch">
                    <div className="lg:col-span-2 flex flex-col [&>*]:flex-1">
                        <AccountProfileCard
                            user={user}
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
                    </div>
                    <div className="lg:col-span-1 flex flex-col [&>*]:flex-1">
                        <AccountPasswordSection defaultOpen />
                    </div>
                </div>
            </div>
        </main>
    );
}
