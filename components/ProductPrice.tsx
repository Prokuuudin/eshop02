'use client';
import React from 'react';
import { useTranslation } from '@/lib/use-translation';
import { formatEuro } from '@/lib/utils';
import { useAuthStore } from '@/lib/auth-store';

interface ProductPriceProps {
    price: number;
    oldPrice?: number;
    priceLocale: string;
}

export const ProductPrice: React.FC<ProductPriceProps> = ({
    price,
    oldPrice,
    priceLocale,
}) => {
    const { t } = useTranslation();
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const isHydrated = useAuthStore((s) => s.isHydrated);

    // Neutral placeholder until auth resolves — avoids the login/price flash for logged-in users.
    if (!isHydrated) {
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
            {oldPrice && (
                <div className="text-sm line-through text-gray-400">
                    {formatEuro(oldPrice, priceLocale)}
                </div>
            )}
            <div className="text-4xl font-bold text-primary">
                {formatEuro(price, priceLocale)}
            </div>
            {oldPrice && (
                <div className="text-sm text-green-600 mt-1">
                    {t('product.savings')}: {formatEuro(oldPrice - price, priceLocale)}
                </div>
            )}
        </>
    );
};
