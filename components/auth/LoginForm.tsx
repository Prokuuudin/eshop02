'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
    confirmMfaEnrollment,
    hasAdminUsers,
    loginUserAuto,
    startMfaEnrollment,
    verifyMfaAndLogin,
} from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from '@/lib/use-translation';

export default function LoginForm({
    onSuccess,
    onForgotPassword,
    onRegister,
}: {
    onSuccess?: () => void;
    onForgotPassword?: () => void;
    onRegister?: () => void;
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
    const [enrollmentRequired, setEnrollmentRequired] = useState(false);
    const [enrollment, setEnrollment] = useState<{ qrCodeDataUrl: string; secret?: string } | null>(null);
    const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
    const mfaCodeInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (mfaChallengeToken) mfaCodeInputRef.current?.focus();
    }, [mfaChallengeToken, enrollment]);

    const mfaErrorText = (code?: string): string => {
        switch (code) {
            case 'invalid_code': return t('auth.mfaInvalidCode');
            case 'rate_limited': return t('auth.mfaRateLimited');
            case 'not_configured': return t('auth.mfaNotConfigured');
            case 'expired': return t('auth.mfaExpired');
            default: return t('form.error');
        }
    };

    const resetMfa = () => {
        setMfaChallengeToken(null);
        setEnrollmentRequired(false);
        setEnrollment(null);
        setBackupCodes(null);
        setMfaCode('');
        setError('');
    };

    const beginEnrollment = async (challengeToken: string) => {
        setSubmitting(true);
        setError('');
        const res = await startMfaEnrollment(challengeToken);
        setSubmitting(false);
        if (!res.success || !res.qrCodeDataUrl) return setError(mfaErrorText(res.error));
        setEnrollment({ qrCodeDataUrl: res.qrCodeDataUrl, secret: res.secret });
    };

    const finishLogin = () => {
        router.refresh();
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
            setEnrollmentRequired(res.enrollmentRequired === true);
            if (res.enrollmentRequired) void beginEnrollment(res.challengeToken);
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
        const res = await verifyMfaAndLogin(mfaChallengeToken, mfaCode.trim());
        setSubmitting(false);
        if (!res.success) return setError(res.error || t('form.error'));
        finishLogin();
    };

    const handleEnrollmentSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting || !mfaChallengeToken) return;
        setSubmitting(true);
        setError('');
        const res = await confirmMfaEnrollment(mfaChallengeToken, mfaCode.trim());
        setSubmitting(false);
        if (!res.success || !res.backupCodes) return setError(mfaErrorText(res.error));
        setMfaCode('');
        setBackupCodes(res.backupCodes);
    };

    if (backupCodes) {
        return (
            <div className="space-y-3 bg-card p-3 rounded-lg">
                <h2 className="text-base font-semibold text-foreground">{t('auth.mfaRecoveryTitle')}</h2>
                <p className="text-sm text-amber-700 dark:text-amber-400">{t('auth.mfaRecoveryIntro')}</p>
                <ul className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-3 font-mono text-sm text-foreground">
                    {backupCodes.map((c) => <li key={c}>{c}</li>)}
                </ul>
                <Button type="button" className="w-full" onClick={finishLogin}>
                    {t('auth.mfaRecoveryDone')}
                </Button>
            </div>
        );
    }

    if (mfaChallengeToken && enrollmentRequired) {
        return (
            <form onSubmit={handleEnrollmentSubmit} className="space-y-3 bg-card p-3 rounded-lg">
                <h2 className="text-base font-semibold text-foreground">{t('auth.mfaSetupTitle')}</h2>
                <p className="text-sm text-muted-foreground">{t('auth.mfaSetupIntro')}</p>
                {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
                {enrollment ? (
                    <>
                        <Image
                            src={enrollment.qrCodeDataUrl}
                            alt={t('auth.mfaSetupTitle')}
                            width={200}
                            height={200}
                            unoptimized
                            className="mx-auto rounded bg-white p-2"
                        />
                        {enrollment.secret && (
                            <p className="text-xs text-muted-foreground">
                                {t('auth.mfaSetupManual')}{' '}
                                <code className="break-all font-mono text-foreground">{enrollment.secret}</code>
                            </p>
                        )}
                        <div>
                            <label htmlFor="login-mfa-enroll-code" className="block mb-1 text-sm text-foreground">
                                {t('auth.mfaCode')}
                            </label>
                            <Input
                                id="login-mfa-enroll-code"
                                ref={mfaCodeInputRef}
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                className="bg-card text-foreground border-border"
                                value={mfaCode}
                                onChange={(e) => setMfaCode(e.target.value)}
                                maxLength={6}
                                required
                            />
                        </div>
                    </>
                ) : (
                    <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        disabled={submitting}
                        onClick={() => void beginEnrollment(mfaChallengeToken)}
                    >
                        {t('auth.mfaSetupStart')}
                    </Button>
                )}
                <div className="flex gap-2">
                    <Button type="submit" className="flex-1" disabled={!enrollment || submitting || mfaCode.trim().length !== 6}>
                        {t('auth.mfaSetupConfirm')}
                    </Button>
                    <Button type="button" variant="outline" onClick={resetMfa}>
                        {t('common.cancel', 'Отмена')}
                    </Button>
                </div>
            </form>
        );
    }

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
                        autoComplete="one-time-code"
                        className="bg-card text-foreground border-border"
                        value={mfaCode}
                        onChange={(e) => setMfaCode(e.target.value)}
                        maxLength={10}
                        required
                    />
                    <p className="mt-1 text-xs text-muted-foreground">{t('auth.mfaCodeHint')}</p>
                </div>
                <div className="flex gap-2">
                    <Button type="submit" className="flex-1" disabled={submitting || mfaCode.trim().length < 6}>
                        {t('auth.login')}
                    </Button>
                    <Button type="button" variant="outline" onClick={resetMfa}>
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
                    placeholder={adminLogin ? 'name@example.com' : t('auth.cardNumberPlaceholder', 'До 6 цифр')}
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
                {onRegister && (
                    <Button type="button" variant="outline" onClick={onRegister}>
                        {t('auth.openRegistration', 'Зарегистрироваться')}
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
