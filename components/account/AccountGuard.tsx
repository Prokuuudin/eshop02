'use client';
import React from 'react';
import { useAuthStore } from '@/lib/auth-store';
import ForceChangePasswordModal from '@/components/account/ForceChangePasswordModal';
import PasswordChangeBanner from '@/components/account/PasswordChangeBanner';
import WelcomeModal from '@/components/account/WelcomeModal';

export default function AccountGuard({ children }: { children: React.ReactNode }): React.ReactElement | null {
    const user = useAuthStore((s) => s.user);
    const isHydrated = useAuthStore((s) => s.isHydrated);

    const soft = !!user?.passwordChangeSoft;

    return (
        <>
            {isHydrated && user && user.mustChangePassword && soft && <PasswordChangeBanner userId={user.id} />}
            {children}
            {isHydrated && user?.mustChangePassword && !soft && <ForceChangePasswordModal />}
            {isHydrated && user && !user.mustChangePassword && user.isNewUser && (
                <WelcomeModal user={user} />
            )}
        </>
    );
}
