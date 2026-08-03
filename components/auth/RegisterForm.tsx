'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Phone, Mail } from 'lucide-react';
import { registerCardUser, type RegisterCardErrorCode } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/lib/use-translation';

type Props = {
    onClose?: () => void;
    onNoPersonalCode?: () => void;
};

export default function RegisterForm({ onClose, onNoPersonalCode }: Props): React.ReactElement {
    const { t } = useTranslation();
    const router = useRouter();
    const [name, setName] = useState('');
    const [cardNumber, setCardNumber] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [marketingConsent, setMarketingConsent] = useState(false);

    const ERROR_MESSAGES: Record<RegisterCardErrorCode, string> = {
        card_not_found: t('auth.cardNotFound'),
        card_already_registered: t('auth.cardAlreadyRegistered'),
        wrong_password: t('auth.wrongPassword'),
        wrong_code: t('auth.wrongCode'),
        no_personal_code_on_file: t('auth.noPersonalCodeOnFile'),
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
            setError(t('auth.enterPersonalCode'));
            return;
        }

        // The 3-character personal code is checked server-side (never shipped
        // to the client bundle) — a wrong guess comes back as errorCode 'wrong_code'.
        setLoading(true);
        const result = await registerCardUser({
            cardNumber: trimmedCard,
            password,
            name: name.trim() || undefined,
            privacyAcknowledged: true,
            marketingConsent,
        });
        setLoading(false);

        if (!result.success) {
            setError(result.errorCode ? ERROR_MESSAGES[result.errorCode] : t('auth.registrationError'));
            if (result.errorCode === 'no_personal_code_on_file') {
                onNoPersonalCode?.();
            }
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
                    inputMode="numeric"
                    pattern="[0-9 ]{1,6}"
                    required
                    autoComplete="off"
                />
            </div>

            {/* Последние 3 цифры кода */}
            <div className="register-form__field">
                <label htmlFor="register-password" className="register-form__label block mb-1 text-sm text-foreground">
                    {t('auth.personalCodeLabel')}
                </label>
                <Input
                    id="register-password"
                    className="register-form__input bg-card text-foreground border-border"
                    type="text"
                    inputMode="numeric"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('auth.personalCodePlaceholder')}
                    maxLength={3}
                    required
                    autoComplete="off"
                />
                <p className="text-xs text-muted-foreground mt-1">{t('auth.personalCodeHint')}</p>
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

            <p className="text-xs text-muted-foreground">
                {t('auth.privacyAcknowledgement', 'Отправляя форму, вы подтверждаете, что ознакомились с')}{' '}
                <Link href="/privacy" className="underline text-foreground">
                    {t('footer.privacy', 'Политикой конфиденциальности')}
                </Link>
                .
            </p>
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <input
                    type="checkbox"
                    checked={marketingConsent}
                    onChange={(e) => setMarketingConsent(e.target.checked)}
                    className="mt-0.5"
                />
                <span>{t('auth.marketingConsent', 'Я хочу получать новости и специальные предложения по электронной почте (необязательно).')}</span>
            </label>

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
