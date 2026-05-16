import React from 'react';
import ProductCard from '@/components/ProductCard';

interface ProductRelatedListProps {
    title: string;
    products: Array<any>; // Можно уточнить тип, если есть Product[]
}

export const ProductRelatedList: React.FC<ProductRelatedListProps> = ({ title, products }) => {
    if (!products || products.length === 0) return null;
    return (
        <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6">{title}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {products.map((p) => (
                    <ProductCard key={p.id} product={p} />
                ))}
            </div>
        </section>
    );
};
