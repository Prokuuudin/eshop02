'use client';

import React from 'react';
import Image from 'next/image';
import { Bell } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/lib/use-translation';
import { formatEuro } from '@/lib/utils';
import { stripBrandPrefix } from '@/lib/product-title';

interface ProductPreviewCardProps {
    image?: string;
    title: string;
    brand?: string;
    price?: number;
    oldPrice?: number;
    badges?: ('new' | 'sale' | 'bestseller')[];
    stock?: number;
    rating?: number;
    bulkPricingTiers?: Array<{ quantity: number; pricePerUnit: number }>;
}

const ProductPreviewCard: React.FC<ProductPreviewCardProps> = ({
    image, title, brand, price, oldPrice, badges, stock, rating, bulkPricingTiers,
}) => {
    const { t } = useTranslation();
    const isOutOfStock = stock === 0;
    const displayPrice = typeof price === 'number' && Number.isFinite(price) ? price : undefined;
    const displayOldPrice = typeof oldPrice === 'number' && oldPrice > 0 ? oldPrice : undefined;
    const firstTier = bulkPricingTiers?.slice().sort((a, b) => a.quantity - b.quantity)[0];

    return (
        <Card className="product-card px-3 py-2 min-h-[370px] flex flex-col relative min-w-0 bg-card border border-border text-foreground group shadow-sm">
            <div className="product-card__header flex items-center justify-between gap-2 mb-1 min-w-0">
                <div className="product-card__brand flex-1 truncate text-xs font-semibold uppercase tracking-wide text-foreground">{brand}</div>
                <div className="relative z-10 shrink-0">
                    <button type="button" aria-label={t('wishlist.addAria')} className="inline-flex items-center justify-center rounded-full border border-gray-200 p-2 text-[#0088C4] shadow-sm transition bg-white/95 hover:border-pink-300 hover:text-pink-600 dark:border-gray-700 dark:bg-gray-900/95 dark:text-[#0088C4] dark:hover:border-pink-500 dark:hover:text-pink-400" tabIndex={-1}>
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 21s-6.716-4.348-9.193-8.027C.664 9.763 1.35 5.39 5.09 3.8c2.037-.867 4.368-.279 5.91 1.47 1.542-1.749 3.873-2.337 5.91-1.47 3.74 1.59 4.426 5.963 2.283 9.173C18.716 16.652 12 21 12 21z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
                </div>
            </div>

            <div className="product-card__media product-image-surface rounded-md overflow-hidden block flex-shrink-0 relative">
                <div className="relative w-full h-48">
                    {image?.trim() ? (
                        <Image src={image} alt={title || t('product.imageAlt')} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-contain p-2 group-hover:scale-105 transition-transform" loading="lazy" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted text-gray-400 text-xs">{t('product.imageNotSet')}</div>
                    )}
                    {isOutOfStock && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <span className="text-white font-semibold">{t('product.outOfStock')}</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="product-card__body mt-2 flex-1 flex flex-col min-w-0">
                <div className="product-card__title text-sm font-medium">{stripBrandPrefix(title, brand ?? '')}</div>
                <div className="product-card__badges mt-1 flex flex-wrap gap-1.5 max-w-full overflow-hidden">
                    {badges?.includes('sale') && <Badge className="bg-red-600 text-white max-w-[90%] truncate">{t('product.sale')}</Badge>}
                    {badges?.includes('new') && <Badge className="bg-green-600 text-white max-w-[90%] truncate">{t('product.new')}</Badge>}
                    {badges?.includes('bestseller') && <Badge className="bg-yellow-600 text-black max-w-[90%] truncate">{t('product.bestseller')}</Badge>}
                    {typeof stock === 'number' && stock < 5 && stock > 0 && <Badge className="bg-orange-600 text-white max-w-[90%] truncate animate-pulse">{t('product.left')} {stock}</Badge>}
                </div>

                <div className="product-card__meta mt-auto pt-1 flex items-center justify-between gap-3">
                    <div>
                        {displayPrice !== undefined && (
                            <>
                                <div className="flex items-baseline gap-2">
                                    <div className="product-card__price text-lg font-semibold">{formatEuro(displayPrice, 'en-US')}</div>
                                    {displayOldPrice !== undefined && <div className="product-card__price--old text-sm line-through text-gray-400 dark:text-gray-500">{formatEuro(displayOldPrice, 'en-US')}</div>}
                                </div>
                                {firstTier && (
                                    <div className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
                                        {t('product.bulkTierPrice', undefined, { quantity: firstTier.quantity, price: formatEuro(firstTier.pricePerUnit, 'en-US') })}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    {typeof rating === 'number' && rating > 0 && (
                        <div className="product-card__rating ml-auto shrink-0 self-end text-sm text-yellow-500">
                            {rating.toFixed(1)} <span aria-hidden="true">★</span>
                        </div>
                    )}
                </div>

                <div className="product-card__actions relative z-10 mt-2 w-full space-y-2">
                    {!isOutOfStock && (
                        <div className="add-to-cart__combo flex items-stretch w-full h-9 rounded-md overflow-hidden text-white text-sm font-medium shadow divide-x divide-white/20 bg-indigo-600">
                            <button type="button" className="add-to-cart__minus w-9 shrink-0 flex items-center justify-center text-lg" tabIndex={-1}>−</button>
                            <button type="button" className="add-to-cart__button flex-1 min-w-0 px-1 flex items-center justify-center" tabIndex={-1}><span className="truncate">{t('product.addToCart')} (1)</span></button>
                            <button type="button" className="add-to-cart__plus w-9 shrink-0 flex items-center justify-center text-lg" tabIndex={-1}>+</button>
                        </div>
                    )}
                    <div className="flex w-full items-center justify-center gap-1.5 rounded-md border border-primary/40 px-2 py-2 text-xs font-medium text-primary">
                        <Bell className="h-3.5 w-3.5" />
                        {t('productNews.catalogCta')}
                    </div>
                </div>
            </div>
        </Card>
    );
};

export default ProductPreviewCard;
