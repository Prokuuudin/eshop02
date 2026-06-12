'use client';
import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogClose,
} from './ui/dialog';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { canAccessAdminPanel, getCurrentUser, hasAdminUsers, logout, type User } from '@/lib/auth';
import { Button } from './ui/button';
import { useTranslation } from '@/lib/use-translation';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

import Image from 'next/image';
import RegisterForm from './auth/RegisterForm';
import RegisterSwitcher from './auth/RegisterSwitcher';
import { IconClose } from './ui/icon-close';
import LoginForm from './auth/LoginForm';
import ForgotPasswordForm from './auth/ForgotPasswordForm';

export default function UserMenu() {
    const [user, setUser] = useState<User | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [registerOpen, setRegisterOpen] = useState(false);
    const [loginOpen, setLoginOpen] = useState(false);
    const [forgotOpen, setForgotOpen] = useState(false);
    const [setupRequired, setSetupRequired] = useState(false);
    const router = useRouter();
    const { t } = useTranslation();

    useEffect(() => {
        const syncUser = () => {
            const currentUser = getCurrentUser();
            setUser(currentUser);
            setSetupRequired(!hasAdminUsers());
        };

        syncUser();
        window.addEventListener('eshop-user-changed', syncUser as EventListener);
        return () => window.removeEventListener('eshop-user-changed', syncUser as EventListener);
    }, []);

    const handleLoginSuccess = () => {
        const currentUser = getCurrentUser();
        setUser(currentUser);
        setLoginOpen(false);
        setForgotOpen(false);
        setIsOpen(false);
        if (currentUser && canAccessAdminPanel(currentUser)) {
            router.push('/account');
        }
    };

    const handleOpenForgotPassword = (): void => {
        setLoginOpen(false);
        setForgotOpen(true);
    };

    const handleLogout = () => {
        logout();
        setUser(null);
        router.push('/');
    };

    const menuRef = React.useRef<HTMLDivElement>(null);
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const [dropPos, setDropPos] = React.useState<{ top: number; left: number } | null>(null);

    React.useEffect(() => {
        if (!isOpen) return;
        function handleClick(e: MouseEvent) {
            if (loginOpen || registerOpen || forgotOpen) {
                return;
            }
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [isOpen, loginOpen, registerOpen, forgotOpen]);

    // Диалоги логина/регистрации монтируются всегда, чтобы открываться из любой точки
    const dialogs = (
        <>
            <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('auth.login')}</DialogTitle>
                    </DialogHeader>
                    <LoginForm
                        onSuccess={handleLoginSuccess}
                        onForgotPassword={handleOpenForgotPassword}
                        onClose={() => setLoginOpen(false)}
                    />
                </DialogContent>
            </Dialog>
            <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('auth.resetPassword')}</DialogTitle>
                    </DialogHeader>
                    <ForgotPasswordForm />
                    <DialogClose asChild>
                        <Button variant="outline" className="mt-4 w-full">
                            {t('common.close')}
                        </Button>
                    </DialogClose>
                </DialogContent>
            </Dialog>
            <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
                <DialogContent>
                    <DialogTitle className="sr-only">{t('auth.register')}</DialogTitle>
                    <RegisterSwitcher onClose={() => setRegisterOpen(false)} />
                </DialogContent>
            </Dialog>
        </>
    );

    if (!user) {
        return (
            <div className="user-menu flex items-center gap-2">
                {dialogs}
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLoginOpen(true)}
                >
                    {t('auth.login')}
                </Button>
                <Button
                    size="sm"
                    onClick={() => setRegisterOpen(true)}
                >
                    {t('auth.registerButton', t('auth.register'))}
                </Button>
                {setupRequired && (
                    <Link
                        href="/auth/admin-setup"
                        className="text-xs text-amber-700 dark:text-amber-400 hover:underline"
                    >
                        Настройка admin
                    </Link>
                )}
            </div>
        );
    }

    return (
        <div className="user-menu relative" ref={menuRef}>
            {dialogs}
            <TooltipProvider delayDuration={150}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            ref={triggerRef}
                            onClick={() => {
                                if (!isOpen && triggerRef.current) {
                                    const r = triggerRef.current.getBoundingClientRect();
                                    const w = 192;
                                    const left = Math.min(r.left, window.innerWidth - w - 8);
                                    setDropPos({ top: r.bottom + 4, left: Math.max(8, left) });
                                }
                                setIsOpen(!isOpen);
                            }}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                            aria-label={t('userMenu.aria')}
                        >
                            {user.avatarUrl ? (
                                <Image
                                    src={user.avatarUrl}
                                    alt={user.name || 'avatar'}
                                    width={28}
                                    height={28}
                                    className="rounded-full object-cover w-7 h-7 border border-border bg-white"
                                />
                            ) : (
                                <svg
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5z"
                                        stroke="currentColor"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                    <path
                                        d="M4 20c0-4 4-7 8-7s8 3 8 7"
                                        stroke="currentColor"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            )}
                            <span className="text-sm font-medium hidden sm:inline text-foreground">
                                {user.name || user.email.split('@')[0]}
                            </span>
                        </button>
                    </TooltipTrigger>
                    <TooltipContent>{t('nav.account')}</TooltipContent>
                </Tooltip>
            </TooltipProvider>

            {isOpen && dropPos && (
                <div
                    style={{ position: 'fixed', top: dropPos.top, left: dropPos.left }}
                    className="w-48 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-border z-[10002]"
                >
                    <nav className="py-2">
                        <Link
                            href="/account"
                            onClick={() => setIsOpen(false)}
                            className="block px-4 py-1 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm text-foreground"
                        >
                            {canAccessAdminPanel(user) ? t('nav.dashboard', 'Дашборд') : t('account.title')}
                        </Link>
                        <Link
                            href="/account/profile"
                            onClick={() => setIsOpen(false)}
                            className="block px-4 py-1 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm text-foreground"
                        >
                            {canAccessAdminPanel(user) ? t('account.profile', 'Профиль') : t('account.myProfile', 'Мой профиль')}
                        </Link>
                        {canAccessAdminPanel(user) && (
                            <Link
                                href="/admin"
                                onClick={() => setIsOpen(false)}
                                className="block px-4 py-1 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm text-foreground"
                            >
                                {t('nav.admin')}
                            </Link>
                        )}
                    </nav>
                    <div className="border-t px-4 py-2 border-border">
                        <Button
                            onClick={handleLogout}
                            variant="outline"
                            className="w-full text-sm"
                            size="sm"
                        >
                            {t('auth.logout')}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
