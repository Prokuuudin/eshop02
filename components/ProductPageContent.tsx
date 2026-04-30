'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Product } from '@/data/products';
import { useViewedProducts } from '@/lib/viewed-products-store';
import AddToCartButton from '@/components/AddToCartButton';
import WishlistButton from '@/components/WishlistButton';
import ProductCard from '@/components/ProductCard';
import Reviews from '@/components/Reviews';
import RatingDisplay from '@/components/RatingDisplay';

import Certificates from '@/components/Certificates';
import BulkPricing from '@/components/BulkPricing';
import { Badge } from '@/components/ui/badge';
import { formatEuro } from '@/lib/utils';
import { useTranslation } from '@/lib/use-translation';
import { getMinimumOrderQuantity, getDisplayPrice } from '@/lib/customer-segmentation';

type Props = {
    product: Product;
    allProducts: Product[];
};

export default function ProductPageContent({ product, allProducts }: Props) {
    const { t, language } = useTranslation();
    const { addView, getRecentViews } = useViewedProducts();
    const recentViews = getRecentViews(4);
    const productBaseKey = `products.${product.id}`;
    const resolveProductValue = (productKey: string, fallbackKey: string): string => {
        const value = t(productKey);
        return value === productKey ? t(fallbackKey) : value;
    };
    const localizedTitle =
        language === 'en' && product.titleEn
            ? product.titleEn
            : language === 'lv' && product.titleLv
            ? product.titleLv
            : t(product.titleKey ?? `products.${product.id}.title`, product.title);
    const priceLocale = language === 'ru' ? 'ru-RU' : language === 'lv' ? 'lv-LV' : 'en-US';
    const productDescription = resolveProductValue(
        `${productBaseKey}.description`,
        'product.descriptionText'
    );
    const productSpecVolume = resolveProductValue(
        `${productBaseKey}.spec.volume`,
        'product.spec.value.volume'
    );
    const productSpecType = resolveProductValue(
        `${productBaseKey}.spec.type`,
        'product.spec.value.type'
    );
    const productSpecCountry = resolveProductValue(
        `${productBaseKey}.spec.country`,
        'product.spec.value.country'
    );
    const displayPrice = getDisplayPrice(product.price);
    const displayOldPrice = product.oldPrice ? getDisplayPrice(product.oldPrice) : undefined;
    const minOrderQuantity = getMinimumOrderQuantity(product);
    const ratingCount = product.ratingCount ?? product.reviewCount ?? 127;

    // Track view
    useEffect(() => {
        addView(product);
    }, [product, addView]);

    const relatedProducts = product.relatedProductIds
        ? allProducts.filter((p) => product.relatedProductIds?.includes(p.id)).slice(0, 4)
        : allProducts.filter((p) => p.brand === product.brand && p.id !== product.id).slice(0, 4);

    const oftenBoughtTogether = product.oftenBoughtTogether
        ? allProducts.filter((p) => product.oftenBoughtTogether?.includes(p.id)).slice(0, 4)
        : [];

    const productFeatures = [1, 2, 3, 4].map((index) =>
        t(
            `${productBaseKey}.feature${index}`,
            t(
                `product.feature${index}`,
                index === 1
                    ? 'Natural components'
                    : index === 2
                    ? 'Paraben-free'
                    : index === 3
                    ? 'Dermatologically tested'
                    : 'Suitable for all skin types'
            )
        )
    );

    // Формируем ссылки для категории и бренда
    const categoryUrl = product.category
        ? `/catalog?cat=${encodeURIComponent(product.category)}`
        : '/catalog';
    const brandUrl = product.brand
        ? `/catalog?brand=${encodeURIComponent(product.brand)}`
        : '/catalog';

    return (
        <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-8 text-gray-900 dark:text-gray-100">
            <div className="flex flex-wrap gap-2 mb-4 items-center">
                <Link href="/catalog" className="text-indigo-600 inline-block">
                    ← {t('product.backToCatalog')}
                </Link>
                <Link
                    href={categoryUrl}
                    className="inline-block rounded bg-indigo-50 text-indigo-700 px-3 py-1 text-sm font-medium hover:bg-indigo-100 transition"
                >
                    {t('product.moreFromCategory', 'Другие товары этой категории')}
                </Link>
                <Link
                    href={brandUrl}
                    className="inline-block rounded bg-indigo-50 text-indigo-700 px-3 py-1 text-sm font-medium hover:bg-indigo-100 transition"
                >
                    {t('product.moreFromBrand', 'Другие товары этого бренда')}
                </Link>
            </div>

            <div className="product-detail">
                <div className="product-detail__grid grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                    {/* Галерея изображений (до 5), уменьшенная в 2 раза */}
                    <div className="product-detail__image">
                        {(() => {
                            const images =
                                product.images && product.images.length > 0
                                    ? product.images.slice(0, 5)
                                    : product.image
                                    ? [product.image]
                                    : [];
                            const [activeImage, setActiveImage] = useState(0);
                            return (
                                <>
                                    <div className="relative mx-auto w-1/2 aspect-square bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center">
                                        {images.length > 0 && (
                                            <Image
                                                key={images[activeImage]}
                                                src={images[activeImage]}
                                                alt={localizedTitle}
                                                fill
                                                className="object-cover"
                                                sizes="(max-width: 768px) 50vw, 25vw"
                                            />
                                        )}
                                    </div>
                                    {images.length > 1 && (
                                        <div className="product-detail__thumbs flex gap-2 mt-3 justify-center">
                                            {images.map((img, idx) => (
                                                <button
                                                    key={img}
                                                    type="button"
                                                    className={`product-detail__thumb rounded border-2 transition-all ${
                                                        activeImage === idx
                                                            ? 'border-indigo-600 ring-2 ring-indigo-300'
                                                            : 'border-transparent opacity-70 hover:opacity-100'
                                                    } bg-white`}
                                                    style={{
                                                        width: 48,
                                                        height: 48,
                                                        overflow: 'hidden',
                                                    }}
                                                    onClick={() => setActiveImage(idx)}
                                                    aria-label={`Показать изображение ${idx + 1}`}
                                                >
                                                    <Image
                                                        src={img}
                                                        alt={localizedTitle + ' preview'}
                                                        width={48}
                                                        height={48}
                                                        className="object-cover"
                                                    />
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {/* Характеристики */}
                                    <div className="product-detail__specs mt-8 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                                        <h3 className="font-semibold mb-3 text-gray-900 dark:text-gray-100">
                                            {t('product.specs')}
                                        </h3>
                                        <table className="w-full text-sm">
                                            <tbody>
                                                <tr className="border-b border-gray-200 dark:border-gray-700">
                                                    <td className="py-2 font-medium text-gray-600 dark:text-gray-300">
                                                        {t('product.spec.volume')}
                                                    </td>
                                                    <td className="py-2">{productSpecVolume}</td>
                                                </tr>
                                                <tr className="border-b border-gray-200 dark:border-gray-700">
                                                    <td className="py-2 font-medium text-gray-600 dark:text-gray-300">
                                                        {t('product.spec.type')}
                                                    </td>
                                                    <td className="py-2">{productSpecType}</td>
                                                </tr>
                                                <tr>
                                                    <td className="py-2 font-medium text-gray-600 dark:text-gray-300">
                                                        {t('product.spec.country')}
                                                    </td>
                                                    <td className="py-2">{productSpecCountry}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            );
                        })()}
                    </div>

                    {/* Информация */}
                    <div className="product-detail__info">
                        <div className="product-detail__brand flex items-center gap-2 text-sm text-gray-500 dark:text-gray-300 mb-1">
                            {product.brand &&
                                (() => {
                                    try {
                                        const { BRANDS } = require('@/data/brands');
                                        const brandObj = BRANDS.find(
                                            (b) =>
                                                b.name.toLowerCase() ===
                                                    product.brand.toLowerCase() ||
                                                b.id.toLowerCase() === product.brand.toLowerCase()
                                        );
                                        if (brandObj && brandObj.logo) {
                                            return (
                                                <Image
                                                    src={brandObj.logo}
                                                    alt={brandObj.name}
                                                    width={192}
                                                    height={108}
                                                    className="inline-block align-middle object-contain border border-gray-300 dark:border-gray-600 rounded bg-white p-4"
                                                />
                                            );
                                        }
                                    } catch {}
                                    return null;
                                })()}
                            {product.brand?.toUpperCase()}
                        </div>

                        <h1 className="product-detail__title text-3xl font-bold mt-2">
                            {localizedTitle}
                        </h1>
                        {/* Бейджи */}
                        {product.badges && (
                            <div className="product-detail__badges flex gap-2 mt-4">
                                {product.badges.includes('sale') && (
                                    <Badge className="bg-red-600 text-white">
                                        {t('product.sale')}
                                    </Badge>
                                )}
                                {product.badges.includes('new') && (
                                    <Badge className="bg-green-600 text-white">
                                        {t('product.new')}
                                    </Badge>
                                )}
                                {product.badges.includes('bestseller') && (
                                    <Badge className="bg-yellow-600 text-black">
                                        {t('product.bestseller')}
                                    </Badge>
                                )}
                            </div>
                        )}

                        <div className="product-detail__rating mt-4">
                            <RatingDisplay rating={product.rating} count={ratingCount} />
                        </div>

                        {/* Цена и наличие */}
                        <div className="product-detail__prices mt-6">
                            {displayOldPrice && (
                                <div className="text-sm line-through text-gray-400">
                                    {formatEuro(displayOldPrice, priceLocale)}
                                </div>
                            )}
                            <div className="text-4xl font-bold text-indigo-600">
                                {formatEuro(displayPrice, priceLocale)}
                            </div>
                            {displayOldPrice && (
                                <div className="text-sm text-green-600 mt-1">
                                    {t('product.savings')}:{' '}
                                    {formatEuro(displayOldPrice - displayPrice, priceLocale)}
                                </div>
                            )}
                        </div>

                        {/* Наличие */}
                        <div className="product-detail__stock mt-4 p-3 rounded bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800">
                            {product.stock === 0 ? (
                                <p className="text-red-600 font-medium">
                                    {t('product.outOfStock')}
                                </p>
                            ) : product.stock < 5 ? (
                                <p className="text-orange-600 font-medium">
                                    {t('product.left')} {product.stock} {t('product.pcs')} —{' '}
                                    {t('product.hurry')}
                                </p>
                            ) : (
                                <p className="text-green-600 font-medium">
                                    {t('product.inStock')}: {product.stock} {t('product.pcs')}
                                </p>
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
                                <WishlistButton product={product} asButton />
                            </div>
                            {minOrderQuantity > 1 && (
                                <p className="text-xs text-gray-500 dark:text-gray-300 mt-2">
                                    {t('product.minimumOrder')}: {minOrderQuantity}{' '}
                                    {t('product.pcs')}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-6 mb-12">
                    <BulkPricing product={product} />
                    <Certificates product={product} />
                </div>

                {/* Reviews */}
                <Reviews productId={product.id} />

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

                {/* Often bought together */}
                {oftenBoughtTogether.length > 0 && (
                    <section className="mb-12">
                        <h2 className="text-2xl font-bold mb-6">
                            {t('product.oftenBoughtTogether')}
                        </h2>
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
                            {recentViews
                                .filter((p) => p.id !== product.id)
                                .map((p) => (
                                    <ProductCard key={p.id} product={p} />
                                ))}
                        </div>
                    </section>
                )}
            </div>
        </main>
    );
}
