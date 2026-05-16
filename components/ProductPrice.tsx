import React from 'react';
import { useTranslation } from '@/lib/use-translation';
import { formatEuro } from '@/lib/utils';

interface ProductPriceProps {
    price: number;
    oldPrice?: number;
    isAuthenticated: boolean;
    priceLocale: string;
}

export const ProductPrice: React.FC<ProductPriceProps> = ({
    price,
    oldPrice,
    isAuthenticated,
    priceLocale,
}) => {
    const { t } = useTranslation();
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
            <div className="text-4xl font-bold text-indigo-600">
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
