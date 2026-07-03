import React from 'react';
import { ProductPrice } from '@/components/ProductPrice';
import { ProductStock } from '@/components/ProductStock';

interface ProductPricesProps {
    price: number;
    oldPrice?: number;
    priceLocale: string;
    stock: number;
    productId: string;
    productTitle: string;
}

export const ProductPrices: React.FC<ProductPricesProps> = ({
    price,
    oldPrice,
    priceLocale,
    stock,
    productId,
    productTitle,
}) => {
    return (
        <div className="product-detail__prices mt-6">
            <ProductPrice
                price={price}
                oldPrice={oldPrice}
                priceLocale={priceLocale}
            />
            <ProductStock stock={stock} productId={productId} productTitle={productTitle} />
        </div>
    );
};
