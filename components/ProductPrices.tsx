import React from 'react';
import { ProductPrice } from '@/components/ProductPrice';
import { ProductStock } from '@/components/ProductStock';
import { CreditCalculator } from '@/components/CreditCalculator';

interface ProductPricesProps {
    price: number;
    oldPrice?: number;
    isAuthenticated: boolean;
    priceLocale: string;
    stock: number;
    creditPrice: number;
}

export const ProductPrices: React.FC<ProductPricesProps> = ({
    price,
    oldPrice,
    isAuthenticated,
    priceLocale,
    stock,
    creditPrice,
}) => {
    return (
        <div className="product-detail__prices mt-6">
            <ProductPrice
                price={price}
                oldPrice={oldPrice}
                isAuthenticated={isAuthenticated}
                priceLocale={priceLocale}
            />
            <ProductStock stock={stock} />
        </div>
    );
};
