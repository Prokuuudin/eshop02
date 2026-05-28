'use client';
import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { activateRegistration, type ActivatePayload } from '@/lib/auth';
import Link from 'next/link';

type Status = 'loading' | 'success' | 'error';

export default function ConfirmPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [status, setStatus] = useState<Status>('loading');
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        const token = searchParams.get('token');
        if (!token) {
            setErrorMsg('Ссылка недействительна.');
            setStatus('error');
            return;
        }

        fetch(`/api/auth/confirm?token=${encodeURIComponent(token)}`)
            .then(async (res) => {
                const json = await res.json() as { ok: boolean; error?: string; payload?: ActivatePayload };
                if (!json.ok || !json.payload) {
                    const msg =
                        json.error === 'token_expired'
                            ? 'Ссылка устарела. Пожалуйста, зарегистрируйтесь заново.'
                            : 'Ссылка недействительна или уже была использована.';
                    setErrorMsg(msg);
                    setStatus('error');
                    return;
                }
                const result = activateRegistration(json.payload);
                if (!result.success) {
                    setErrorMsg(result.error ?? 'Не удалось активировать аккаунт.');
                    setStatus('error');
                    return;
                }
                setStatus('success');
                setTimeout(() => router.push('/auth/login?confirmed=1'), 2500);
            })
            .catch(() => {
                setErrorMsg('Ошибка соединения. Попробуйте ещё раз.');
                setStatus('error');
            });
    }, [searchParams, router]);

    if (status === 'loading') {
        return (
            <main className="flex min-h-[60vh] items-center justify-center px-4">
                <p className="text-gray-500 dark:text-gray-400 text-sm animate-pulse">
                    Подтверждаем вашу почту…
                </p>
            </main>
        );
    }

    if (status === 'error') {
        return (
            <main className="flex min-h-[60vh] items-center justify-center px-4">
                <div className="max-w-md w-full text-center space-y-4">
                    <p className="text-red-600 dark:text-red-400">{errorMsg}</p>
                    <Link
                        href="/auth/register"
                        className="inline-block text-indigo-600 hover:underline text-sm"
                    >
                        Вернуться к регистрации
                    </Link>
                </div>
            </main>
        );
    }

    return (
        <main className="flex min-h-[60vh] items-center justify-center px-4">
            <div className="max-w-md w-full text-center space-y-4">
                <div className="text-4xl">✓</div>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    E-mail подтверждён!
                </h1>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                    Аккаунт активирован. Сейчас вы будете перенаправлены на страницу входа.
                </p>
            </div>
        </main>
    );
}
