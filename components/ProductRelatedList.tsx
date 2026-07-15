import React from 'react';
import type { Product } from '@/data/products';
import ProductCard from '@/components/ProductCard';
import ProductListRow from '@/components/ProductListRow';

interface ProductRelatedListProps {
    title: string;
    products: Product[];
    variant?: 'cards' | 'list';
}

export const ProductRelatedList: React.FC<ProductRelatedListProps> = ({
    title,
    products,
    variant = 'cards',
}) => {
    if (!products || products.length === 0) return null;
    return (
        <section className="product-related mb-12">
            <h2 className="product-related__title text-2xl font-bold mb-6">{title}</h2>
            {variant === 'list' ? (
                <div className="product-related__list flex flex-col gap-3">
                    {products.map((p) => (
                        <ProductListRow key={p.id} product={p} />
                    ))}
                </div>
            ) : (
                <div className="product-related__grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {products.map((p) => (
                        <ProductCard key={p.id} product={p} />
                    ))}
                </div>
            )}
        </section>
    );
};
