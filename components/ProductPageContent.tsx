'use client';
import { CreditCalculator } from '@/components/CreditCalculator';
import { ProductGalleryBlock } from '@/components/ProductGalleryBlock';
import { ProductInfo } from '@/components/ProductInfo';
import { ProductNavigationLinks } from '@/components/ProductNavigationLinks';
import { ProductReviews } from '@/components/ProductReviews';
import { ProductBulkPricing } from '@/components/ProductBulkPricing';
import { ProductRelatedList } from '@/components/ProductRelatedList';
import { ProductBenefits } from '@/components/ProductBenefits';

import React, { useEffect } from 'react';
import type { JSX } from 'react';
import { Product } from '@/data/products';
import { useViewedProducts } from '@/lib/viewed-products-store';

import { useProductLocalization } from '@/hooks/useProductLocalization';

import { getMinimumOrderQuantity, getDisplayPrice } from '@/lib/customer-segmentation';
import { getCurrentUser } from '@/lib/auth';

type Props = {
    product: Product;
    allProducts: Product[];
};

export default function ProductPageContent({ product, allProducts }: Props): JSX.Element {
    const {
        t,
        language,
        localizedTitle,
        productDescription,
        productSpecVolume,
        productSpecType,
        productSpecCountry,
        productFeatures,
    } = useProductLocalization(product);
    const priceLocale = language === 'ru' ? 'ru-RU' : language === 'lv' ? 'lv-LV' : 'en-US';
    const displayPrice = getDisplayPrice(product.price);
    const displayOldPrice = product.oldPrice ? getDisplayPrice(product.oldPrice) : undefined;
    const { addView, getRecentViews } = useViewedProducts();
    const recentViews = getRecentViews(4);

    // Проверка авторизации пользователя
    const [isAuthenticated, setIsAuthenticated] = React.useState<boolean>(false);
    React.useEffect(() => {
        if (typeof window !== 'undefined') {
            setIsAuthenticated(!!getCurrentUser());
            // Подписка на событие смены пользователя
            const handler = () => setIsAuthenticated(!!getCurrentUser());
            window.addEventListener('eshop-user-changed', handler);
            return () => window.removeEventListener('eshop-user-changed', handler);
        }
    }, []);
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

    // Формируем ссылки для категории и бренда
    const categoryUrl = product.category
        ? `/catalog?cat=${encodeURIComponent(product.category)}`
        : '/catalog';
    const brandUrl = product.brand
        ? `/catalog?brand=${encodeURIComponent(product.brand)}`
        : '/catalog';

    // useState для фотопревью и видеопревью
    const demoVideos = product.demoVideo || [];
    const images =
        product.images && product.images.length > 0
            ? product.images.slice(0, 5)
            : product.image
            ? [product.image]
            : [];

    return (
        <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-8 text-gray-900 dark:text-gray-100">
            <ProductNavigationLinks categoryUrl={categoryUrl} brandUrl={brandUrl} />

            <div className="product-detail">
                <div className="product-detail__grid grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                    {/* Левая колонка: галерея, дисклеймер, бенефиты, характеристики, производитель */}
                    <ProductGalleryBlock
                        images={images}
                        demoVideos={demoVideos}
                        title={localizedTitle}
                        productSpecVolume={productSpecVolume}
                        productSpecType={productSpecType}
                        productSpecCountry={productSpecCountry}
                        brandId={product.brand}
                        language={language}
                        product={product}
                    />
                    {/* Правая колонка: вся остальная информация */}
                    <div className="flex flex-col gap-4">
                        <ProductInfo
                            product={product}
                            localizedTitle={localizedTitle}
                            ratingCount={ratingCount}
                            displayPrice={displayPrice}
                            displayOldPrice={displayOldPrice}
                            isAuthenticated={isAuthenticated}
                            priceLocale={priceLocale}
                            productDescription={productDescription}
                            productFeatures={productFeatures}
                            minOrderQuantity={minOrderQuantity}
                        />
                        <ProductBenefits />
                        <CreditCalculator price={product.price} />
                    </div>
                </div>
                <ProductBulkPricing product={product} />
                <ProductReviews productId={product.id} />
                <ProductRelatedList
                    title={t('product.relatedProducts')}
                    products={relatedProducts}
                />
                <ProductRelatedList
                    title={t('product.oftenBoughtTogether')}
                    products={oftenBoughtTogether}
                />
                <ProductRelatedList
                    title={t('product.recentlyViewed')}
                    products={recentViews.filter((p) => p.id !== product.id)}
                />
            </div>
        </main>
    );
}
