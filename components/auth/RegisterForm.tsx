'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Phone } from 'lucide-react';
import { useCompanyStore } from '@/lib/company-store';
import { registerCardUser, FIRST_LOGIN_PASSWORD } from '@/lib/auth';
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

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const trimmedCard = cardNumber.trim().replace(/\s+/g, '').toUpperCase();
        if (!trimmedCard) {
            setError('Укажите номер карты клиента.');
            return;
        }

        if (!password) {
            setError('Укажите пароль.');
            return;
        }

        if (password !== FIRST_LOGIN_PASSWORD) {
            setError('Неверный пароль.');
            return;
        }

        const company = useCompanyStore.getState().getCompanyByCardNumber(trimmedCard);
        if (!company) {
            setError('Клиент с таким номером карты не найден.');
            return;
        }

        setLoading(true);
        const result = registerCardUser({
            cardNumber: trimmedCard,
            name: name.trim() || undefined,
            companyId: company.companyId,
            companyName: company.companyName,
        });
        setLoading(false);

        if (!result.success) {
            setError(result.error ?? 'Ошибка регистрации.');
            return;
        }

        onClose?.();
        router.push('/account');
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="register-form space-y-3 bg-white dark:bg-gray-900 p-3 rounded-lg"
        >
            {error && (
                <p className="register-form__error text-red-600 dark:text-red-400 text-sm">{error}</p>
            )}

            {/* Имя */}
            <div className="register-form__field">
                <label className="register-form__label block mb-1 text-sm text-gray-900 dark:text-gray-100">
                    {t('auth.name', 'Имя')}
                </label>
                <Input
                    className="register-form__input bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('auth.namePlaceholder', 'Ваше имя')}
                />
            </div>

            {/* Номер карты */}
            <div className="register-form__field">
                <label className="register-form__label block mb-1 text-sm text-gray-900 dark:text-gray-100">
                    {t('auth.clientCardNumber', 'Номер карты клиента')}
                </label>
                <Input
                    className="register-form__input bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700"
                    type="text"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    placeholder="0000"
                    maxLength={4}
                    required
                    autoComplete="off"
                />
            </div>

            <p className="register-form__card-hint -mt-2 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                Не помните номер карты?
                <a
                    href="tel:+37127067730"
                    className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 hover:underline"
                >
                    <Phone className="w-3 h-3" />
                    Связаться
                </a>
            </p>

            {/* Пароль */}
            <div className="register-form__field">
                <label className="register-form__label block mb-1 text-sm text-gray-900 dark:text-gray-100">
                    {t('auth.password', 'Пароль')}
                </label>
                <div className="register-form__password-wrapper relative flex items-center">
                    <Input
                        className="register-form__input bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700 pr-10"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t('auth.passwordPlaceholder', 'Введите пароль')}
                        required
                        autoComplete="current-password"
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

            <div className="register-form__actions flex gap-2">
                <Button type="submit" className="register-form__submit flex-1" disabled={loading}>
                    ПОДТВЕРДИТЬ
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
