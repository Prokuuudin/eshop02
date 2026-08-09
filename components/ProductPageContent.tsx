'use client';
import { ProductGalleryBlock } from '@/components/ProductGalleryBlock';
import { ProductInfo } from '@/components/ProductInfo';
import { ProductNavigationLinks } from '@/components/ProductNavigationLinks';
import { ProductReviews } from '@/components/ProductReviews';
import { ProductBulkPricing } from '@/components/ProductBulkPricing';
import { ProductRelatedList } from '@/components/ProductRelatedList';
import { ProductBenefits } from '@/components/ProductBenefits';
import ProductRequestSection from '@/components/ProductRequestSection';
import { ProductStoreAvailability } from '@/components/ProductStoreAvailability';
import type { WarehouseAvailability } from '@/lib/warehouse-availability';

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
    warehouseAvailability: {
        available: boolean;
        updatedAt: string | null;
        stores: WarehouseAvailability[];
    };
};

export default function ProductPageContent({ product, relatedProducts, oftenBoughtTogether, manufacturer, distributor, warehouseAvailability }: Props): JSX.Element {
    const {
        t,
        language,
        localizedTitle,
        productDescription,
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
        ? `/category/${encodeURIComponent(product.category)}`
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
                        productApplication={productApplication}
                        productWarnings={productWarnings}
                        language={language}
                        manufacturer={manufacturer}
                        distributor={distributor}
                    />
                    {/* Правая колонка: вся остальная информация */}
                    <div className="contents md:flex md:flex-col md:gap-4">
                        <div className="order-2 md:order-none">
                            <ProductInfo
                                product={product}
                                localizedTitle={localizedTitle}
                                ratingCount={ratingCount}
                                displayPrice={displayPrice}
                                displayOldPrice={displayOldPrice}
                                priceLocale={priceLocale}
                                minOrderQuantity={minOrderQuantity}
                            />
                            <ProductStoreAvailability
                                language={language}
                                {...warehouseAvailability}
                            />
                        </div>
                        <div className="order-5 md:order-none">
                            <ProductBenefits />
                        </div>
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
                <ProductRequestSection embedded />
                <ProductRelatedList
                    title={t('product.recentlyViewed')}
                    products={recentViews.filter((p) => p.id !== product.id)}
                />
            </div>
        </main>
    );
}
