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
import { pageAlternates, localizePath, resolveLanguage } from '@/lib/i18n-routing';
import HomeRetailBanner from '@/components/HomeRetailBanner';
import AboutSection from '@/components/AboutSection';

type PageProps = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const language = resolveLanguage((await params).lang);
    const t = translations[language];
    const pageTitle = t['meta.homeTitle'] ?? 'Hairshop-Pro - Professional Hair Instruments and Cosmetics';
    const pageDescription =
        t['meta.homeDescription'] ?? 'Online store of professional cosmetics and equipment';

    return {
        title: pageTitle,
        description: pageDescription,
        alternates: pageAlternates('/', language),
        openGraph: {
            title: pageTitle,
            description: pageDescription,
            url: localizePath('/', language),
        },
    };
}

export default async function Home({ params }: PageProps): Promise<JSX.Element> {
    const language = resolveLanguage((await params).lang);
    return (
        <div className="bg-white dark:bg-background">
            <Hero language={language} />
            <Benefits language={language} />
            <BestsellersSection />
            <Categories />
            <Brands />
            <SaleSection />
            <ProductRequestSection />
            <main className="w-full py-6">
                <HomeRetailBanner />
                <AboutSection language={language} />
            </main>
            <BonusSection />
            <FAQSection language={language} />
        </div>
    );
}
