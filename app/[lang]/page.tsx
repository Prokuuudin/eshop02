import type { Metadata } from 'next';
import type { JSX } from 'react';
import Hero from '@/components/Hero';
import BestsellersSection from '@/components/BestsellersSection';
import Categories from '@/components/Categories';
import Benefits from '@/components/Benefits';
import BonusSection from '@/components/BonusSection';
import SaleSection from '@/components/SaleSection';
import Brands from '@/components/Brands';
import FAQSection from '@/components/FAQSection';
import ProductRequestSection from '@/components/ProductRequestSection';
import { resolveLanguage } from '@/lib/i18n-routing';
import { buildPublicPageMetadata } from '@/lib/page-metadata';
import HomeRetailBanner from '@/components/HomeRetailBanner';
import AboutSection from '@/components/AboutSection';
import BannerZoneBlock from '@/components/BannerZoneBlock';
import Reveal from '@/components/ui/Reveal';
import type { BannerZone } from '@/lib/banners-server-store';
import { getServerContent } from '@/lib/server-translation';
import { serializeJsonLd } from '@/lib/json-ld';
import {
    getCachedBestsellers,
    getCachedBrands,
    getCachedCategories,
    getCachedSaleBanners,
    getCachedSaleProducts,
} from '@/lib/storefront-cache';
import { getServerUser } from '@/lib/server-auth';
import { redactProductPrices } from '@/lib/product-price-visibility';

type PageProps = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const language = resolveLanguage((await params).lang);
    const { t } = await getServerContent(language);
    const pageTitle = t('meta.homeTitle', 'Hairshop-Pro - Professional Hair Instruments and Cosmetics');
    const pageDescription =
        t('meta.homeDescription', 'Online store of professional cosmetics and equipment');

    return buildPublicPageMetadata({ language, path: '/', title: pageTitle, description: pageDescription });
}

export default async function Home({ params }: PageProps): Promise<JSX.Element> {
    const language = resolveLanguage((await params).lang);
    const [{ t }, categories, brands, bestsellers, saleProducts, saleBanners, user] = await Promise.all([
        getServerContent(language),
        getCachedCategories(),
        getCachedBrands(),
        getCachedBestsellers(),
        getCachedSaleProducts(),
        getCachedSaleBanners(),
        getServerUser(),
    ]);
    const visibleBestsellers = user ? bestsellers : redactProductPrices(bestsellers);
    const visibleSaleProducts = user ? saleProducts : redactProductPrices(saleProducts);
    const bannersInZone = (zone: BannerZone) => saleBanners.filter((item) => item.zone === zone);
    const faqIds = [1, 2, 4, 5, 6, 7, 8, 10, 11, 12];
    const faqSchema = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqIds.map((id) => ({
            '@type': 'Question',
            name: t(`faq.site.q${id}`),
            acceptedAnswer: {
                '@type': 'Answer',
                text: t(`faq.site.a${id}`),
            },
        })),
    };
    return (
        <div className="bg-white dark:bg-background">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqSchema) }}
            />
            {bannersInZone('top').length > 0 && <Reveal><BannerZoneBlock banners={bannersInZone('top')} /></Reveal>}
            <Hero language={language} />
            {bannersInZone('hero').length > 0 && <Reveal><BannerZoneBlock banners={bannersInZone('hero')} /></Reveal>}
            <Reveal><Benefits language={language} /></Reveal>
            {bannersInZone('benefits').length > 0 && <Reveal><BannerZoneBlock banners={bannersInZone('benefits')} /></Reveal>}
            <SaleSection products={visibleSaleProducts} banners={bannersInZone('sale')} />
            <BestsellersSection products={visibleBestsellers} />
            {bannersInZone('bestsellers').length > 0 && <Reveal><BannerZoneBlock banners={bannersInZone('bestsellers')} /></Reveal>}
            <Reveal><Categories initialCategories={categories} /></Reveal>
            {bannersInZone('categories').length > 0 && <Reveal><BannerZoneBlock banners={bannersInZone('categories')} /></Reveal>}
            <Reveal><Brands initialBrands={brands} /></Reveal>
            {bannersInZone('brands').length > 0 && <Reveal><BannerZoneBlock banners={bannersInZone('brands')} /></Reveal>}
            {user && <Reveal><ProductRequestSection /></Reveal>}
            {user && bannersInZone('productRequest').length > 0 && <Reveal><BannerZoneBlock banners={bannersInZone('productRequest')} /></Reveal>}
            <main className="w-full">
                <Reveal><HomeRetailBanner /></Reveal>
                <Reveal><AboutSection language={language} /></Reveal>
            </main>
            {bannersInZone('retail').length > 0 && <Reveal><BannerZoneBlock banners={bannersInZone('retail')} /></Reveal>}
            <Reveal><BonusSection /></Reveal>
            {bannersInZone('bonus').length > 0 && <Reveal><BannerZoneBlock banners={bannersInZone('bonus')} /></Reveal>}
            <Reveal><FAQSection language={language} /></Reveal>
            {bannersInZone('faq').length > 0 && <Reveal><BannerZoneBlock banners={bannersInZone('faq')} /></Reveal>}
        </div>
    );
}
