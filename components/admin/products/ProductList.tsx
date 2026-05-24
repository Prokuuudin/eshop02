import React from 'react';
import type { Product } from '@/data/products';
import ProductCard from './ProductCard';

interface ProductListProps {
    products: Product[];
    onEditProduct?: (product: Product) => void;
    onDeleteProduct?: (product: Product) => void;
}

const ProductList: React.FC<ProductListProps> = ({ products, onEditProduct, onDeleteProduct }) => {
    if (products.length === 0) {
        return (
            <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                Нет результатов поиска
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
                />
            ))}
        </div>
    );
};

export default ProductList;
