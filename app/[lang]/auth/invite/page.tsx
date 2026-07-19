'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { loginUserAuto } from '@/lib/auth';
import { useTranslation } from '@/lib/use-translation';

type Stage = 'loading' | 'form' | 'submitting' | 'done' | 'error';

const ERROR_TEXT: Record<string, [string, string, string]> = {
    invalid_token: ['Ссылка недействительна.', 'The link is invalid.', 'Saite nav derīga.'],
    token_expired: ['Ссылка устарела. Запросите новое приглашение.', 'The link has expired. Request a new invitation.', 'Saites derīgums ir beidzies. Pieprasiet jaunu ielūgumu.'],
    already_used: ['Приглашение уже использовано. Войдите со своим паролем.', 'This invitation was already used. Log in with your password.', 'Ielūgums jau ir izmantots. Piesakieties ar savu paroli.'],
    weak_password: ['Пароль должен быть не короче 8 символов.', 'Password must be at least 8 characters.', 'Parolei jābūt vismaz 8 rakstzīmēm.'],
    user_not_found: ['Аккаунт для этого приглашения не найден. Свяжитесь с администратором.', 'The account for this invitation was not found. Please contact the administrator.', 'Šī ielūguma konts nav atrasts. Lūdzu, sazinieties ar administratoru.'],
    server_error: ['Ошибка сервера. Попробуйте ещё раз.', 'Server error. Please try again.', 'Servera kļūda. Mēģiniet vēlreiz.'],
};

