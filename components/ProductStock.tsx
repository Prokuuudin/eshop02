import React from 'react';
import { useTranslation } from '@/lib/use-translation';

interface ProductStockProps {
    stock: number;
}

export const ProductStock: React.FC<ProductStockProps> = ({ stock }) => {
    const { t } = useTranslation();
    if (stock === 0) {
        return (
            <div className="product-detail__stock mt-4 p-3 rounded bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800">
                <p className="text-red-600 font-medium">{t('product.outOfStock')}</p>
            </div>
        );
    }
    if (stock < 5) {
        return (
            <div className="product-detail__stock mt-4 p-3 rounded bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800">
                <p className="text-orange-600 font-medium">
                    {t('product.left')} {stock} {t('product.pcs')} — {t('product.hurry')}
                </p>
            </div>
        );
    }
    return (
        <div className="product-detail__stock mt-4 p-3 rounded bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800">
            <p className="text-green-600 font-medium">
                {t('product.inStock')}: {stock} {t('product.pcs')}
            </p>
        </div>
    );
};
