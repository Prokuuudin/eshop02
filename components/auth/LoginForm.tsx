'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { hasAdminUsers, loginUserAuto, verifyMfaAndLogin } from '@/lib/auth';
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
}): React.ReactElement {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { t } = useTranslation();
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [setupRequired] = useState(() => !hasAdminUsers());
    const [showPassword, setShowPassword] = useState(false);
    const confirmed = searchParams.get('confirmed') === '1';
    const adminLogin = searchParams.get('admin') === '1';
    const [submitting, setSubmitting] = useState(false);
    const [mfaChallengeToken, setMfaChallengeToken] = useState<string | null>(null);
    const [mfaCode, setMfaCode] = useState('');
    const mfaCodeInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (mfaChallengeToken) mfaCodeInputRef.current?.focus();
    }, [mfaChallengeToken]);

    const finishLogin = () => {
        if (onSuccess) { onSuccess(); return; }
        const redirect = searchParams.get('redirect');
        if (redirect) return router.push(redirect);
        router.push('/account');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        setSubmitting(true);
        setError('');
        const res = await loginUserAuto(identifier.trim(), password);
        setSubmitting(false);
        if (res.mfaRequired && res.challengeToken) {
            setMfaChallengeToken(res.challengeToken);
            return;
        }
        if (!res.success) return setError(res.error || t('form.error'));
        finishLogin();
    };

    const handleMfaSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting || !mfaChallengeToken) return;
        setSubmitting(true);
        setError('');
        const res = await verifyMfaAndLogin(mfaChallengeToken, mfaCode);
        setSubmitting(false);
        if (!res.success) return setError(res.error || t('form.error'));
        finishLogin();
    };

    if (mfaChallengeToken) {
        return (
            <form onSubmit={handleMfaSubmit} className="space-y-3 bg-card p-3 rounded-lg">
                {error && <p className="text-red-600 dark:text-red-400 mb-2">{error}</p>}
                <div>
                    <label htmlFor="login-mfa-code" className="block mb-1 text-sm text-foreground">
                        {t('auth.mfaCode', 'Код из приложения-аутентификатора')}
                    </label>
                    <Input
                        id="login-mfa-code"
                        ref={mfaCodeInputRef}
                        type="text"
                        inputMode="numeric"
                        className="bg-card text-foreground border-border"
                        value={mfaCode}
                        onChange={(e) => setMfaCode(e.target.value)}
                        maxLength={10}
                        required
                    />
                </div>
                <div className="flex gap-2">
                    <Button type="submit" className="flex-1" disabled={mfaCode.length < 6}>
                        {t('auth.login')}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => { setMfaChallengeToken(null); setMfaCode(''); setError(''); }}>
                        {t('common.cancel', 'Отмена')}
                    </Button>
                </div>
            </form>
        );
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="space-y-3 bg-card p-3 rounded-lg"
        >
            {confirmed && (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                    {t('auth.emailConfirmed')}
                </p>
            )}
            {error && <p className="text-red-600 dark:text-red-400 mb-2">{error}</p>}
            <div>
                <label htmlFor="login-identifier" className="block mb-1 text-sm text-foreground">
                    {adminLogin ? t('adminSetup.fieldEmail', 'Email') : t('auth.clientCardNumber', 'Номер карты')}
                </label>
                <Input
                    id="login-identifier"
                    type="text"
                    className="bg-card text-foreground border-border"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={adminLogin ? 'name@example.com' : t('auth.cardNumberPlaceholder', '0000')}
                    maxLength={adminLogin ? 254 : 64}
                    required
                />
            </div>
            <div>
                <label htmlFor="login-password" className="block mb-1 text-sm text-foreground">
                    {t('auth.password')}
                </label>
                <div className="relative flex items-center">
                    <Input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        className="bg-card text-foreground border-border pr-10"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                    <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
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
                            className="text-sm text-primary hover:text-primary hover:underline"
                        >
                            {t('auth.forgotPassword')}
                        </button>
                    ) : (
                        <Link
                            href="/auth/forgot-password"
                            className="text-sm text-primary hover:text-primary hover:underline"
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
                    {t('auth.adminNotSetup')}
                    <Link href="/auth/admin-setup" className="ml-2 underline underline-offset-2">
                        {t('auth.openAdminSetup')}
                    </Link>
                </p>
            )}
        </form>
    );
}
