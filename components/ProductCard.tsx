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
import { localizePath } from '@/lib/i18n-routing';

type Props = {
    product: Product;
};

export default function ProductCard({ product }: Props): React.ReactElement {
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
            className="product-card px-3 py-2 h-full min-h-[340px] sm:min-h-[370px] lg:min-h-0 flex flex-col relative cursor-pointer min-w-0 bg-card border border-border text-foreground focus-within:ring-2 focus-within:ring-ring group transition-shadow lg:hover:z-20 lg:hover:shadow-xl lg:hover:rounded-b-none lg:hover:border-b-transparent lg:focus-within:z-20 lg:focus-within:rounded-b-none lg:focus-within:border-b-transparent"
        >
            {/* Хедер карточки: бренд слева, вишлист справа. z-10 — поверх stretched link. */}
            <div className="product-card__header flex items-center justify-between gap-2 mb-1 min-w-0">
                <div className="product-card__brand flex-1 truncate text-xs font-semibold uppercase tracking-wide text-foreground">
                    {product.brand}
                </div>
                <div className="relative z-10 shrink-0">
                    <WishlistButton product={product} />
                </div>
            </div>

            {/* Packshot целиком, на белой подложке (как на hairshop.lv): исходники —
                фото на белом фоне разных пропорций, cover их обрезал/увеличивал. */}
            <div className="product-card__media rounded-md overflow-hidden block flex-shrink-0 relative bg-white">
                <div className="relative w-full h-48">
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
                {/* Stretched link: the whole card is one keyboard-focusable link to the product
                    (after:inset-0 overlay). Interactive children (wishlist, cart) sit above it via z-10. */}
                <Link
                    href={localizePath(`/product/${product.id}`, language)}
                    className="product-card__title text-sm font-medium hover:text-primary focus:outline-none after:absolute after:inset-0 after:content-['']"
                >
                    {stripBrandPrefix(localizedTitle, product.brand)}
                </Link>

                {product.rating > 0 && (
                    <div
                        className="product-card__rating mt-1 text-sm text-yellow-500"
                        aria-label={t('product.ratingLabel', 'Рейтинг {rating} из 5', { rating: product.rating.toFixed(1) })}
                    >
                        {product.rating.toFixed(1)} <span aria-hidden="true">★</span>
                    </div>
                )}

                <div className="product-card__badges mt-1 flex flex-wrap gap-1.5 max-w-full overflow-hidden">
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

                {/* mt-auto — прижимает строку цены к низу карточки, поэтому она на одном
                    уровне у всех карточек в ряду независимо от длины тайтла/бейджей. */}
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
                </div>

                {/* На десктопе блок действий не занимает места в карточке: по ховеру/фокусу
                    выезжает абсолютом ниже её нижней границы как продолжение карточки. */}
                <div className="product-card__actions relative z-10 mt-1 w-full space-y-2 transition-opacity lg:absolute lg:top-full lg:-inset-x-px lg:mt-0 lg:w-auto lg:bg-card lg:border lg:border-t-0 lg:border-border lg:rounded-b-xl lg:px-3 lg:pb-3 lg:shadow-xl lg:opacity-0 lg:pointer-events-none lg:group-hover:opacity-100 lg:group-hover:pointer-events-auto lg:group-focus-within:opacity-100 lg:group-focus-within:pointer-events-auto">
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
