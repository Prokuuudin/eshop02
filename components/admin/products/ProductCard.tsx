'use client';

import React from 'react';
import Image from 'next/image';
import type { Product } from '@/data/products';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2 } from 'lucide-react';
import { useAdminLocale } from '@/lib/use-admin-locale';
import { Checkbox } from '@/components/ui/checkbox';

interface ProductCardProps {
    product: Product;
    onEdit?: () => void;
    onDelete?: () => void;
    selected?: boolean;
    onToggleSelected?: (selected: boolean) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, onEdit, onDelete, selected, onToggleSelected }) => {
    const { l } = useAdminLocale();
    const badgeLabels: Record<string, string> = {
        new: l('Новинка', 'New', 'Jaunums'), sale: l('Скидка', 'Sale', 'Atlaide'), bestseller: l('Хит', 'Bestseller', 'Bestsellers'),
    };
    const imageUrl = product.image || product.images?.[0];

    return (
        <article id={`admin-product-row-${product.id}`} className="admin-product-card flex flex-col rounded-lg border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            {/* Packshot целиком на белой подложке, как в витринной карточке:
                исходники — фото на белом фоне разных пропорций, cover их обрезал/увеличивал. */}
            <div className="admin-product-card__image product-image-surface relative h-40 flex items-center justify-center overflow-hidden">
                {onToggleSelected && (
                    <Checkbox
                        className="absolute left-2 top-2 z-10 rounded bg-card/90 p-1 shadow-sm"
                        checked={selected}
                        onCheckedChange={onToggleSelected}
                        aria-label={l(`Выбрать ${product.title}`, `Select ${product.title}`, `Atlasīt ${product.title}`)}
                    />
                )}
                {imageUrl ? (
                    <Image
                        unoptimized
                        src={imageUrl}
                        alt={product.title}
                        width={320}
                        height={160}
                        className="object-contain w-full h-full p-2"
                    />
                ) : (
                    <span className="text-xs text-muted-foreground">{l('Нет фото', 'No image', 'Nav attēla')}</span>
                )}
                {/* Бейджи поверх изображения */}
                {product.badges && product.badges.length > 0 && (
                    <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                        {product.badges.map((badge) => (
                            <Badge key={badge} className="text-[10px] px-1.5 py-0.5 leading-none">
                                {badgeLabels[badge] ?? badge}
                            </Badge>
                        ))}
                    </div>
                )}
                {product.stock === 0 && (
                    <div className="absolute top-2 right-2">
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5 leading-none">
                            {l('Нет в наличии', 'Out of stock', 'Nav noliktavā')}
                        </Badge>
                    </div>
                )}
                {product.isActive === false && (
                    <div className="absolute bottom-2 left-2">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 leading-none">
                            {l('Скрыт', 'Hidden', 'Paslēpts')}
                        </Badge>
                    </div>
                )}
            </div>

            {/* Информация */}
            <div className="admin-product-card__body flex flex-col flex-1 p-3 gap-1">
                <p className="text-[11px] text-muted-foreground font-mono leading-none">
                    {product.id}
                    {product.sku && <span className="ml-1 text-muted-foreground">· {product.sku}</span>}
                </p>
                <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2 mt-0.5">
                    {product.title}
                </p>
                {product.brand && (
                    <p className="text-xs text-muted-foreground">{product.brand}</p>
                )}

                <div className="admin-product-card__price flex items-baseline gap-2 mt-1">
                    <span className="text-base font-bold text-foreground">
                        {product.price.toFixed(2)} €
                    </span>
                    {product.oldPrice && product.oldPrice > product.price && (
                        <span className="text-xs line-through text-muted-foreground">
                            {product.oldPrice.toFixed(2)} €
                        </span>
                    )}
                </div>
            </div>

            {/* Остаток редактируется в основной форме товара. */}
            <div className="admin-product-card__stock flex items-center justify-between gap-2 border-t border-border bg-muted/50 px-3 py-2">
                <span className="text-xs text-muted-foreground">{l('Остаток', 'Stock', 'Atlikums')}</span>
                <span className="text-xs font-semibold text-foreground">{product.stock}</span>
            </div>

            {/* Кнопки действий */}
            <div className="admin-product-card__actions flex border-t border-border">
                <button
                    type="button"
                    onClick={onEdit}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-primary hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors"
                >
                    <Pencil className="w-3.5 h-3.5" />
                    {l('Редактировать', 'Edit', 'Rediģēt')}
                </button>
                <div className="w-px bg-secondary" />
                <button
                    type="button"
                    onClick={onDelete}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                    {l('Удалить', 'Delete', 'Dzēst')}
                </button>
            </div>
        </article>
    );
};

export default ProductCard;
