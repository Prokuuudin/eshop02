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
import { translations } from '@/data/translations';
import { resolveLanguage } from '@/lib/i18n-routing';
import { buildPublicPageMetadata } from '@/lib/page-metadata';
import HomeRetailBanner from '@/components/HomeRetailBanner';
import AboutSection from '@/components/AboutSection';
import Reveal from '@/components/ui/Reveal';
import { getServerContent } from '@/lib/server-translation';
import { serializeJsonLd } from '@/lib/json-ld';

type PageProps = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const language = resolveLanguage((await params).lang);
    const t = translations[language];
    const pageTitle = t['meta.homeTitle'] ?? 'Hairshop-Pro - Professional Hair Instruments and Cosmetics';
    const pageDescription =
        t['meta.homeDescription'] ?? 'Online store of professional cosmetics and equipment';

    return buildPublicPageMetadata({ language, path: '/', title: pageTitle, description: pageDescription });
}

export default async function Home({ params }: PageProps): Promise<JSX.Element> {
    const language = resolveLanguage((await params).lang);
    const { t } = await getServerContent(language);
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
            <Hero language={language} />
            <Reveal><Benefits language={language} /></Reveal>
            <BestsellersSection />
            <Reveal><Categories /></Reveal>
            <Reveal><Brands /></Reveal>
            <SaleSection />
            <Reveal><ProductRequestSection /></Reveal>
            <main className="w-full py-6">
                <Reveal><HomeRetailBanner /></Reveal>
                <Reveal><AboutSection language={language} /></Reveal>
            </main>
            <Reveal><BonusSection /></Reveal>
            <Reveal><FAQSection language={language} /></Reveal>
        </div>
    );
}
