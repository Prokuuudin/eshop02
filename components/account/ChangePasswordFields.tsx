'use client';
import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { forceChangePassword } from '@/lib/auth';

export default function ChangePasswordFields(): React.ReactElement {
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showNext, setShowNext] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSave = async () => {
        setError('');
        if (next.length < 8) {
            setError('Пароль должен быть не менее 8 символов.');
            return;
        }
        if (next !== confirm) {
            setError('Пароли не совпадают.');
            return;
        }
        setLoading(true);
        const result = await forceChangePassword(next);
        setLoading(false);
        if (!result.success) {
            setError(result.error ?? 'Ошибка. Попробуйте ещё раз.');
        }
        // После успеха родительский компонент перерисуется (mustChangePassword = false)
    };

    return (
        <div className="account-password-fields space-y-3">
            <div>
                <label htmlFor="forced-new-password" className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                    Новый пароль
                </label>
                <div className="relative flex items-center">
                    <Input
                        id="forced-new-password"
                        type={showNext ? 'text' : 'password'}
                        value={next}
                        onChange={(e) => setNext(e.target.value)}
                        placeholder="Не менее 8 символов"
                        className="pr-10 bg-card focus-visible:border-primary/60 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-[0_0_0_3px_rgba(59,130,246,0.10)]"
                        autoComplete="new-password"
                    />
                    <button
                        type="button"
                        tabIndex={-1}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
                        onClick={() => setShowNext((v) => !v)}
                    >
                        {showNext ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>
            </div>

            <div>
                <label htmlFor="forced-confirm-password" className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                    Повторите пароль
                </label>
                <div className="relative flex items-center">
                    <Input
                        id="forced-confirm-password"
                        type={showConfirm ? 'text' : 'password'}
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="Повторите новый пароль"
                        className="pr-10 bg-card focus-visible:border-primary/60 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-[0_0_0_3px_rgba(59,130,246,0.10)]"
                        autoComplete="new-password"
                        onKeyDown={(e) => { if (e.key === 'Enter') void handleSave(); }}
                    />
                    <button
                        type="button"
                        tabIndex={-1}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
                        onClick={() => setShowConfirm((v) => !v)}
                    >
                        {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>
            </div>

            {error && (
                <p className="my-2 rounded-md bg-red-50 px-3 py-2 text-sm leading-5 text-red-600 dark:bg-red-950/30 dark:text-red-400">{error}</p>
            )}

            <Button
                className="w-full"
                onClick={() => void handleSave()}
                disabled={loading}
            >
                {loading ? 'Сохраняем…' : 'Сохранить пароль'}
            </Button>
        </div>
    );
}
