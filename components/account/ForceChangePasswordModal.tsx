'use client';
import React, { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { forceChangePassword } from '@/lib/auth';

export default function ForceChangePasswordModal() {
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
        // Блокирующий оверлей — не пропускает клики вниз
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="w-full max-w-sm rounded-2xl bg-card shadow-2xl p-6 space-y-5">
                {/* Заголовок */}
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/40">
                        <Lock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-foreground">
                            Пожалуйста, замените пароль
                        </h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Придумайте новый пароль для входа в кабинет
                        </p>
                    </div>
                </div>

                <div className="space-y-3">
                    {/* Новый пароль */}
                    <div>
                        <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                            Новый пароль
                        </label>
                        <div className="relative flex items-center">
                            <Input
                                type={showNext ? 'text' : 'password'}
                                value={next}
                                onChange={(e) => setNext(e.target.value)}
                                placeholder="Не менее 6 символов"
                                className="pr-10 bg-card"
                                autoComplete="new-password"
                                autoFocus
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

                    {/* Подтверждение */}
                    <div>
                        <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                            Повторите пароль
                        </label>
                        <div className="relative flex items-center">
                            <Input
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
                </div>

                <Button
                    className="w-full"
                    onClick={() => void handleSave()}
                    disabled={loading}
                >
                    {loading ? 'Сохраняем…' : 'Сохранить пароль'}
                </Button>
            </div>
        </div>
    );
}
