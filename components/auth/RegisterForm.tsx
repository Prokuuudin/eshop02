'use client';
import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { submitAccessRequest } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/lib/use-translation';

export default function RegisterForm() {
    const { t } = useTranslation();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
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
            cardNumber.trim()
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
        setCardNumber('');
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="space-y-3 bg-white dark:bg-gray-900 p-4 rounded-lg"
        >
            {error && <p className="text-red-600 dark:text-red-400 mb-2">{error}</p>}
            {successMessage && (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                    {successMessage}
                </p>
            )}
            <p className="text-sm text-gray-600 dark:text-gray-300">
                {t(
                    'auth.registerByCardNumberHint',
                    'Введите номер карты клиента, чтобы отправить заявку на доступ к аккаунту компании. Доступ будет открыт после ручного одобрения.'
                )}
            </p>
            <div>
                <label className="block mb-1 text-sm text-gray-900 dark:text-gray-100">
                    {t('auth.name')}
                </label>
                <Input
                    type="text"
                    className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
            </div>
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
            </div>
            <div>
                <label className="block mb-1 text-sm text-gray-900 dark:text-gray-100">
                    {t('auth.clientCardNumber', 'Номер карты клиента')}
                </label>
                <Input
                    type="text"
                    className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    placeholder="1234 5678 9012 3456"
                    required
                />
            </div>
            <Button type="submit" className="w-full">
                {t('auth.registerButton', t('auth.register'))}
            </Button>
        </form>
    );
}
