'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import ChangePasswordFields from '@/components/account/ChangePasswordFields';
import { Button } from '@/components/ui/button';
import { isStaffSubject } from '@/lib/admin-permissions';
import { logout } from '@/lib/auth';
import { useAuthStore } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';

export default function ForceChangePasswordModal(): React.ReactElement {
    const user = useAuthStore((s) => s.user);
    const router = useRouter();
    const { t } = useTranslation();

    // The server refuses a password change from a not-yet-activated customer session
    // (/api/user/password -> activation_required), so offer the e-mailed link instead.
    if (!isStaffSubject(user)) {
        return (
            <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 animate-in fade-in-0 duration-[260ms]">
                <div
                    role="alertdialog"
                    aria-labelledby="activation-required-title"
                    className="animate-in fade-in-0 zoom-in-95 duration-[260ms] ease-out w-full max-w-sm rounded-2xl bg-card shadow-2xl p-6 space-y-4"
                >
                    <h2 id="activation-required-title" className="text-base font-semibold text-foreground">
                        {t('auth.activationRequiredTitle')}
                    </h2>
                    <p className="text-sm text-muted-foreground">{t('auth.activationRequired')}</p>
                    <Button
                        type="button"
                        className="w-full"
                        onClick={() => {
                            logout();
                            router.push('/auth/register');
                        }}
                    >
                        {t('auth.activationRequiredAction')}
                    </Button>
                </div>
            </div>
        );
    }

    return (
        // Блокирующий оверлей — не пропускает клики вниз
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 animate-in fade-in-0 duration-[260ms]">
            <div className="animate-in fade-in-0 zoom-in-95 duration-[260ms] ease-out w-full max-w-sm rounded-2xl bg-card shadow-2xl p-6 space-y-5">
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

                <ChangePasswordFields />
            </div>
        </div>
    );
}
