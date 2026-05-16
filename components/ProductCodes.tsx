import React from 'react';
import { useTranslation } from '@/lib/use-translation';
import { Product } from '@/data/products';

type Props = {
    sku?: Product['sku'];
    barcode?: Product['barcode'];
};

export const ProductCodes: React.FC<Props> = ({ sku, barcode }) => {
    const { t } = useTranslation();
    if (!sku && !barcode) return null;
    return (
        <div className="product-detail__codes flex flex-wrap gap-6 mt-3">
            {sku && (
                <div className="product-detail__sku flex items-center gap-2">
                    <span className="product-detail__sku-label text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t('product.skuLabel')}
                    </span>
                    <span className="product-detail__sku-value font-mono text-sm text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-800 rounded px-2 py-1">
                        {sku}
                    </span>
                </div>
            )}
            {barcode && (
                <div className="product-detail__barcode flex items-center gap-2">
                    <span className="product-detail__barcode-label text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t('product.barcodeLabel')}
                    </span>
                    <span className="product-detail__barcode-value font-mono text-sm text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-800 rounded px-2 py-1">
                        {barcode}
                    </span>
                </div>
            )}
        </div>
    );
};
