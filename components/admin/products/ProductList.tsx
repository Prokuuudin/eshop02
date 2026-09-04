'use client';

import React from 'react';
import type { Product } from '@/data/products';
import ProductCard from './ProductCard';
import { useAdminLocale } from '@/lib/use-admin-locale';

interface ProductListProps {
    products: Product[];
    onEditProduct?: (product: Product) => void;
    onDeleteProduct?: (product: Product) => void;
    selectedIds?: Set<string>;
    onToggleSelected?: (id: string, selected: boolean) => void;
}

const ProductList: React.FC<ProductListProps> = ({ products, onEditProduct, onDeleteProduct, selectedIds, onToggleSelected }) => {
    const { l } = useAdminLocale();
    if (products.length === 0) {
        return (
            <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
                {l('Нет результатов поиска', 'No search results', 'Nav meklēšanas rezultātu')}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {products.map((product) => (
                <ProductCard
                    key={product.id}
                    product={product}
                    onEdit={() => onEditProduct?.(product)}
                    onDelete={() => onDeleteProduct?.(product)}
                    selected={selectedIds?.has(product.id)}
                    onToggleSelected={onToggleSelected ? (selected) => onToggleSelected(product.id, selected) : undefined}
                />
            ))}
        </div>
    );
};

export default ProductList;
