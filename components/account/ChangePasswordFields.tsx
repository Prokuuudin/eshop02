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
        if (next.length < 6) {
            setError('Пароль должен быть не менее 6 символов.');
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
        <div className="space-y-3">
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
                        placeholder="Не менее 6 символов"
                        className="pr-10 bg-card"
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
                        className="pr-10 bg-card"
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
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
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
