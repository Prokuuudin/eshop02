import { ProductFeatures } from '@/components/ProductFeatures';
import React from 'react';
import { ProductBrand } from '@/components/ProductBrand';
import { ProductTitle } from '@/components/ProductTitle';
import { ProductCodes } from '@/components/ProductCodes';
import { ProductBadges } from '@/components/ProductBadges';
import { ProductRating } from '@/components/ProductRating';
import { ProductPrices } from '@/components/ProductPrices';
import { ProductDescription } from '@/components/ProductDescription';
import { ProductActions } from '@/components/ProductActions';
import { Product } from '@/data/products';

interface ProductInfoProps {
    product: Product;
    localizedTitle: string;
    ratingCount: number;
    displayPrice: number;
    displayOldPrice?: number;
    isAuthenticated: boolean;
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
    isAuthenticated,
    priceLocale,
    productDescription,
    productFeatures,
    minOrderQuantity,
}) => {
    return (
        <div className="product-detail__info">
            <ProductBrand brand={product.brand} />
            <ProductTitle title={localizedTitle} />
            <ProductCodes sku={product.sku} barcode={product.barcode} />
            <ProductBadges badges={product.badges} />
            <ProductRating rating={product.rating} count={ratingCount} />
            <ProductPrices
                price={displayPrice}
                oldPrice={displayOldPrice}
                isAuthenticated={isAuthenticated}
                priceLocale={priceLocale}
                stock={product.stock}
                creditPrice={product.price}
            />
            <ProductDescription description={productDescription} productId={product.id} />
            <ProductFeatures features={productFeatures} />
            <ProductActions product={product} minOrderQuantity={minOrderQuantity} />
        </div>
    );
};
