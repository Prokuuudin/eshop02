'use client';
import React from 'react';
import { useTranslation } from '@/lib/use-translation';
import Image from 'next/image';
import Link from 'next/link';
import { Product } from '../data/products';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import AddToCartButton from './AddToCartButton';
import WishlistButton from './WishlistButton';
import { StockNotifyButton } from './StockNotifyButton';

import { formatEuro } from '@/lib/utils';
import { calculatePrice, getDisplayPrice } from '@/lib/customer-segmentation';
import { useAuthStore } from '@/lib/auth-store';
import { stripBrandPrefix } from '@/lib/product-title';

type Props = {
    product: Product;
};

export default function ProductCard({ product }: Props) {
    const { t, language } = useTranslation();
    const isOutOfStock = product.stock === 0;
    const localizedTitle =
        language === 'en' && product.titleEn
            ? product.titleEn
            : language === 'lv' && product.titleLv
            ? product.titleLv
            : t(product.titleKey ?? `products.${product.id}.title`, product.title);
    const displayPrice = getDisplayPrice(product.price);
    const displayOldPrice = product.oldPrice ? getDisplayPrice(product.oldPrice) : undefined;
    const firstTier = product.bulkPricingTiers?.slice().sort((a, b) => a.quantity - b.quantity)[0];
    const firstTierPrice = firstTier ? calculatePrice(product, firstTier.quantity) : null;

    // Reactive auth from the shared store. `isHydrated` lets us show a neutral placeholder
    // until the real auth state is known, instead of flashing the login prompt for logged-in users.
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const isHydrated = useAuthStore((s) => s.isHydrated);

    return (
        <Card
            className="product-card px-3 py-2 h-full min-h-[310px] sm:min-h-[340px] lg:min-h-[360px] flex flex-col relative cursor-pointer min-w-0 bg-card border border-border text-foreground focus-within:ring-2 focus-within:ring-ring group"
        >
            <div className="absolute right-3 top-2 z-10">
                <WishlistButton product={product} />
            </div>

            {/* Packshot целиком, на белой подложке (как на hairshop.lv): исходники —
                фото на белом фоне разных пропорций, cover их обрезал/увеличивал. */}
            <div className="product-card__media rounded-md overflow-hidden block flex-shrink-0 relative bg-white">
                <div className="relative w-full h-40">
                    {product.image && product.image.trim() ? (
                        <Image
                            src={product.image}
                            alt={localizedTitle || t('product.imageAlt')}
                            fill
                            sizes="(max-width: 768px) 100vw, 33vw"
                            className="object-contain p-2 group-hover:scale-105 transition-transform"
                            loading="lazy"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted text-gray-400 text-xs">
                            {t('product.imageNotSet')}
                        </div>
                    )}
                    {isOutOfStock && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <span className="text-white font-semibold">
                                {t('product.outOfStock')}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            <div className="product-card__body mt-2 flex-1 flex flex-col min-w-0">
                <div className="product-card__brand text-xs text-muted-foreground">
                    {product.brand}
                </div>
                {/* Stretched link: the whole card is one keyboard-focusable link to the product
                    (after:inset-0 overlay). Interactive children (wishlist, cart) sit above it via z-10. */}
                <Link
                    href={`/product/${product.id}`}
                    className="product-card__title text-sm font-medium mt-1 hover:text-primary focus:outline-none after:absolute after:inset-0 after:content-['']"
                >
                    {stripBrandPrefix(localizedTitle, product.brand)}
                </Link>

                {product.sku && (
                    <p className="text-xs text-muted-foreground mt-1 font-mono">
                        SKU: {product.sku}
                    </p>
                )}

                <div className="product-card__meta mt-auto pt-1 flex items-center justify-between gap-3">
                    <div>
                        {!isHydrated ? (
                            // Neutral placeholder until auth is known — avoids the login/price flash.
                            <div className="h-7 w-20 rounded bg-muted animate-pulse" />
                        ) : isAuthenticated ? (
                            <>
                                <div className="flex items-baseline gap-2">
                                    <div className="product-card__price text-lg font-semibold">
                                        {formatEuro(displayPrice, 'en-US')}
                                    </div>
                                    {displayOldPrice && (
                                        <div className="product-card__price--old text-sm line-through text-gray-400 dark:text-gray-500">
                                            {formatEuro(displayOldPrice, 'en-US')}
                                        </div>
                                    )}
                                </div>
                                {firstTier && firstTierPrice !== null && (
                                    <div className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
                                        {t('product.bulkTierPrice', undefined, {
                                            quantity: firstTier.quantity,
                                            price: formatEuro(firstTierPrice, 'en-US'),
                                        })}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="text-gray-400 text-sm font-medium">
                                {t('product.loginToSeePrice', 'Войдите, чтобы увидеть цену')}
                            </div>
                        )}
                    </div>

                    {product.rating > 0 && (
                        <div
                            className="product-card__rating text-sm text-yellow-500"
                            aria-label={t('product.ratingLabel', 'Рейтинг {rating} из 5', { rating: product.rating.toFixed(1) })}
                        >
                            {product.rating.toFixed(1)} <span aria-hidden="true">★</span>
                        </div>
                    )}
                </div>

                <div className="product-card__badges mt-1 flex flex-wrap gap-1.5 mb-2 max-w-full overflow-hidden">
                    {product.badges?.includes('sale') && (
                        <Badge className="bg-red-600 text-white max-w-[90%] truncate">
                            {t('product.sale')}
                        </Badge>
                    )}
                    {product.badges?.includes('new') && (
                        <Badge className="bg-green-600 text-white max-w-[90%] truncate">
                            {t('product.new')}
                        </Badge>
                    )}
                    {product.badges?.includes('bestseller') && (
                        <Badge className="bg-yellow-600 text-black max-w-[90%] truncate">
                            {t('product.bestseller')}
                        </Badge>
                    )}
                    {product.stock < 5 && product.stock > 0 && (
                        <Badge className="bg-orange-600 text-white max-w-[90%] truncate animate-pulse">
                            {t('product.left')} {product.stock}
                        </Badge>
                    )}
                </div>

                <div className="product-card__actions relative z-10 mt-1 w-full space-y-2">
                    {isOutOfStock ? (
                        <StockNotifyButton productId={product.id} productTitle={localizedTitle} compact />
                    ) : (
                        <AddToCartButton product={product} />
                    )}
                </div>
            </div>
        </Card>
    );
}
