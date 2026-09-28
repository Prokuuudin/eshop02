'use client';
import React from 'react';
import { useTranslation } from '@/lib/use-translation';
import { formatEuro } from '@/lib/utils';
import { useAuthStore } from '@/lib/auth-store';
import { getValidOldPrice } from '@/lib/product-campaign-price';

interface ProductPriceProps {
    price: number;
    oldPrice?: number;
    priceLocale: string;
    /** No valid B2B price: nothing monetary is shown (lib/product-sellability.ts). */
    notForSale?: boolean;
}

export const ProductPrice: React.FC<ProductPriceProps> = ({
    price,
    oldPrice,
    priceLocale,
    notForSale = false,
}) => {
    const { t } = useTranslation();
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const isHydrated = useAuthStore((s) => s.isHydrated);
    const visibleOldPrice = getValidOldPrice(price, oldPrice);

    if (notForSale) {
        return (
            <div className="product-detail__not-for-sale text-lg font-semibold text-muted-foreground">
                {t('product.notForSale')}
            </div>
        );
    }
    // Neutral placeholder until auth resolves — avoids the login/price flash for logged-in users.
    if (!isHydrated || (isAuthenticated && !Number.isFinite(price))) {
        return <div className="h-10 w-28 rounded bg-muted animate-pulse" />;
    }
    if (!isAuthenticated) {
        return (
            <div className="text-gray-400 text-lg font-medium">
                {t('product.loginToSeePrice', 'Войдите, чтобы увидеть цену')}
            </div>
        );
    }
    return (
        <>
            {visibleOldPrice !== undefined && (
                <div className="text-sm line-through text-gray-400">
                    {formatEuro(visibleOldPrice, priceLocale)}
                </div>
            )}
            <div className="text-4xl font-bold text-primary">
                {formatEuro(price, priceLocale)}
            </div>
            {visibleOldPrice !== undefined && (
                <div className="text-sm text-green-600 mt-1">
                    {t('product.savings')}: {formatEuro(visibleOldPrice - price, priceLocale)}
                </div>
            )}
        </>
    );
};
