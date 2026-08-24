'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
    canAccessAdminPanel,
    getAdminAccessLevel,
    hasAdminUsers,
    type AdminAccessLevel,
} from '@/lib/auth';
import { useAuthStore } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';

type AdminGateProps = {
    children: React.ReactNode;
    access?: 'partial' | 'full';
};

export default function AdminGate({
    children,
    access = 'full',
}: AdminGateProps): React.ReactElement {
    const router = useRouter();
    const { language } = useTranslation();
    const user = useAuthStore((s) => s.user);
    const isHydrated = useAuthStore((s) => s.isHydrated);
    const accessLevel: AdminAccessLevel = user ? getAdminAccessLevel(user) : 'none';
    const status: 'loading' | 'allowed' | 'forbidden' | 'unauthenticated' | 'setup-required' =
        !isHydrated
            ? 'loading'
            : !user
            ? hasAdminUsers()
                ? 'unauthenticated'
                : 'setup-required'
            : access === 'full'
            ? accessLevel === 'admin'
                ? 'allowed'
                : 'forbidden'
            : canAccessAdminPanel(user)
            ? 'allowed'
            : 'forbidden';

    const labels = {
        ru: {
            loading: 'Проверка доступа к админке...',
            loginRequired: 'Требуется вход',
            loginRedirect:
                'Выполняется переход на страницу авторизации. Если переход не сработал, откройте вход вручную.',
            goToLogin: 'Перейти ко входу',
            setupRequired: 'Нужна первичная настройка',
            setupRedirect:
                'Выполняется переход на страницу создания администратора. Если переход не сработал, откройте ее вручную.',
            openSetup: 'Открыть настройку администратора',
            noRole: 'без роли',
            adminRole: 'администратор',
            managerRole: 'менеджер',
            forbidden: 'Доступ запрещен',
            needFullAccess: 'Для входа нужен полный доступ администратора.',
            needPartialAccess: 'Для входа нужна роль менеджера или администратора.',
            goToAccount: 'Перейти в аккаунт',
            fullAccessWithUser: (email: string, role: string) =>
                `Пользователь ${email} имеет роль ${role}. Для этого раздела нужен полный доступ администратора.`,
            partialAccessWithUser: (email: string) =>
                `Пользователь ${email} не имеет доступа к админ-панели.`,
        },
        en: {
            loading: 'Checking admin access...',
            loginRequired: 'Sign in required',
            loginRedirect:
                'Redirecting to the sign-in page. If it does not work, open login manually.',
            goToLogin: 'Go to login',
            setupRequired: 'Initial setup required',
            setupRedirect:
                'Redirecting to admin setup page. If it does not work, open it manually.',
            openSetup: 'Open admin setup',
            noRole: 'no role',
            adminRole: 'administrator',
            managerRole: 'manager',
            forbidden: 'Access denied',
            needFullAccess: 'Full administrator access is required.',
            needPartialAccess: 'Manager or administrator role is required.',
            goToAccount: 'Go to account',
            fullAccessWithUser: (email: string, role: string) =>
                `User ${email} has role ${role}. Full administrator access is required for this section.`,
            partialAccessWithUser: (email: string) =>
                `User ${email} has no access to the admin panel.`,
        },
        lv: {
            loading: 'Pārbauda administratora piekļuvi...',
            loginRequired: 'Nepieciešama pieteikšanās',
            loginRedirect:
                'Notiek novirzīšana uz pieteikšanās lapu. Ja tā nedarbojas, atveriet pieteikšanās lapu manuāli.',
            goToLogin: 'Doties uz pieteikšanos',
            setupRequired: 'Nepieciešama sākotnējā iestatīšana',
            setupRedirect:
                'Notiek novirzīšana uz administratora iestatīšanas lapu. Ja tā nedarbojas, atveriet to manuāli.',
            openSetup: 'Atvērt administratora iestatīšanu',
            noRole: 'bez lomas',
            adminRole: 'administrators',
            managerRole: 'vadītājs',
            forbidden: 'Piekļuve liegta',
            needFullAccess: 'Nepieciešama pilna administratora piekļuve.',
            needPartialAccess: 'Nepieciešama vadītāja vai administratora loma.',
            goToAccount: 'Doties uz kontu',
            fullAccessWithUser: (email: string, role: string) =>
                `Lietotājam ${email} ir loma ${role}. Šai sadaļai nepieciešama pilna administratora piekļuve.`,
            partialAccessWithUser: (email: string) =>
                `Lietotājam ${email} nav piekļuves administratora panelim.`,
        },
    }[language];

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.replace('/auth/login');
        }
        if (status === 'setup-required') {
            router.replace('/auth/admin-setup');
        }
    }, [router, status]);

    if (status === 'loading') {
        return (
            <main className="max-w-md mx-auto px-4 py-12">
                <div className="rounded-lg border border-border p-8 bg-card text-center text-sm text-muted-foreground">
                    {labels.loading}
                </div>
            </main>
        );
    }

    if (status === 'unauthenticated') {
        return (
            <main className="max-w-md mx-auto px-4 py-12">
                <div className="rounded-lg border border-border p-8 bg-card text-center">
                    <h1 className="text-2xl font-bold mb-3 text-foreground">
                        {labels.loginRequired}
                    </h1>
                    <p className="text-sm text-muted-foreground mb-4">{labels.loginRedirect}</p>
                    <Link href="/auth/login">
                        <Button variant="outline">{labels.goToLogin}</Button>
                    </Link>
                </div>
            </main>
        );
    }

    if (status === 'setup-required') {
        return (
            <main className="max-w-md mx-auto px-4 py-12">
                <div className="rounded-lg border border-border p-8 bg-card text-center">
                    <h1 className="text-2xl font-bold mb-3 text-foreground">
                        {labels.setupRequired}
                    </h1>
                    <p className="text-sm text-muted-foreground mb-4">{labels.setupRedirect}</p>
                    <Link href="/auth/admin-setup">
                        <Button variant="outline">{labels.openSetup}</Button>
                    </Link>
                </div>
            </main>
        );
    }

    if (status === 'forbidden') {
        const roleLabel =
            accessLevel === 'admin'
                ? labels.adminRole
                : accessLevel === 'manager'
                ? labels.managerRole
                : labels.noRole;

        return (
            <main className="max-w-md mx-auto px-4 py-12">
                <div className="rounded-lg border border-border p-8 bg-card text-center">
                    <h1 className="text-2xl font-bold mb-3 text-foreground">{labels.forbidden}</h1>
                    <p className="text-sm text-muted-foreground mb-4">
                        {access === 'full'
                            ? user?.email
                                ? labels.fullAccessWithUser(user.email, roleLabel)
                                : labels.needFullAccess
                            : user?.email
                            ? labels.partialAccessWithUser(user.email)
                            : labels.needPartialAccess}
                    </p>
                    <Link href="/account">
                        <Button variant="outline">{labels.goToAccount}</Button>
                    </Link>
                </div>
            </main>
        );
    }

    return <>{children}</>;
}
