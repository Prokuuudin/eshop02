import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';

interface ProductPreviewCardProps {
    image?: string;
    title: string;
    brand?: string;
    price?: number;
    oldPrice?: number;
    badges?: ('new' | 'sale' | 'bestseller')[];
    stock?: number;
    sku?: string;
}

function formatEuro(value?: number) {
    if (typeof value !== 'number' || isNaN(value)) return '';
    return value.toLocaleString('ru-RU', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
}

const BADGE_STYLES: Record<string, string> = {
    sale: 'bg-red-600 text-white',
    new: 'bg-green-600 text-white',
    bestseller: 'bg-yellow-600 text-black',
};

const ProductPreviewCard: React.FC<ProductPreviewCardProps> = ({
    image,
    title,
    brand,
    price,
    oldPrice,
    badges,
    stock,
    sku,
}) => {
    const isOutOfStock = typeof stock === 'number' && stock === 0;
    const displayPrice = typeof price === 'number' ? price : undefined;
    const displayOldPrice = typeof oldPrice === 'number' && oldPrice > 0 ? oldPrice : undefined;
    const [quantity] = useState(1);

    return (
        <Card className="product-card p-3 h-full min-h-[450px] flex flex-col relative cursor-pointer min-w-0 bg-card border border-border text-foreground">
            <div className="absolute right-3 top-3 z-10">
                <button
                    type="button"
                    aria-label="Добавить в избранное"
                    className="inline-flex items-center justify-center rounded-full border border-gray-200 bg-white/95 p-2 text-gray-700 shadow-sm transition hover:border-pink-300 hover:text-pink-600 dark:border-gray-700 dark:bg-gray-900/95 dark:text-gray-200 dark:hover:border-pink-500 dark:hover:text-pink-400"
                    tabIndex={-1}
                >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                            d="M12 21s-6.716-4.348-9.193-8.027C.664 9.763 1.35 5.39 5.09 3.8c2.037-.867 4.368-.279 5.91 1.47 1.542-1.749 3.873-2.337 5.91-1.47 3.74 1.59 4.426 5.963 2.283 9.173C18.716 16.652 12 21 12 21z"
                            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                        />
                    </svg>
                </button>
            </div>
            {/* Packshot целиком на белой подложке — как в витринной карточке */}
            <div className="product-card__media rounded-md overflow-hidden block flex-shrink-0 relative group bg-white">
                <div className="relative w-full h-48">
                    {image && image.trim() ? (
                        <Image
                            src={image}
                            alt={title}
                            fill
                            sizes="(max-width: 768px) 100vw, 33vw"
                            className="object-contain p-2 group-hover:scale-105 transition-transform"
                            loading="lazy"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted text-gray-400 text-xs">
                            Нет изображения
                        </div>
                    )}
                    {isOutOfStock && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <span className="text-white font-semibold">Нет в наличии</span>
                        </div>
                    )}
                </div>
            </div>
            <div className="product-card__body mt-3 flex-1 flex flex-col min-w-0">
                <div className="product-card__brand text-xs text-muted-foreground">{brand}</div>
                <div className="product-card__title text-sm font-medium mt-1">{title}</div>
                {sku && (
                    <p className="text-xs text-muted-foreground mt-1 font-mono">SKU: {sku}</p>
                )}
                <div className="product-card__meta mt-2 flex items-center justify-between gap-3">
                    <div>
                        <div className="product-card__price text-lg font-semibold">{formatEuro(displayPrice)}</div>
                        {displayOldPrice && (
                            <div className="product-card__price--old text-sm line-through text-gray-400 dark:text-gray-500">
                                {formatEuro(displayOldPrice)}
                            </div>
                        )}
                    </div>
                </div>
                <div className="product-card__badges mt-2 flex flex-wrap gap-2 mb-3 max-w-full overflow-hidden">
                    {Array.isArray(badges) && badges.map((badge) => (
                        <Badge key={badge} className={BADGE_STYLES[badge] + ' max-w-[90%] truncate'}>
                            {badge}
                        </Badge>
                    ))}
                    {typeof stock === 'number' && stock < 5 && stock > 0 && (
                        <Badge className="bg-orange-600 text-white max-w-[90%] truncate">
                            Осталось {stock}
                        </Badge>
                    )}
                </div>
                <div className="product-card__actions mt-auto w-full space-y-2">
                    <div className="add-to-cart space-y-3 w-full">
                        <div className="add-to-cart__quantity flex justify-center items-center gap-2 w-full min-w-0">
                            <div className="flex items-center border border-border rounded-full bg-card px-1 py-0.5 shadow-sm w-auto">
                                <button className="w-7 h-7 flex items-center justify-center text-lg text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition disabled:opacity-50" disabled tabIndex={-1} aria-label="Уменьшить количество">−</button>
                                <input id="qty-preview" type="number" min={1} value={quantity} readOnly className="w-10 h-7 mx-1 text-center bg-transparent text-base font-semibold outline-none border-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" disabled />
                                <button className="w-7 h-7 flex items-center justify-center text-lg text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition disabled:opacity-50" disabled tabIndex={-1} aria-label="Увеличить количество">+</button>
                            </div>
                        </div>
                        <button className="w-full add-to-cart__button bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-md transition opacity-60 cursor-not-allowed" disabled tabIndex={-1}>
                            В корзину
                        </button>
                    </div>
                </div>
            </div>
        </Card>
    );
};

export default ProductPreviewCard;
