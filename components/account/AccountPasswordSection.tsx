'use client';

import React, { useState } from 'react';
import { Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getCurrentUser, readUsers, writeUsers, writeCurrentUser } from '@/lib/auth';
import { useTranslation } from '@/lib/use-translation';

export const AccountPasswordSection: React.FC<{ defaultOpen?: boolean }> = ({ defaultOpen = false }) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(defaultOpen);
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNext, setShowNext] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const reset = () => {
        setCurrent('');
        setNext('');
        setConfirm('');
        setError(null);
        setSuccess(false);
    };

    const handleOpen = () => {
        reset();
        setOpen(true);
    };

    const handleCancel = () => {
        reset();
        setOpen(false);
    };

    const handleSave = () => {
        setError(null);
        const user = getCurrentUser();
        if (!user) return;

        if (!current) {
            setError(t('account.password.errorCurrentRequired', 'Введите текущий пароль'));
            return;
        }
        if (user.password !== current) {
            setError(t('account.password.errorCurrentWrong', 'Текущий пароль неверный'));
            return;
        }
        if (next.length < 6) {
            setError(t('account.password.errorTooShort', 'Новый пароль должен быть не менее 6 символов'));
            return;
        }
        if (next !== confirm) {
            setError(t('account.password.errorMismatch', 'Пароли не совпадают'));
            return;
        }

        const users = readUsers();
        const idx = users.findIndex((u) => u.id === user.id);
        if (idx === -1) return;
        users[idx] = { ...users[idx], password: next };
        writeUsers(users);
        writeCurrentUser(users[idx]);

        setSuccess(true);
        reset();
        setTimeout(() => {
            setOpen(false);
            setSuccess(false);
        }, 1800);
    };

    return (
        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900 h-full">
            <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                        <Lock className="h-4 w-4" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {t('account.password.title', 'Пароль')}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            {t('account.password.hint', 'Рекомендуем менять пароль регулярно')}
                        </p>
                    </div>
                </div>
                {!open && (
                    <Button size="sm" variant="outline" onClick={handleOpen}>
                        {t('account.password.change', 'Изменить')}
                    </Button>
                )}
            </div>

            {open && (
                <div className="border-t border-gray-100 dark:border-gray-800 px-5 pb-5 pt-4">
                    {success ? (
                        <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm">
                            <CheckCircle className="h-4 w-4" />
                            {t('account.password.successMsg', 'Пароль успешно изменён')}
                        </div>
                    ) : (
                        <div className="space-y-3 max-w-sm">
                            <div>
                                <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">
                                    {t('account.password.current', 'Текущий пароль')}
                                </label>
                                <div className="relative flex items-center">
                                    <Input
                                        type={showCurrent ? 'text' : 'password'}
                                        value={current}
                                        onChange={(e) => setCurrent(e.target.value)}
                                        className="pr-10"
                                        autoComplete="current-password"
                                    />
                                    <button
                                        type="button"
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                                        tabIndex={-1}
                                        onClick={() => setShowCurrent((v) => !v)}
                                    >
                                        {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">
                                    {t('account.password.new', 'Новый пароль')}
                                </label>
                                <div className="relative flex items-center">
                                    <Input
                                        type={showNext ? 'text' : 'password'}
                                        value={next}
                                        onChange={(e) => setNext(e.target.value)}
                                        className="pr-10"
                                        autoComplete="new-password"
                                    />
                                    <button
                                        type="button"
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                                        tabIndex={-1}
                                        onClick={() => setShowNext((v) => !v)}
                                    >
                                        {showNext ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">
                                    {t('account.password.confirm', 'Повторите новый пароль')}
                                </label>
                                <Input
                                    type="password"
                                    value={confirm}
                                    onChange={(e) => setConfirm(e.target.value)}
                                    autoComplete="new-password"
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                                />
                            </div>

                            {error && (
                                <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                            )}

                            <div className="flex gap-2 pt-1">
                                <Button size="sm" variant="outline" onClick={handleCancel}>
                                    {t('common.cancel', 'Отмена')}
                                </Button>
                                <Button size="sm" onClick={handleSave}>
                                    {t('common.save', 'Сохранить')}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
};
