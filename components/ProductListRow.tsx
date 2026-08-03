'use client';
import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Product } from '../data/products';
import { useTranslation } from '@/lib/use-translation';
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils';
import { calculatePrice, getDisplayPrice } from '@/lib/customer-segmentation';
import { useAuthStore } from '@/lib/auth-store';
import { stripBrandPrefix } from '@/lib/product-title';
import { Badge } from './ui/badge';
import AddToCartButton from './AddToCartButton';
import WishlistButton from './WishlistButton';
import { StockNotifyButton } from './StockNotifyButton';
import { localizePath } from '@/lib/i18n-routing';

type Props = { product: Product };

export default function ProductListRow({ product }: Props): React.ReactElement {
  const { t, language } = useTranslation();
  const locale = getLocaleFromLanguage(language);
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

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  return (
    <div className="product-list-row flex items-center gap-4 p-3 rounded-lg border border-border bg-card hover:shadow-sm transition-shadow">
      {/* Image */}
      <Link href={localizePath(`/product/${product.id}`, language)} className="flex-shrink-0 relative w-20 h-20 rounded-md overflow-hidden bg-white">
        {product.image && product.image.trim() ? (
          <Image
            src={product.image}
            alt={localizedTitle}
            fill
            sizes="80px"
            className="object-contain p-1"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
            {t('product.imageNotSet')}
          </div>
        )}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="text-white text-xs font-semibold">{t('product.outOfStock')}</span>
          </div>
        )}
      </Link>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{product.brand}</p>
        <Link href={localizePath(`/product/${product.id}`, language)} className="text-sm font-medium hover:text-primary line-clamp-2">
          {stripBrandPrefix(localizedTitle, product.brand)}
        </Link>
        {product.sku && (
          <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5">SKU: {product.sku}</p>
        )}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {product.rating > 0 && (
            <span
              className="text-xs text-yellow-500"
              aria-label={t('product.ratingLabel', 'Рейтинг {rating} из 5', { rating: product.rating.toFixed(1) })}
            >
              {product.rating.toFixed(1)} <span aria-hidden="true">★</span>
            </span>
          )}
          {product.badges?.includes('sale') && (
            <Badge className="bg-red-600 text-white text-xs">{t('product.sale')}</Badge>
          )}
          {product.badges?.includes('new') && (
            <Badge className="bg-green-600 text-white text-xs">{t('product.new')}</Badge>
          )}
          {product.stock < 5 && product.stock > 0 && (
            <Badge className="bg-orange-600 text-white text-xs animate-pulse">
              {t('product.left')} {product.stock}
            </Badge>
          )}
        </div>
      </div>

      {/* Price + Action */}
      <div className="flex flex-col items-end gap-2 flex-shrink-0 min-w-[140px]">
        {!isHydrated ? (
          <div className="h-6 w-20 rounded bg-muted animate-pulse" />
        ) : isAuthenticated ? (
          <div className="text-right">
            <div className="text-base font-semibold">{formatEuro(displayPrice, locale)}</div>
            {displayOldPrice && (
              <div className="text-xs line-through text-gray-400">{formatEuro(displayOldPrice, locale)}</div>
            )}
            {firstTier && firstTierPrice !== null && (
              <div className="text-xs text-emerald-700 dark:text-emerald-300">
                {t('product.bulkTierPrice', undefined, {
                  quantity: firstTier.quantity,
                  price: formatEuro(firstTierPrice, locale),
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="text-gray-400 text-sm">{t('product.loginToSeePrice', 'Войдите, чтобы увидеть цену')}</div>
        )}
        <div className="flex items-center gap-1">
          {isOutOfStock ? (
            <StockNotifyButton productId={product.id} productTitle={localizedTitle} compact />
          ) : (
            <AddToCartButton product={product} />
          )}
          <WishlistButton product={product} />
        </div>
      </div>
    </div>
  );
}
