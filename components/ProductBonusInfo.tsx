'use client';
import React from 'react';
import { Star } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { useAdminStore } from '@/lib/admin-store';
import { useTranslation } from '@/lib/use-translation';
import {
    DEFAULT_BONUS_PROGRAM_CONFIG,
    calcOrderBonus,
    pointsToEuros,
} from '@/lib/bonus-program';
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils';
import { Product } from '@/data/products';

interface ProductBonusInfoProps {
    product: Product;
    /** Количество из степпера AddToCartButton — начисление считается за выбранный объём. */
    quantity?: number;
    /** Цена единицы с учётом выбранных вариантов; по умолчанию базовая цена товара. */
    unitPrice?: number;
}

/**
 * Бонусы клиента над кнопкой «в корзину»: баланс + начисление за выбранное
 * количество с евро-эквивалентом экономии. Гостям не показывается (они не
 * видят и цен); курс и процент — те же, что в серверном начислении.
 */
export default function ProductBonusInfo({ product, quantity = 1, unitPrice }: ProductBonusInfoProps): React.ReactElement | null {
    const { t, language } = useTranslation();
    const user = useAuthStore((s) => s.user);
    const isHydrated = useAuthStore((s) => s.isHydrated);
    const bonusProgramEnabled = useAdminStore((s) => s.bonusProgram.enabled);

    if (!isHydrated || !user || !bonusProgramEnabled) return null;

    const price = unitPrice ?? product.price;
    const safeQuantity = Math.max(1, quantity);
    const points = calcOrderBonus([
        { price, quantity: safeQuantity, bonusRate: product.bonusRate },
    ]);
    const savedEuros = pointsToEuros(points);
    const locale = getLocaleFromLanguage(language);

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
            {points > 0 ? (
                <div className="product-detail__bonus-earn flex items-center justify-between gap-2 text-amber-700 dark:text-amber-400">
                    <span>{t('checkout.bonus.willEarn')}</span>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        +{points} {t('cart.bonus.unit')}
                        <span className="ml-1 font-normal text-amber-700/80 dark:text-amber-400/80">
                            (= −{formatEuro(savedEuros, locale)})
                        </span>
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
