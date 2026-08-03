import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ProductPageContent from '@/components/ProductPageContent';
import { getSiteUrl } from '@/lib/site-url';
import { localizePath, resolveLanguage } from '@/lib/i18n-routing';
import { getMergedProducts } from '@/lib/product-overrides-store';
import { getBrandsConfigFromStore } from '@/lib/brands-server-store';
import { brandSlug } from '@/lib/brand-slug';
import { buildProductIndex, pickRelated, pickBoughtTogether } from '@/lib/related-products';
import copurchaseData from '@/data/product-bought-together.json';
import { serializeJsonLd } from '@/lib/json-ld';
import { getServerUser } from '@/lib/server-auth';
import { redactProductPrices } from '@/lib/product-price-visibility';
import { getProductPublicReviews } from '@/lib/reviews-data-store';
import { buildPublicPageMetadata } from '@/lib/page-metadata';

const COPURCHASE = copurchaseData as Record<string, string[]>;

type PageProps = {
    params: Promise<{
        lang: string;
        id: string;
    }>;
};

const localizedProductText = (product: Awaited<ReturnType<typeof getMergedProducts>>[number], language: string) => ({
    title: language === 'en'
        ? product.titleEn?.trim() || product.title
        : language === 'lv'
            ? product.titleLv?.trim() || product.title
            : product.title,
    description: language === 'en'
        ? product.technicalSpecs?.__descriptionEn?.trim() || product.description
        : language === 'lv'
            ? product.technicalSpecs?.__descriptionLv?.trim() || product.description
            : product.description,
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id, lang } = await params;
    const language = resolveLanguage(lang);
    const mergedProducts = await getMergedProducts();
    const product = mergedProducts.find((p) => p.id === id);

    if (!product) notFound();

    const productPath = `/product/${product.id}`;
    const localized = localizedProductText(product, language);
    const metaTitle = language === 'ru' && product.metaTitle?.trim()
        ? product.metaTitle.trim()
        : `${localized.title} | Hairshop-Pro`;
    const metaDescription =
        (language === 'ru' ? product.metaDescription?.trim() : undefined)
        || localized.description?.trim()
        || `${product.brand} — ${localized.title}`;
    const openGraphImage = product.ogImage?.trim() || product.image;
    const openGraphAlt = product.ogAlt?.trim() || localized.title;

    return buildPublicPageMetadata({
        language,
        path: productPath,
        title: metaTitle,
        description: metaDescription,
        image: { url: openGraphImage || '/placeholder.png', alt: openGraphAlt },
    });
}

export default async function ProductPage({ params }: PageProps): Promise<React.ReactElement> {
    const { id, lang } = await params;
    const language = resolveLanguage(lang);
    const mergedProducts = await getMergedProducts();
    const product = mergedProducts.find((p) => p.id === id);
    if (!product) notFound();

    const [serverUser, approvedReviews] = await Promise.all([
        getServerUser(),
        getProductPublicReviews(product.id),
    ]);
    const canSeePrices = Boolean(serverUser);

    const brandsConfig = await getBrandsConfigFromStore();
    const productBrandSlug = brandSlug(product.brand);
    const productBrandLower = product.brand.toLowerCase();
    const brand = brandsConfig.brands.find(
        (b) =>
            b.id === productBrandSlug ||
            b.name.toLowerCase() === productBrandLower ||
            productBrandSlug.startsWith(b.id + '-') ||
            productBrandLower.startsWith(b.name.toLowerCase() + ' ')
    );
    const manufacturer = brand?.manufacturer;
    const distributor = brand?.distributor;

    const siteUrl = getSiteUrl();
    const productUrl = `${siteUrl}${localizePath(`/product/${product.id}`, language)}`;
    const localized = localizedProductText(product, language);
    const reviewCount = approvedReviews.length;
    const averageRating = reviewCount > 0
        ? approvedReviews.reduce((total, review) => total + review.rating, 0) / reviewCount
        : 0;
    const absoluteImage = (image: string): string => /^https?:\/\//i.test(image) ? image : `${siteUrl}${image}`;

    const productSchema = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        '@id': `${productUrl}#product`,
        name: localized.title,
        image: (product.images?.length ? product.images : product.image ? [product.image] : []).map(absoluteImage),
        description: localized.description?.trim() || `${product.brand} — ${localized.title}`,
        sku: product.sku || product.id,
        ...(product.barcode ? { gtin: product.barcode } : {}),
        brand: {
            '@type': 'Brand',
            name: product.brand,
        },
        ...(canSeePrices ? {
            offers: {
                '@type': 'Offer',
                url: productUrl,
                priceCurrency: 'EUR',
                price: product.price.toFixed(2),
                itemCondition: 'https://schema.org/NewCondition',
                availability:
                    product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
                seller: { '@id': `${siteUrl}/#organization` },
            },
        } : {}),
        ...(reviewCount > 0 ? {
            aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: Number(averageRating.toFixed(2)),
                reviewCount,
            },
            review: approvedReviews.map((review) => ({
                '@type': 'Review',
                author: { '@type': 'Person', name: review.author },
                datePublished: review.createdAt,
                name: review.title,
                reviewBody: review.text,
                reviewRating: { '@type': 'Rating', ratingValue: review.rating, bestRating: 5, worstRating: 1 },
            })),
        } : {}),
    };

    const productIndex = buildProductIndex(mergedProducts);
    const relatedProducts = pickRelated(product, mergedProducts, productIndex);
    const oftenBoughtTogether = pickBoughtTogether(product, productIndex, COPURCHASE);
    const visibleProduct = canSeePrices ? product : redactProductPrices(product);
    const visibleRelated = canSeePrices ? relatedProducts : redactProductPrices(relatedProducts);
    const visibleBoughtTogether = canSeePrices ? oftenBoughtTogether : redactProductPrices(oftenBoughtTogether);

    const breadcrumbSchema = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl}${localizePath('/', language)}` },
            { '@type': 'ListItem', position: 2, name: 'Catalog', item: `${siteUrl}${localizePath('/catalog', language)}` },
            { '@type': 'ListItem', position: 3, name: localized.title, item: productUrl },
        ],
    };

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: serializeJsonLd(productSchema) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }}
            />
            <ProductPageContent
                product={visibleProduct}
                relatedProducts={visibleRelated}
                oftenBoughtTogether={visibleBoughtTogether}
                manufacturer={manufacturer}
                distributor={distributor}
            />
        </>
    );
}

export const viewport = {
    width: 'device-width',
    initialScale: 1,
};
