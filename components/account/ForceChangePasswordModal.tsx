'use client';
import React from 'react';
import { Lock } from 'lucide-react';
import ChangePasswordFields from '@/components/account/ChangePasswordFields';

export default function ForceChangePasswordModal(): React.ReactElement {
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

                <ChangePasswordFields />
            </div>
        </div>
    );
}
