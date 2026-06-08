'use client';
import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { canAccessAdminPanel, getCurrentUser, hasAdminUsers, loginUserAuto } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from '@/lib/use-translation';

export default function LoginForm({
    onSuccess,
    onForgotPassword,
    onClose,
}: {
    onSuccess?: () => void;
    onForgotPassword?: () => void;
    onClose?: () => void;
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { t } = useTranslation();
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [setupRequired, setSetupRequired] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [confirmed, setConfirmed] = useState(false);

    useEffect(() => {
        setSetupRequired(!hasAdminUsers());
        if (searchParams.get('confirmed') === '1') setConfirmed(true);
    }, [searchParams]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const res = loginUserAuto(identifier.trim(), password);
        if (!res.success) return setError(res.error || t('form.error'));
        setError('');
        const loggedInUser = getCurrentUser();
        if (onSuccess) { onSuccess(); return; }
        const redirect = searchParams.get('redirect');
        if (redirect) return router.push(redirect);
        router.push('/account');
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="space-y-3 bg-white dark:bg-gray-900 p-3 rounded-lg"
        >
            {confirmed && (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                    E-mail подтверждён! Войдите с номером карты и паролем.
                </p>
            )}
            {error && <p className="text-red-600 dark:text-red-400 mb-2">{error}</p>}
            <div>
                <label className="block mb-1 text-sm text-gray-900 dark:text-gray-100">
                    {t('auth.clientCardNumber', 'Номер карты')}
                </label>
                <Input
                    type="text"
                    className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={t('auth.cardNumberPlaceholder', '0000')}
                    maxLength={20}
                    required
                />
            </div>
            <div>
                <label className="block mb-1 text-sm text-gray-900 dark:text-gray-100">
                    {t('auth.password')}
                </label>
                <div className="relative flex items-center">
                    <Input
                        type={showPassword ? 'text' : 'password'}
                        className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700 pr-10"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                    <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400"
                        tabIndex={-1}
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={
                            showPassword ? t('account.hidePassword') : t('account.showPassword')
                        }
                    >
                        {showPassword ? (
                            <EyeOff className="w-5 h-5" />
                        ) : (
                            <Eye className="w-5 h-5" />
                        )}
                    </button>
                </div>
                <div className="mt-2 text-right">
                    {onForgotPassword ? (
                        <button
                            type="button"
                            onClick={onForgotPassword}
                            className="text-sm text-indigo-600 hover:text-indigo-700 hover:underline"
                        >
                            {t('auth.forgotPassword')}
                        </button>
                    ) : (
                        <Link
                            href="/auth/forgot-password"
                            className="text-sm text-indigo-600 hover:text-indigo-700 hover:underline"
                        >
                            {t('auth.forgotPassword')}
                        </Link>
                    )}
                </div>
            </div>
            <div className="flex gap-2">
                <Button type="submit" className="flex-1">
                    {t('auth.login')}
                </Button>
                {onClose && (
                    <Button type="button" variant="outline" onClick={onClose}>
                        {t('common.close')}
                    </Button>
                )}
            </div>
            {setupRequired && (
                <p className="text-sm text-center text-amber-700 dark:text-amber-400">
                    Первый администратор ещё не создан.
                    <Link href="/auth/admin-setup" className="ml-2 underline underline-offset-2">
                        Открыть первичную настройку
                    </Link>
                </p>
            )}
        </form>
    );
}
