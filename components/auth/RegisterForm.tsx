'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { Phone, Mail } from 'lucide-react';
import { requestCardActivation, type CardActivationErrorCode } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/lib/use-translation';

type Props = {
    onClose?: () => void;
};

function ContactLinks(): React.ReactElement {
    return (
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
    );
}

export default function RegisterForm({ onClose }: Props): React.ReactElement {
    const { t, language } = useTranslation();
    const [cardNumber, setCardNumber] = useState('');
    const [error, setError] = useState('');
    const [sent, setSent] = useState(false);
    const [loading, setLoading] = useState(false);

    const ERROR_MESSAGES: Record<CardActivationErrorCode, string> = {
        invalid_card: t('auth.invalidCardNumber'),
        too_many_attempts: t('auth.tooManyAttempts'),
        network_error: t('auth.registrationError'),
        server_error: t('auth.registrationError'),
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const trimmedCard = cardNumber.trim().replace(/\s+/g, '');
        if (!trimmedCard) {
            setError(t('auth.enterCardNumber'));
            return;
        }

        // The server answers identically for every card and only ever e-mails the address on
        // file — this form cannot confirm that a card exists or log anyone in.
        setLoading(true);
        const result = await requestCardActivation({ cardNumber: trimmedCard, language });
        setLoading(false);

        if (!result.success) {
            setError(result.errorCode ? ERROR_MESSAGES[result.errorCode] : t('auth.registrationError'));
            return;
        }
        setSent(true);
    };

    if (sent) {
        return (
            <div className="register-form space-y-3 bg-card p-3 rounded-lg">
                <p className="register-form__notice text-sm text-foreground">{t('auth.cardActivationSent')}</p>
                <ContactLinks />
                {onClose && (
                    <div className="register-form__actions flex gap-2">
                        <Button type="button" variant="outline" className="register-form__close flex-1" onClick={onClose}>
                            {t('common.close', 'Закрыть')}
                        </Button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="register-form space-y-3 bg-card p-3 rounded-lg"
        >
            {error && (
                <p className="register-form__error text-red-600 dark:text-red-400 text-sm">{error}</p>
            )}

            <p className="register-form__intro text-sm text-muted-foreground">{t('auth.cardActivationIntro')}</p>

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
                    placeholder={t('auth.cardNumberPlaceholder', 'До 6 цифр')}
                    maxLength={6}
                    inputMode="numeric"
                    pattern="[0-9 ]{1,6}"
                    required
                    autoComplete="off"
                />
            </div>

            <div className="register-form__card-hint space-y-1">
                <p className="text-xs text-muted-foreground">
                    <span className="text-gray-400 dark:text-gray-500 mr-0.5">*</span>
                    {t('auth.hasCardNoPassword')}
                </p>
                <ContactLinks />
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
                    {t('auth.cardActivationSubmit')}
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
