'use client';
import React, { useEffect, useState } from 'react';
import { getCurrentUser, type User } from '@/lib/auth';
import ForceChangePasswordModal from '@/components/account/ForceChangePasswordModal';
import WelcomeModal from '@/components/account/WelcomeModal';

export default function AccountGuard({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [ready, setReady] = useState(false);

    const sync = () => {
        setUser(getCurrentUser());
        setReady(true);
    };

    useEffect(() => {
        sync();
        window.addEventListener('eshop-user-changed', sync);
        return () => window.removeEventListener('eshop-user-changed', sync);
    }, []);

    if (!ready) return null;

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
