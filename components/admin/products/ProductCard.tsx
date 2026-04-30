import React from 'react';
import type { Product, BadgeType } from '@/data/products';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ProductCardProps {
    product: Product;
    onEdit?: () => void;
    onDelete?: () => void;
    // Добавьте остальные props по необходимости
}

const ProductCard: React.FC<ProductCardProps> = ({ product, onEdit, onDelete }) => {
    return (
        <article className="rounded-lg bg-white p-4 dark:bg-gray-900">
            <div className="admin-products__list flex flex-col md:flex-row gap-4">
                <div className="admin-products__item flex-1">
                    <div className="admin-products__item-header flex flex-wrap gap-2 items-center mb-2">
                        <span className="admin-products__item-id text-xs font-semibold text-gray-700 dark:text-gray-200">
                            ID: {product.id}
                        </span>
                        <span className="admin-products__item-title text-xs text-gray-500 dark:text-gray-400">
                            {product.title}
                        </span>
                        {product.badges?.map((badge) => (
                            <Badge key={badge} className="ml-1">
                                {badge}
                            </Badge>
                        ))}
                    </div>
                    {/* ...другие поля карточки... */}
                </div>
                <div className="flex flex-col gap-2">
                    <Button size="sm" onClick={onEdit}>
                        Редактировать
                    </Button>
                    <Button size="sm" variant="destructive" onClick={onDelete}>
                        Удалить
                    </Button>
                </div>
            </div>
        </article>
    );
};

export default ProductCard;
