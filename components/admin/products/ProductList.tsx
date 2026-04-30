import React from 'react';
import type { Product } from '@/data/products';
import ProductCard from './ProductCard';

interface ProductListProps {
    products: Product[];
    onEditProduct?: (product: Product) => void;
    onDeleteProduct?: (product: Product) => void;
}

const ProductList: React.FC<ProductListProps> = ({ products, onEditProduct, onDeleteProduct }) => {
    return (
        <div className="space-y-4">
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
