'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AccountProfileCard from '@/components/account/AccountProfileCard';
import { AccountPasswordSection } from '@/components/account/AccountPasswordSection';
import { AccountDataSection } from '@/components/account/AccountDataSection';
import { useLocaleHelpers } from '@/hooks/useLocaleHelpers';
import { useAccountProfile } from '@/hooks/useAccountProfile';
import { readUsers, writeUsers, writeCurrentUser } from '@/lib/auth';
import { useAuthStore } from '@/lib/auth-store';

export default function AccountProfilePage(): React.ReactElement {
    const { t, tl } = useLocaleHelpers();
    const router = useRouter();
    const user = useAuthStore((state) => state.user);
    const isHydrated = useAuthStore((state) => state.isHydrated);

    useEffect(() => {
        if (isHydrated && !user) router.replace('/');
    }, [isHydrated, router, user]);

    const profile = useAccountProfile(user, t, readUsers, writeUsers, writeCurrentUser);

    useEffect(() => {
        if (user) {
            profile.startEditingProfile();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    if (!isHydrated) {
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
        <main className="w-full min-w-0 px-4 py-8 sm:py-12">
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

                <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-3 lg:items-stretch">
                    <div className="min-w-0 lg:col-span-2 flex flex-col [&>*]:flex-1">
                        <AccountProfileCard
                            user={user}
                            isEditing={profile.isEditingProfile}
                            profileDraft={profile.profileDraft}
                            profileErrors={profile.profileErrors}
                            onEdit={profile.startEditingProfile}
                            onCancel={profile.cancelEditingProfile}
                            onSave={profile.saveProfile}
                            onChange={(field, value) =>
                                profile.setProfileDraft((current) =>
                                    current ? { ...current, [field]: value } : current
                                )
                            }
                            t={t}
                            tl={tl}
                        />
                    </div>
                    <div className="min-w-0 lg:col-span-1 flex flex-col [&>*]:flex-1">
                        <AccountPasswordSection defaultOpen />
                    </div>
                </div>

                <div className="mt-6">
                    <AccountDataSection />
                </div>
            </div>
        </main>
    );
}
