import React from 'react';
import AddToCartButton from '@/components/AddToCartButton';
import WishlistButton from '@/components/WishlistButton';
import { useTranslation } from '@/lib/use-translation';
import { Product } from '@/data/products';

interface ProductActionsProps {
    product: Product;
    minOrderQuantity: number;
}

export const ProductActions: React.FC<ProductActionsProps> = ({ product, minOrderQuantity }) => {
    const { t } = useTranslation();
    return (
        <div className="product-detail__actions mt-8">
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[220px]">
                    <AddToCartButton product={product} />
                </div>
                <WishlistButton product={product} asButton />
            </div>
            {minOrderQuantity > 1 && (
                <p className="text-xs text-gray-500 dark:text-gray-300 mt-2">
                    {t('product.minimumOrder')}: {minOrderQuantity} {t('product.pcs')}
                </p>
            )}
        </div>
    );
};
