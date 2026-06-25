import { ProductFeatures } from '@/components/ProductFeatures';
import React, { useMemo, useState } from 'react';
import { ProductBrand } from '@/components/ProductBrand';
import { ProductTitle } from '@/components/ProductTitle';
import { ProductCodes } from '@/components/ProductCodes';
import { ProductBadges } from '@/components/ProductBadges';
import { ProductRating } from '@/components/ProductRating';
import { ProductPrices } from '@/components/ProductPrices';
import { ProductDescription } from '@/components/ProductDescription';
import { ProductActions } from '@/components/ProductActions';
import { ProductVariantSelector } from '@/components/ProductVariantSelector';
import { Product, SelectedVariant } from '@/data/products';
import { getVariantGroups, sumPriceAdjustment } from '@/lib/product-variants';

interface ProductInfoProps {
    product: Product;
    localizedTitle: string;
    ratingCount: number;
    displayPrice: number;
    displayOldPrice?: number;
    priceLocale: string;
    productDescription: string;
    productFeatures: string[];
    minOrderQuantity: number;
}

export const ProductInfo: React.FC<ProductInfoProps> = ({
    product,
    localizedTitle,
    ratingCount,
    displayPrice,
    displayOldPrice,
    priceLocale,
    productDescription,
    productFeatures,
    minOrderQuantity,
}) => {
    const variantGroups = useMemo(() => getVariantGroups(product), [product]);
    const [selectedVariants, setSelectedVariants] = useState<SelectedVariant[]>([]);
    const priceAdjustment = useMemo(() => sumPriceAdjustment(selectedVariants), [selectedVariants]);
    const adjustedPrice = displayPrice + priceAdjustment;
    const adjustedOldPrice = displayOldPrice !== undefined ? displayOldPrice + priceAdjustment : undefined;

    return (
        <div className="product-detail__info">
            <ProductBrand brand={product.brand} />
            <ProductTitle title={localizedTitle} />
            <ProductCodes sku={product.sku} barcode={product.barcode} />
            <ProductBadges badges={product.badges} />
            <ProductRating rating={product.rating} count={ratingCount} />
            {variantGroups && variantGroups.length > 0 && (
                <ProductVariantSelector
                    groups={variantGroups}
                    selected={selectedVariants}
                    onChange={setSelectedVariants}
                />
            )}
            <ProductPrices
                price={adjustedPrice}
                oldPrice={adjustedOldPrice}
                priceLocale={priceLocale}
                stock={product.stock}
                creditPrice={product.price}
                productId={product.id}
                productTitle={localizedTitle}
            />
            <ProductDescription description={productDescription} productId={product.id} />
            <ProductFeatures features={productFeatures} />
            <ProductActions
                product={product}
                minOrderQuantity={minOrderQuantity}
                displayPrice={adjustedPrice}
                selectedVariants={selectedVariants}
            />
        </div>
    );
};
