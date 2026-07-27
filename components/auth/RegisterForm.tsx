'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Phone, Mail } from 'lucide-react';
import { registerCardUser, FIRST_LOGIN_PASSWORD, type RegisterCardErrorCode } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/lib/use-translation';

type Props = {
    onClose?: () => void;
};

export default function RegisterForm({ onClose }: Props) {
    const { t } = useTranslation();
    const router = useRouter();
    const [name, setName] = useState('');
    const [cardNumber, setCardNumber] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const ERROR_MESSAGES: Record<RegisterCardErrorCode, string> = {
        card_not_found: t('auth.cardNotFound'),
        card_already_registered: t('auth.cardAlreadyRegistered'),
        wrong_password: t('auth.wrongPassword'),
        too_many_attempts: t('auth.tooManyAttempts'),
        network_error: t('auth.registrationError'),
        server_error: t('auth.registrationError'),
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const trimmedCard = cardNumber.trim().replace(/\s+/g, '').toUpperCase();
        if (!trimmedCard) {
            setError(t('auth.enterCardNumber'));
            return;
        }

        if (!password) {
            setError(t('auth.enterPassword'));
            return;
        }

        if (password !== FIRST_LOGIN_PASSWORD) {
            setError(t('auth.wrongPassword'));
            return;
        }

        setLoading(true);
        const result = await registerCardUser({
            cardNumber: trimmedCard,
            password,
            name: name.trim() || undefined,
        });
        setLoading(false);

        if (!result.success) {
            setError(result.errorCode ? ERROR_MESSAGES[result.errorCode] : t('auth.registrationError'));
            return;
        }

        onClose?.();
        router.push('/account');
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="register-form space-y-3 bg-card p-3 rounded-lg"
        >
            {error && (
                <p className="register-form__error text-red-600 dark:text-red-400 text-sm">{error}</p>
            )}

            {/* Имя */}
            <div className="register-form__field">
                <label htmlFor="register-name" className="register-form__label block mb-1 text-sm text-foreground">
                    {t('auth.name', 'Имя')}
                </label>
                <Input
                    id="register-name"
                    className="register-form__input bg-card text-foreground border-border"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('auth.namePlaceholder', 'Ваше имя')}
                />
            </div>

            {/* Номер карты */}
            <div className="register-form__field">
                <label htmlFor="register-card" className="register-form__label block mb-1 text-sm text-foreground">
                    {t('auth.clientCardNumber', 'Номер карты клиента')}
                </label>
                <Input
                    id="register-card"
                    className="register-form__input bg-card text-foreground border-border"
                    type="text"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    placeholder="0000"
                    maxLength={6}
                    required
                    autoComplete="off"
                />
            </div>

            {/* Пароль */}
            <div className="register-form__field">
                <label htmlFor="register-password" className="register-form__label block mb-1 text-sm text-foreground">
                    {t('auth.password', 'Пароль')}
                </label>
                <div className="register-form__password-wrapper relative flex items-center">
                    <Input
                        id="register-password"
                        className="register-form__input bg-card text-foreground border-border pr-10"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t('auth.passwordPlaceholder', 'Введите пароль')}
                        required
                        autoComplete="current-password"
                    />
                    <button
                        type="button"
                        className="register-form__password-toggle absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                        tabIndex={-1}
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? t('account.hidePassword') : t('account.showPassword')}
                    >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                </div>
            </div>

            <div className="register-form__card-hint space-y-1">
                <p className="text-xs text-muted-foreground">
                    <span className="text-gray-400 dark:text-gray-500 mr-0.5">*</span>
                    {t('auth.hasCardNoPassword')}
                </p>
                <div className="flex gap-2">
                    <a
                        href="tel:+37127067730"
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-gray-700 dark:text-gray-300 hover:border-primary/70 hover:text-primary dark:hover:text-primary/80 transition-colors"
                    >
                        <Phone className="w-3 h-3" />
                        +371 27067730
                    </a>
                    <a
                        href="mailto:office@miksplus.eu"
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-gray-700 dark:text-gray-300 hover:border-primary/70 hover:text-primary dark:hover:text-primary/80 transition-colors"
                    >
                        <Mail className="w-3 h-3" />
                        office@miksplus.eu
                    </a>
                </div>
            </div>

            <div className="register-form__actions flex gap-2">
                <Button type="submit" className="register-form__submit flex-1" disabled={loading}>
                    {t('auth.confirm')}
                </Button>
                {onClose && (
                    <Button type="button" variant="outline" className="register-form__close" onClick={onClose}>
                        {t('common.close', 'Закрыть')}
                    </Button>
                )}
            </div>
        </form>
    );
}
