import React from 'react';
import { useTranslation } from '@/lib/use-translation';
import { StockNotifyButton } from '@/components/StockNotifyButton';

interface ProductStockProps {
    stock: number;
    productId: string;
    productTitle: string;
}

export const ProductStock: React.FC<ProductStockProps> = ({ stock, productId, productTitle }) => {
    const { t } = useTranslation();
    if (stock === 0) {
        return (
            <div className="product-detail__stock mt-4 p-3 rounded bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800">
                <p className="text-red-600 font-medium">{t('product.outOfStock')}</p>
                <StockNotifyButton productId={productId} productTitle={productTitle} />
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
            <p className="text-green-600 font-medium">{t('product.inStock')}</p>
        </div>
    );
};
