'use client';
import React from 'react';
import { useAuthStore } from '@/lib/auth-store';
import ForceChangePasswordModal from '@/components/account/ForceChangePasswordModal';
import WelcomeModal from '@/components/account/WelcomeModal';

export default function AccountGuard({ children }: { children: React.ReactNode }) {
    const user = useAuthStore((s) => s.user);
    const isHydrated = useAuthStore((s) => s.isHydrated);

    if (!isHydrated) return null;

    return (
        <>
            {children}
            {user?.mustChangePassword && <ForceChangePasswordModal />}
            {user && !user.mustChangePassword && user.isNewUser && (
                <WelcomeModal user={user} />
            )}
        </>
    );
}