export default function InvitePage() {
    const { language } = useTranslation();
    const l = (ru: string, en: string, lv: string) =>
        language === 'ru' ? ru : language === 'lv' ? lv : en;
    const errText = (code: string) => {
        const t = ERROR_TEXT[code] ?? ERROR_TEXT.server_error;
        return l(t[0], t[1], t[2]);
    };

    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get('token');

    const [stage, setStage] = useState<Stage>('loading');
    const [error, setError] = useState('');
    const [email, setEmail] = useState('');
    const [cardNumber, setCardNumber] = useState('');
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [password2, setPassword2] = useState('');
    const [loginFailed, setLoginFailed] = useState(false);

    useEffect(() => {
        if (!token) {
            setError(errText('invalid_token'));
            setStage('error');
            return;
        }
        fetch(`/api/auth/invite?token=${encodeURIComponent(token)}`)
            .then(async (res) => {
                const json = await res.json() as { ok: boolean; error?: string; email?: string; name?: string; cardNumber?: string };
                if (!json.ok) {
                    setError(errText(json.error ?? 'server_error'));
                    setStage('error');
                    return;
                }
                setEmail(json.email ?? '');
                setName(json.name ?? '');
                setCardNumber(json.cardNumber ?? '');
                setStage('form');
            })
            .catch(() => {
                setError(errText('server_error'));
                setStage('error');
            });
        // errText стабилен в рамках языка; language в deps не нужен
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== password2) {
            setError(l('Пароли не совпадают.', 'Passwords do not match.', 'Paroles nesakrīt.'));
            return;
        }
        setError('');
        setStage('submitting');
        try {
            const res = await fetch('/api/auth/invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password }),
            });
            const json = await res.json() as { ok: boolean; error?: string; email?: string };
            if (!json.ok) {
                setError(errText(json.error ?? 'server_error'));
                setStage('form');
                return;
            }
            // Полный клиентский логин (zustand-сторы + серверная сессия)
            const login = await loginUserAuto(json.email ?? email, password);
            if (!login.success) {
                // Аккаунт активирован на сервере; клиентский логин не удался —
                // отправляем на страницу входа вместо ложного «залогинен»
                setLoginFailed(true);
                setStage('done');
                setTimeout(() => router.push('/auth/login'), 2500);
                return;
            }
            setStage('done');
            setTimeout(() => router.push('/account'), 1500);
        } catch {
            setError(errText('server_error'));
            setStage('form');
        }
    };

    if (stage === 'loading') {
        return (
            <main className="flex min-h-[60vh] items-center justify-center px-4">
                <p className="text-muted-foreground text-sm animate-pulse">
                    {l('Проверяем приглашение…', 'Checking the invitation…', 'Pārbaudām ielūgumu…')}
                </p>
            </main>
        );
    }

    if (stage === 'error') {
        return (
            <main className="flex min-h-[60vh] items-center justify-center px-4">
                <div className="max-w-md w-full text-center space-y-4">
                    <p className="text-red-600 dark:text-red-400">{error}</p>
                    <Link href="/auth/login" className="inline-block text-primary hover:underline text-sm">
                        {l('Перейти ко входу', 'Go to login', 'Doties uz pieteikšanos')}
                    </Link>
                </div>
            </main>
        );
    }

    if (stage === 'done') {
        return (
            <main className="flex min-h-[60vh] items-center justify-center px-4">
                <div className="max-w-md w-full text-center space-y-4">
                    <div className="text-4xl">✓</div>
                    <h1 className="text-xl font-semibold text-foreground">
                        {l('Аккаунт активирован!', 'Account activated!', 'Konts aktivizēts!')}
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        {loginFailed
                            ? l('Аккаунт активирован. Войдите с новым паролем.', 'Account activated. Log in with your new password.', 'Konts aktivizēts. Piesakieties ar jauno paroli.')
                            : l('Перенаправляем в личный кабинет…', 'Redirecting to your account…', 'Novirzām uz jūsu kontu…')}
                    </p>
                </div>
            </main>
        );
    }

    return (
        <main className="flex min-h-[60vh] items-center justify-center px-4 py-8">
            <div className="max-w-md w-full space-y-6">
                <div className="text-center space-y-2">
                    <h1 className="text-2xl font-bold text-foreground">
                        {l('Добро пожаловать!', 'Welcome!', 'Laipni lūdzam!')}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {l(
                            'Ваш аккаунт готов. Задайте пароль, чтобы начать пользоваться сайтом.',
                            'Your account is ready. Set a password to start using the site.',
                            'Jūsu konts ir gatavs. Iestatiet paroli, lai sāktu lietot vietni.'
                        )}
                    </p>
                </div>

                <div className="rounded-lg border border-border bg-card p-6 space-y-4">
                    <div className="space-y-3 text-sm">
                        {name && (
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">{l('Имя', 'Name', 'Vārds')}</span>
                                <span className="font-medium text-foreground">{name}</span>
                            </div>
                        )}
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Email</span>
                            <span className="font-medium text-foreground">{email}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">{l('Карта клиента', 'Client card', 'Klienta karte')}</span>
                            <span className="font-mono font-medium text-foreground">{cardNumber}</span>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-3">
                        <label className="block text-sm">
                            <span className="block mb-1 text-muted-foreground">
                                {l('Новый пароль', 'New password', 'Jaunā parole')}
                            </span>
                            <Input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                minLength={8}
                                required
                                autoComplete="new-password"
                            />
                        </label>
                        <label className="block text-sm">
                            <span className="block mb-1 text-muted-foreground">
                                {l('Повторите пароль', 'Repeat password', 'Atkārtojiet paroli')}
                            </span>
                            <Input
                                type="password"
                                value={password2}
                                onChange={(e) => setPassword2(e.target.value)}
                                minLength={8}
                                required
                                autoComplete="new-password"
                            />
                        </label>

                        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

                        <Button type="submit" className="w-full" disabled={stage === 'submitting'}>
                            {stage === 'submitting'
                                ? l('Активируем…', 'Activating…', 'Aktivizējam…')
                                : l('Активировать аккаунт', 'Activate account', 'Aktivizēt kontu')}
                        </Button>
                    </form>
                </div>
            </div>
        </main>
    );
}
