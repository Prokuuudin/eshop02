'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { hasAdminUsers, loginUser } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from '@/lib/use-translation';

export default function LoginForm({
    onSuccess,
    onForgotPassword,
}: {
    onSuccess?: () => void;
    onForgotPassword?: () => void;
}) {
    const router = useRouter();
    const { t } = useTranslation();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [setupRequired, setSetupRequired] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        setSetupRequired(!hasAdminUsers());
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const res = loginUser(email.trim(), password);
        if (!res.success) return setError(res.error || t('form.error'));
        setError('');
        if (onSuccess) onSuccess();
        router.push('/');
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="space-y-3 bg-white dark:bg-gray-900 p-4 rounded-lg"
        >
            {error && <p className="text-red-600 dark:text-red-400 mb-2">{error}</p>}
            <div>
                <label className="block mb-1 text-sm text-gray-900 dark:text-gray-100">Email</label>
                <Input
                    type="email"
                    className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
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
            <Button type="submit" className="w-full">
                {t('auth.login')}
            </Button>
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
