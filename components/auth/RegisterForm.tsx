'use client';
import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { submitAccessRequest } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PhoneInput from '@/components/ui/phone-input';
import { useTranslation } from '@/lib/use-translation';

type Props = {
    onClose?: () => void;
};

export default function RegisterForm({ onClose }: Props) {
    const { t } = useTranslation();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [cardNumber, setCardNumber] = useState('');
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const res = submitAccessRequest(
            email.trim(),
            password,
            name.trim() || undefined,
            cardNumber.trim(),
            phone.trim()
        );
        if (!res.success) return setError(res.error || t('form.error'));
        setError('');
        const companyName = res.companyName?.trim();
        setSuccessMessage(
            companyName
                ? t(
                      'auth.requestSubmittedMessageWithCompany',
                      'Заявка отправлена. После одобрения вы сможете войти в аккаунт компании {company}.',
                      { company: companyName }
                  )
                : t('auth.requestSubmittedMessage')
        );
        setEmail('');
        setPassword('');
        setName('');
        setPhone('');
        setCardNumber('');
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="register-form space-y-3 bg-white dark:bg-gray-900 p-4 rounded-lg"
        >
            {error && (
                <p className="register-form__error text-red-600 dark:text-red-400 mb-2">{error}</p>
            )}
            {successMessage && (
                <p className="register-form__success rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                    {successMessage}
                </p>
            )}
            <p className="register-form__hint text-sm text-gray-500 dark:text-gray-400">
                {t('auth.registerHint', 'Для регистрации достаточно номера карты и выданного с ним пароля. Остальное можно заполнить позже в своём профиле. Там же можно изменить пароль.')}
            </p>
            <div className="register-form__field">
                <label className="register-form__label block mb-1 text-sm text-gray-900 dark:text-gray-100">
                    {t('auth.name')}
                </label>
                <Input
                    className="register-form__input bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700"
                    type="text"
                    value={name ?? ''}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('auth.namePlaceholder')}
                />
            </div>
            <div className="register-form__field">
                <label className="register-form__label block mb-1 text-sm text-gray-900 dark:text-gray-100">
                    {t('auth.email')}
                </label>
                <Input
                    className="register-form__input bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700"
                    type="email"
                    value={email ?? ''}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('auth.emailPlaceholder')}
                    required
                />
            </div>
            <div className="register-form__field">
                <label className="register-form__label block mb-1 text-sm text-gray-900 dark:text-gray-100">
                    {t('auth.phone', 'Телефон')}
                </label>
                <PhoneInput
                    value={phone ?? ''}
                    onChange={(val) => setPhone(val)}
                    required
                />
            </div>
            <div className="register-form__field">
                <label className="register-form__label block mb-1 text-sm text-gray-900 dark:text-gray-100">
                    {t('auth.password')}
                </label>
                <div className="register-form__password-wrapper relative flex items-center">
                    <Input
                        className="register-form__input bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700 pr-10"
                        type={showPassword ? 'text' : 'password'}
                        value={password ?? ''}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t('auth.passwordPlaceholder')}
                        required
                    />
                    <button
                        type="button"
                        className="register-form__password-toggle absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400"
                        tabIndex={-1}
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? t('account.hidePassword') : t('account.showPassword')}
                    >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                </div>
            </div>
            <div className="register-form__field">
                <label className="register-form__label block mb-1 text-sm text-gray-900 dark:text-gray-100">
                    {t('auth.clientCardNumber', 'Номер карты клиента')}
                </label>
                <Input
                    className="register-form__input bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700"
                    type="text"
                    value={cardNumber ?? ''}
                    onChange={(e) => setCardNumber(e.target.value)}
                    placeholder={t('auth.cardNumberPlaceholder')}
                    required
                />
            </div>
            <div className="register-form__actions flex gap-2">
                <Button type="submit" className="register-form__submit flex-1">
                    {t('auth.registerButton', t('auth.register'))}
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
