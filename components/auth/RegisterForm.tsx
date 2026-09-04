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
    onNoContactOnFile?: () => void;
};

export default function RegisterForm({ onClose, onNoContactOnFile }: Props): React.ReactElement {
    const { t } = useTranslation();
    const router = useRouter();
    const [name, setName] = useState('');
    const [cardNumber, setCardNumber] = useState('');
    const [phoneLast4, setPhoneLast4] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const ERROR_MESSAGES: Record<RegisterCardErrorCode, string> = {
        card_not_found: t('auth.cardNotFound'),
        card_already_registered: t('auth.cardAlreadyRegistered'),
        wrong_password: t('auth.wrongPassword'),
        wrong_contact: t('auth.wrongContact'),
        no_contact_on_file: t('auth.noContactOnFile'),
        contact_required: t('auth.enterContactOrPassword'),
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

        const trimmedPhoneLast4 = phoneLast4.trim();
        const trimmedEmail = email.trim();
        if (!trimmedPhoneLast4 && !trimmedEmail && !password) {
            setError(t('auth.enterContactOrPassword'));
            return;
        }

        // Card + phone-last-4/email are verified server-side (never shipped to
        // the client bundle) — a mismatch comes back as errorCode 'wrong_contact'.
        // `password` only applies to a shared company card (untouched flow).
        setLoading(true);
        const result = await registerCardUser({
            cardNumber: trimmedCard,
            phoneLast4: trimmedPhoneLast4 || undefined,
            email: trimmedEmail || undefined,
            password: password || undefined,
            name: name.trim() || undefined,
            privacyAcknowledged: true,
        });
        setLoading(false);

        if (!result.success) {
            setError(result.errorCode ? ERROR_MESSAGES[result.errorCode] : t('auth.registrationError'));
            if (result.errorCode === 'no_contact_on_file') {
                onNoContactOnFile?.();
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

            {/* Телефон / email — сверяются с данными карты, достаточно одного */}
            <div className="register-form__field">
                <label htmlFor="register-phone-last4" className="register-form__label block mb-1 text-sm text-foreground">
                    {t('auth.phoneLast4Label')}
                </label>
                <Input
                    id="register-phone-last4"
                    className="register-form__input bg-card text-foreground border-border"
                    type="text"
                    inputMode="numeric"
                    value={phoneLast4}
                    onChange={(e) => setPhoneLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder={t('auth.phoneLast4Placeholder')}
                    maxLength={4}
                    autoComplete="off"
                />
            </div>

            <div className="register-form__field">
                <label htmlFor="register-email" className="register-form__label block mb-1 text-sm text-foreground">
                    {t('auth.email')}
                </label>
                <Input
                    id="register-email"
                    className="register-form__input bg-card text-foreground border-border"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('auth.emailPlaceholder')}
                    autoComplete="off"
                />
                <p className="text-xs text-muted-foreground mt-1">{t('auth.contactHint')}</p>
            </div>

            {/* Общая карта компании (редкий кейс) — пароль от администратора */}
            <div className="register-form__field">
                <label htmlFor="register-password" className="register-form__label block mb-1 text-sm text-foreground">
                    {t('auth.companyPasswordLabel')}
                </label>
                <Input
                    id="register-password"
                    className="register-form__input bg-card text-foreground border-border"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('auth.companyPasswordPlaceholder')}
                    autoComplete="off"
                />
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
