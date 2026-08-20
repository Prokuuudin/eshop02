import React, { useState } from 'react';
import AddToCartButton from '@/components/AddToCartButton';
import ProductBonusInfo from '@/components/ProductBonusInfo';
import WishlistButton from '@/components/WishlistButton';
import { ProductNewsWidget } from '@/components/ProductNewsWidget';
import { useTranslation } from '@/lib/use-translation';
import { Product, SelectedVariant } from '@/data/products';

interface ProductActionsProps {
    product: Product;
    minOrderQuantity: number;
    displayPrice: number;
    selectedVariants?: SelectedVariant[];
}

export const ProductActions: React.FC<ProductActionsProps> = ({
    product,
    minOrderQuantity,
    displayPrice,
    selectedVariants,
}) => {
    const { t } = useTranslation();
    const [quantity, setQuantity] = useState(minOrderQuantity);
    return (
        <div className="product-detail__actions mt-8">
            <ProductBonusInfo product={product} quantity={quantity} unitPrice={displayPrice} />
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[220px]">
                    <AddToCartButton
                        product={product}
                        selectedVariants={selectedVariants}
                        onQuantityChange={setQuantity}
                    />
                </div>
                <WishlistButton product={product} asButton />
            </div>
            {minOrderQuantity > 1 && (
                <p className="text-xs text-muted-foreground mt-2">
                    {t('product.minimumOrder')}: {minOrderQuantity} {t('product.pcs')}
                </p>
            )}
            <ProductNewsWidget product={product} />
        </div>
    );
};
