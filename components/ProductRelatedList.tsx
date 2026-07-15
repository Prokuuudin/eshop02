import React from 'react';
import type { Product } from '@/data/products';
import ProductListRow from '@/components/ProductListRow';

interface ProductRelatedListProps {
    title: string;
    products: Product[];
}

export const ProductRelatedList: React.FC<ProductRelatedListProps> = ({ title, products }) => {
    if (!products || products.length === 0) return null;
    return (
        <section className="product-related mb-12">
            <h2 className="product-related__title text-2xl font-bold mb-6">{title}</h2>
            <div className="product-related__list flex flex-col gap-3">
                {products.map((p) => (
                    <ProductListRow key={p.id} product={p} />
                ))}
            </div>
        </section>
    );
};
