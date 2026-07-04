'use client';
import React from 'react';
import { Star } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { useAdminStore } from '@/lib/admin-store';
import { useTranslation } from '@/lib/use-translation';
import { DEFAULT_BONUS_PROGRAM_CONFIG, calcOrderBonus } from '@/lib/bonus-program';
import { Product } from '@/data/products';

interface ProductBonusInfoProps {
    product: Product;
}

/**
 * Бонусы клиента над кнопкой «в корзину»: баланс + правило начисления.
 * Гостям не показывается (они не видят и цен); процент — из DEFAULT-конфига,
 * тот же, что использует серверное начисление.
 */
export default function ProductBonusInfo({ product }: ProductBonusInfoProps) {
    const { t } = useTranslation();
    const user = useAuthStore((s) => s.user);
    const isHydrated = useAuthStore((s) => s.isHydrated);
    const bonusProgramEnabled = useAdminStore((s) => s.bonusProgram.enabled);

    if (!isHydrated || !user || !bonusProgramEnabled) return null;

    // Баллы за единицу: явный bonusRate или 0.5% цены по курсу 1 балл = 1 цент.
    const perUnitPoints = calcOrderBonus([
        { price: product.price, quantity: 1, bonusRate: product.bonusRate },
    ]);

    return (
        <div className="product-detail__bonus mb-3 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2 text-sm space-y-1">
            <div className="product-detail__bonus-balance flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                    <Star className="h-3.5 w-3.5 fill-current text-amber-500" />
                    {t('account.bonus.balance')}
                </span>
                <span className="font-semibold text-amber-800 dark:text-amber-200">
                    {user.bonusPoints ?? 0} {t('cart.bonus.unit')}
                </span>
            </div>
            {perUnitPoints > 0 ? (
                <div className="product-detail__bonus-earn flex items-center justify-between gap-2 text-amber-700 dark:text-amber-400">
                    <span>{t('checkout.bonus.willEarn')}</span>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        +{perUnitPoints} {t('cart.bonus.unit')}
                    </span>
                </div>
            ) : (
                <p className="product-detail__bonus-earn text-xs text-amber-700 dark:text-amber-400">
                    {t('bonus.section.earnRate', undefined, {
                        rate: DEFAULT_BONUS_PROGRAM_CONFIG.earnRatePercent,
                    })}
                </p>
            )}
        </div>
    );
}
