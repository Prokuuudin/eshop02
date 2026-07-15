'use client';
import { ProductGalleryBlock } from '@/components/ProductGalleryBlock';
import { ProductInfo } from '@/components/ProductInfo';
import { ProductNavigationLinks } from '@/components/ProductNavigationLinks';
import { ProductReviews } from '@/components/ProductReviews';
import { ProductBulkPricing } from '@/components/ProductBulkPricing';
import { ProductRelatedList } from '@/components/ProductRelatedList';
import { ProductBenefits } from '@/components/ProductBenefits';
import ProductRequestSection from '@/components/ProductRequestSection';

import React, { useEffect } from 'react';
import type { JSX } from 'react';
import { Product } from '@/data/products';
import { useViewedProducts } from '@/lib/viewed-products-store';
import { brandSlug } from '@/lib/brand-slug';
import type { BrandManufacturerInfo } from '@/lib/brands-config';

import { useProductLocalization } from '@/hooks/useProductLocalization';

import { getMinimumOrderQuantity, getDisplayPrice } from '@/lib/customer-segmentation';

type Props = {
    product: Product;
    relatedProducts: Product[];
    oftenBoughtTogether: Product[];
    manufacturer?: BrandManufacturerInfo;
    distributor?: BrandManufacturerInfo;
};

export default function ProductPageContent({ product, relatedProducts, oftenBoughtTogether, manufacturer, distributor }: Props): JSX.Element {
    const {
        t,
        language,
        localizedTitle,
        productDescription,
        productSpecVolume,
        productSpecType,
        productSpecCountry,
        productApplication,
        productWarnings,
        productFeatures,
    } = useProductLocalization(product);
    const priceLocale = language === 'ru' ? 'ru-RU' : language === 'lv' ? 'lv-LV' : 'en-US';
    const displayPrice = getDisplayPrice(product.price);
    const displayOldPrice = product.oldPrice ? getDisplayPrice(product.oldPrice) : undefined;
    const { addView, getRecentViews } = useViewedProducts();
    const recentViews = getRecentViews(4);

    const minOrderQuantity = getMinimumOrderQuantity(product);
    const ratingCount = product.ratingCount ?? product.reviewCount ?? 0;

    // Track view
    useEffect(() => {
        addView(product);
    }, [product, addView]);

    // Формируем ссылки для категории и бренда
    const categoryUrl = product.category
        ? `/catalog?cat=${encodeURIComponent(product.category)}`
        : '/catalog';
    const brandUrl = product.brand
        ? `/catalog?brand=${encodeURIComponent(brandSlug(product.brand))}`
        : '/catalog';

    // useState для фотопревью и видеопревью
    const demoVideos = product.demoVideo || [];
    const images =
        product.images && product.images.length > 0
            ? product.images
            : product.image
            ? [product.image]
            : [];

    return (
        <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-8 text-foreground">
            <ProductNavigationLinks categoryUrl={categoryUrl} brandUrl={brandUrl} />

            <div className="product-detail">
                <div className="product-detail__grid grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                    {/* Левая колонка: галерея, дисклеймер, бенефиты, характеристики, производитель */}
                    <ProductGalleryBlock
                        product={product}
                        images={images}
                        demoVideos={demoVideos}
                        title={localizedTitle}
                        productDescription={productDescription}
                        productFeatures={productFeatures}
                        productSpecVolume={productSpecVolume}
                        productSpecType={productSpecType}
                        productSpecCountry={productSpecCountry}
                        productApplication={productApplication}
                        productWarnings={productWarnings}
                        language={language}
                        manufacturer={manufacturer}
                        distributor={distributor}
                    />
                    {/* Правая колонка: вся остальная информация */}
                    <div className="flex flex-col gap-4">
                        <ProductInfo
                            product={product}
                            localizedTitle={localizedTitle}
                            ratingCount={ratingCount}
                            displayPrice={displayPrice}
                            displayOldPrice={displayOldPrice}
                            priceLocale={priceLocale}
                            minOrderQuantity={minOrderQuantity}
                        />
                        <ProductBenefits />
                    </div>
                </div>
                <ProductBulkPricing product={product} />
                <ProductReviews productId={product.id} />
                <ProductRelatedList
                    title={t('product.relatedProducts')}
                    products={relatedProducts}
                    variant="list"
                />
                <ProductRelatedList
                    title={t('product.oftenBoughtTogether')}
                    products={oftenBoughtTogether}
                    variant="list"
                />
                <ProductRequestSection embedded />
                <ProductRelatedList
                    title={t('product.recentlyViewed')}
                    products={recentViews.filter((p) => p.id !== product.id)}
                />
            </div>
        </main>
    );
}
