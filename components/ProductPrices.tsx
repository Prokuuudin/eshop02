import React from 'react';
import { ProductPrice } from '@/components/ProductPrice';
import { ProductStock } from '@/components/ProductStock';
import ProductShareButton from '@/components/ProductShareButton';

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
            <div className="flex items-start justify-between gap-3">
                <div>
                    <ProductPrice
                        price={price}
                        oldPrice={oldPrice}
                        priceLocale={priceLocale}
                    />
                </div>
                <ProductShareButton productTitle={productTitle} />
            </div>
            <ProductStock stock={stock} productId={productId} productTitle={productTitle} />
        </div>
    );
};
