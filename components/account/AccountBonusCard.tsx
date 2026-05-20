'use client';
import React from 'react';
import { Star } from 'lucide-react';

interface AccountBonusCardProps {
    bonusPoints: number;
    totalEarned: number;
    totalSpent: number;
    t: (key: string, fallback?: string) => string;
}

export default function AccountBonusCard({
    bonusPoints,
    totalEarned,
    totalSpent,
    t,
}: AccountBonusCardProps) {
    return (
        <div className="account-bonus-card rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-800 dark:bg-amber-950/30">
            <div className="account-bonus-card__header flex items-center justify-between mb-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-amber-700 dark:text-amber-400">
                    {t('account.bonus.balance')}
                </p>
                <div className="rounded-xl bg-amber-100 p-2 text-amber-600 dark:bg-amber-900/50 dark:text-amber-300">
                    <Star className="h-4 w-4 fill-current" />
                </div>
            </div>

            <p className="account-bonus-card__balance text-3xl font-bold text-amber-800 dark:text-amber-200">
                {bonusPoints}
                <span className="ml-1.5 text-base font-normal text-amber-600 dark:text-amber-400">
                    {t('cart.bonus.unit', 'баллов')}
                </span>
            </p>

            <div className="account-bonus-card__stats mt-3 grid grid-cols-2 gap-2 border-t border-amber-200 dark:border-amber-800 pt-3">
                <div>
                    <p className="text-xs text-amber-600/70 dark:text-amber-500">
                        {t('account.bonus.earned')}
                    </p>
                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                        +{totalEarned}
                    </p>
                </div>
                <div>
                    <p className="text-xs text-amber-600/70 dark:text-amber-500">
                        {t('account.bonus.spent')}
                    </p>
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                        −{totalSpent}
                    </p>
                </div>
            </div>
        </div>
    );
}
