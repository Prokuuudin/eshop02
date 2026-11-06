'use client';

import React, { useState } from 'react';
import { CheckCircle, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/lib/use-translation';

export const AccountEmailSection: React.FC = () => {
    const { t, language } = useTranslation();
    const [open, setOpen] = useState(false);
    const [newEmail, setNewEmail] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [sent, setSent] = useState(false);
    const [saving, setSaving] = useState(false);

    const close = () => {
        setOpen(false);
        setNewEmail('');
        setCurrentPassword('');
        setError(null);
        setSent(false);
    };

    const errorText = (code?: string): string => {
        switch (code) {
            case 'invalid_email': return t('account.emailChange.errorInvalid');
            case 'email_unchanged': return t('account.emailChange.errorUnchanged');
            case 'reauthentication_failed': return t('account.emailChange.errorPassword');
            case 'rate_limited': return t('account.emailChange.errorRateLimited');
            case 'unauthorized': return t('account.errors.sessionExpired');
            default: return t('account.emailChange.errorServer');
        }
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (saving) return;
        setError(null);
        setSaving(true);
        try {
            const res = await fetch('/api/user/email-change', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newEmail: newEmail.trim(), currentPassword, language }),
            });
            if (res.ok) {
                setCurrentPassword('');
                setSent(true);
                return;
            }
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            setError(errorText(body.error));
        } catch {
            setError(errorText());
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="account-email h-full min-w-0 rounded-lg border border-border bg-card shadow-sm">
            <div className="flex flex-col items-stretch gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                        <Mail className="h-4 w-4" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-foreground">{t('account.emailChange.title')}</h3>
                        <p className="text-xs text-muted-foreground">{t('account.emailChange.hint')}</p>
                    </div>
                </div>
                {!open && (
                    <Button className="w-full sm:w-auto" size="sm" variant="outline" onClick={() => setOpen(true)}>
                        {t('account.emailChange.open')}
                    </Button>
                )}
            </div>

            {open && (
                <div className="ui-disclosure-in border-t border-gray-100 px-4 pb-4 pt-4 dark:border-gray-800 sm:px-5 sm:pb-5">
                    {sent ? (
                        <div className="space-y-3">
                            <p role="status" data-testid="email-change-sent" className="flex items-start gap-2 text-sm text-green-600 dark:text-green-400">
                                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                {t('account.emailChange.sent')}
                            </p>
                            <Button size="sm" variant="outline" onClick={close}>{t('account.emailChange.close')}</Button>
                        </div>
                    ) : (
                        <form className="max-w-sm space-y-3" onSubmit={(event) => void handleSubmit(event)}>
                            <div>
                                <label htmlFor="email-change-new" className="mb-1 block text-xs text-muted-foreground">
                                    {t('account.emailChange.newEmail')}
                                </label>
                                <Input
                                    id="email-change-new"
                                    type="email"
                                    required
                                    autoComplete="email"
                                    value={newEmail}
                                    onChange={(event) => setNewEmail(event.target.value)}
                                />
                            </div>
                            <div>
                                <label htmlFor="email-change-password" className="mb-1 block text-xs text-muted-foreground">
                                    {t('account.emailChange.currentPassword')}
                                </label>
                                <Input
                                    id="email-change-password"
                                    type="password"
                                    required
                                    autoComplete="current-password"
                                    value={currentPassword}
                                    onChange={(event) => setCurrentPassword(event.target.value)}
                                />
                            </div>
                            {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                            <div className="flex gap-2">
                                <Button type="submit" size="sm" disabled={saving}>{t('account.emailChange.submit')}</Button>
                                <Button type="button" size="sm" variant="outline" onClick={close}>{t('account.emailChange.close')}</Button>
                            </div>
                        </form>
                    )}
                </div>
            )}
        </section>
    );
};
