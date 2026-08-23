'use client';
import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import ChangePasswordFields from '@/components/account/ChangePasswordFields';

function dismissKey(userId: string): string {
    return `pw-banner-dismissed:${userId}`;
}

function readDismissed(userId: string): boolean {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(dismissKey(userId)) === '1';
}

export default function PasswordChangeBanner({ userId }: { userId: string }): React.ReactElement | null {
    const [expanded, setExpanded] = useState(false);
    const [dismissed, setDismissed] = useState(() => readDismissed(userId));

    if (dismissed) return null;

    const handleDismiss = () => {
        sessionStorage.setItem(dismissKey(userId), '1');
        setDismissed(true);
    };

    return (
        <div className="w-full bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800 px-4 py-2">
            <div className="mx-auto max-w-[1200px] flex items-center gap-3 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="flex-1 text-amber-900 dark:text-amber-200">
                    Рекомендуем сменить пароль, полученный при регистрации по карте.
                </span>
                {!expanded && (
                    <button
                        type="button"
                        className="text-sm font-medium text-amber-900 dark:text-amber-200 underline underline-offset-2"
                        onClick={() => setExpanded(true)}
                    >
                        Сменить пароль
                    </button>
                )}
                <button
                    type="button"
                    aria-label="Закрыть"
                    className="text-amber-600 dark:text-amber-400"
                    onClick={handleDismiss}
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
            {expanded && (
                <div className="ui-disclosure-in mx-auto max-w-[1200px] pt-3 pb-1">
                    <ChangePasswordFields />
                </div>
            )}
        </div>
    );
}
