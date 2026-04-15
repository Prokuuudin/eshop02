"use client"
import React from 'react'
import { useTranslation } from '@/lib/use-translation'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Product } from '../data/products'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import AddToCartButton from './AddToCartButton'
import WishlistButton from './WishlistButton'
import { formatEuro } from '@/lib/utils'
import { calculatePrice, getDisplayPrice } from '@/lib/customer-segmentation'

type Props = {
  product: Product
}

export default function ProductCard({ product }: Props) {
  const { t } = useTranslation();
  const router = useRouter()
  const isOutOfStock = product.stock === 0;
  const localizedTitle = t(product.titleKey ?? `products.${product.id}.title`, product.title)
  const displayPrice = getDisplayPrice(product.price)
  const displayOldPrice = product.oldPrice ? getDisplayPrice(product.oldPrice) : undefined
  const firstTier = product.bulkPricingTiers?.slice().sort((a, b) => a.quantity - b.quantity)[0]
  const firstTierPrice = firstTier ? calculatePrice(product, firstTier.quantity) : null

  const handleCardClick = (event: React.MouseEvent<HTMLElement>): void => {
    const target = event.target as HTMLElement
    if (target.closest('a, button, input, select, textarea, label, [role="button"]')) {
      return
    }

    router.push(`/product/${product.id}`)
  }

  return (
    <Card className="product-card p-3 h-full min-h-[450px] flex flex-col relative cursor-pointer min-w-0 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100" onClick={handleCardClick}>
      <div className="absolute right-3 top-3 z-10">
        <WishlistButton product={product} />
      </div>

      <Link href={`/product/${product.id}`} className="product-card__media rounded-md overflow-hidden block flex-shrink-0 relative group">
        <div className="relative w-full h-48">
          <Image
            src={product.image}
            alt={localizedTitle || t('product.imageAlt')}
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover group-hover:scale-105 transition-transform"
            loading="lazy"
          />
          {isOutOfStock && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <span className="text-white font-semibold">{t('product.outOfStock')}</span>
            </div>
          )}
        </div>
      </Link>

      <div className="product-card__body mt-3 flex-1 flex flex-col min-w-0">
        <div className="product-card__brand text-xs text-gray-500 dark:text-gray-300">{product.brand}</div>
        <Link href={`/product/${product.id}`} className="product-card__title text-sm font-medium mt-1 hover:text-indigo-600">
          {localizedTitle}
        </Link>

        {product.sku && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-mono">
            SKU: {product.sku}
          </p>
        )}

        <div className="product-card__meta mt-2 flex items-center justify-between gap-3">
          <div>
            <div className="product-card__price text-lg font-semibold">{formatEuro(displayPrice, 'en-US')}</div>
            {displayOldPrice && (
              <div className="product-card__price--old text-sm line-through text-gray-400 dark:text-gray-500">{formatEuro(displayOldPrice, 'en-US')}</div>
            )}
            {firstTier && firstTierPrice !== null && (
              <div className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
                При покупке {firstTier.quantity}+: {formatEuro(firstTierPrice, 'en-US')} за шт
              </div>
            )}
          </div>

          <div className="product-card__rating text-sm text-yellow-500">{product.rating.toFixed(1)} ★</div>
        </div>

        <div className="product-card__badges mt-2 flex flex-wrap gap-2 mb-3 max-w-full overflow-hidden">
            {product.badges?.includes('sale') && <Badge className="bg-red-600 text-white max-w-[90%] truncate">{t('product.sale')}</Badge>}
            {product.badges?.includes('new') && <Badge className="bg-green-600 text-white max-w-[90%] truncate">{t('product.new')}</Badge>}
            {product.badges?.includes('bestseller') && <Badge className="bg-yellow-600 text-black max-w-[90%] truncate">{t('product.bestseller')}</Badge>}
            {product.stock < 5 && product.stock > 0 && (
              <Badge className="bg-orange-600 text-white max-w-[90%] truncate">{t('product.left')} {product.stock}</Badge>
            )}
        </div>

        <div className="product-card__actions mt-auto w-full space-y-2">
          <AddToCartButton product={product} />
        </div>
      </div>
    </Card>
  )
}
