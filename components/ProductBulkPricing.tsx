import React from 'react';
import BulkPricing from '@/components/BulkPricing';
import { Product } from '@/data/products';

type Props = {
    product: Product;
};

export const ProductBulkPricing: React.FC<Props> = ({ product }) => {
    return (
        <div className="product-detail__bulk-pricing space-y-6 mb-12">
            <BulkPricing product={product} />
        </div>
    );
};
