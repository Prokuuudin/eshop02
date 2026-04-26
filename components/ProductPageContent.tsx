'use client'

import React, { useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Product } from '@/data/products'
import { useViewedProducts } from '@/lib/viewed-products-store'
import AddToCartButton from '@/components/AddToCartButton'
import WishlistButton from '@/components/WishlistButton'
import ProductCard from '@/components/ProductCard'
import Reviews from '@/components/Reviews'
import RatingDisplay from '@/components/RatingDisplay'
import TechnicalSpecs from '@/components/TechnicalSpecs'
import Certificates from '@/components/Certificates'
import BulkPricing from '@/components/BulkPricing'
import { Badge } from '@/components/ui/badge'
import { formatEuro } from '@/lib/utils'
import { useTranslation } from '@/lib/use-translation'
import {
  getMinimumOrderQuantity,
  getDisplayPrice
} from '@/lib/customer-segmentation'

type Props = {
  product: Product
  allProducts: Product[]
}

export default function ProductPageContent({ product, allProducts }: Props) {
  const { t, language } = useTranslation()
  const { addView, getRecentViews } = useViewedProducts()
  const recentViews = getRecentViews(4)
  const productBaseKey = `products.${product.id}`
  const resolveProductValue = (productKey: string, fallbackKey: string): string => {
    const value = t(productKey)
    return value === productKey ? t(fallbackKey) : value
  }
  const localizedTitle = (language === 'en' && product.titleEn)
    ? product.titleEn
    : (language === 'lv' && product.titleLv)
      ? product.titleLv
      : t(product.titleKey ?? `products.${product.id}.title`, product.title)
  const priceLocale = language === 'ru' ? 'ru-RU' : language === 'lv' ? 'lv-LV' : 'en-US'
  const productDescription = resolveProductValue(`${productBaseKey}.description`, 'product.descriptionText')
  const productSpecVolume = resolveProductValue(`${productBaseKey}.spec.volume`, 'product.spec.value.volume')
  const productSpecType = resolveProductValue(`${productBaseKey}.spec.type`, 'product.spec.value.type')
  const productSpecCountry = resolveProductValue(`${productBaseKey}.spec.country`, 'product.spec.value.country')
  const displayPrice = getDisplayPrice(product.price)
  const displayOldPrice = product.oldPrice ? getDisplayPrice(product.oldPrice) : undefined
  const minOrderQuantity = getMinimumOrderQuantity(product)
  const ratingCount = product.ratingCount ?? product.reviewCount ?? 127

  // Track view
  useEffect(() => {
    addView(product)
  }, [product, addView])

  const relatedProducts = product.relatedProductIds
    ? allProducts.filter((p) => product.relatedProductIds?.includes(p.id)).slice(0, 4)
    : allProducts.filter((p) => p.brand === product.brand && p.id !== product.id).slice(0, 4)

  const oftenBoughtTogether = product.oftenBoughtTogether
    ? allProducts.filter((p) => product.oftenBoughtTogether?.includes(p.id)).slice(0, 4)
    : []

  const productFeatures = [1, 2, 3, 4].map((index) =>
    t(
      `${productBaseKey}.feature${index}`,
      t(`product.feature${index}`, index === 1
        ? 'Natural components'
        : index === 2
          ? 'Paraben-free'
          : index === 3
            ? 'Dermatologically tested'
            : 'Suitable for all skin types')
    )
  )

  return (
    <main className="w-full px-4 py-8 text-gray-900 dark:text-gray-100">
      <Link href="/catalog" className="text-indigo-600 mb-4 inline-block">
        ← {t('product.backToCatalog')}
      </Link>

      <div className="product-detail">
        <div className="product-detail__grid grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          {/* Изображение */}
          <div className="product-detail__image">
            <div className="relative w-full aspect-square bg-gray-100 rounded-lg overflow-hidden">
              <Image
                src={product.image}
                alt={localizedTitle}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>

            {/* Бейджи */}
            {product.badges && (
              <div className="product-detail__badges flex gap-2 mt-4">
                {product.badges.includes('sale') && <Badge className="bg-red-600 text-white">{t('product.sale')}</Badge>}
                {product.badges.includes('new') && <Badge className="bg-green-600 text-white">{t('product.new')}</Badge>}
                {product.badges.includes('bestseller') && <Badge className="bg-yellow-600 text-black">{t('product.bestseller')}</Badge>}
              </div>
            )}
          </div>

          {/* Информация */}
          <div className="product-detail__info">
            <div className="product-detail__brand text-sm text-gray-500 dark:text-gray-300">{product.brand}</div>
            <h1 className="product-detail__title text-3xl font-bold mt-2">{localizedTitle}</h1>

            <div className="product-detail__rating mt-4">
              <RatingDisplay rating={product.rating} count={ratingCount} />
            </div>

            {/* Цена и наличие */}
            <div className="product-detail__prices mt-6">
              {displayOldPrice && (
                <div className="text-sm line-through text-gray-400">{formatEuro(displayOldPrice, priceLocale)}</div>
              )}
              <div className="text-4xl font-bold text-indigo-600">{formatEuro(displayPrice, priceLocale)}</div>
              {displayOldPrice && (
                <div className="text-sm text-green-600 mt-1">{t('product.savings')}: {formatEuro(displayOldPrice - displayPrice, priceLocale)}</div>
              )}
            </div>

            {/* Наличие */}
            <div className="product-detail__stock mt-4 p-3 rounded bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800">
              {product.stock === 0 ? (
                <p className="text-red-600 font-medium">{t('product.outOfStock')}</p>
              ) : product.stock < 5 ? (
                <p className="text-orange-600 font-medium">{t('product.left')} {product.stock} {t('product.pcs')} — {t('product.hurry')}</p>
              ) : (
                <p className="text-green-600 font-medium">{t('product.inStock')}: {product.stock} {t('product.pcs')}</p>
              )}
            </div>

            {/* Описание */}
            <div className="product-detail__description mt-6 text-gray-700 dark:text-gray-300">
              <p>{productDescription}</p>
              <ul className="list-disc list-inside mt-3 text-sm space-y-1">
                {productFeatures.map((feature, index) => (
                  <li key={`${product.id}-feature-${index}`}>{feature}</li>
                ))}
              </ul>
            </div>

            {/* Кнопка в корзину */}
            <div className="product-detail__actions mt-8">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[220px]">
                  <AddToCartButton product={product} />
                </div>
                <WishlistButton product={product} className="h-11 w-11 rounded-md" />
              </div>
              {minOrderQuantity > 1 && (
                <p className="text-xs text-gray-500 dark:text-gray-300 mt-2">{t('product.minimumOrder')}: {minOrderQuantity} {t('product.pcs')}</p>
              )}
            </div>

            {/* Характеристики */}
            <div className="product-detail__specs mt-8 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold mb-3 text-gray-900 dark:text-gray-100">{t('product.specs')}</h3>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <td className="py-2 font-medium text-gray-600 dark:text-gray-300">{t('product.spec.volume')}</td>
                    <td className="py-2">{productSpecVolume}</td>
                  </tr>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <td className="py-2 font-medium text-gray-600 dark:text-gray-300">{t('product.spec.type')}</td>
                    <td className="py-2">{productSpecType}</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-medium text-gray-600 dark:text-gray-300">{t('product.spec.country')}</td>
                    <td className="py-2">{productSpecCountry}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6 mb-12">
          <TechnicalSpecs product={product} />
          <BulkPricing product={product} />
          <Certificates product={product} />
        </div>

        {/* Often bought together */}
        {oftenBoughtTogether.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6">{t('product.oftenBoughtTogether')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {oftenBoughtTogether.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}

        {/* Related products */}
        {relatedProducts.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6">{t('product.relatedProducts')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {relatedProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}

        {/* Recently viewed */}
        {recentViews.length > 1 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6">{t('product.recentlyViewed')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {recentViews.filter((p) => p.id !== product.id).map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}

        {/* Reviews */}
        <Reviews productId={product.id} />
      </div>
    </main>
  )
}
