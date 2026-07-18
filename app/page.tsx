import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Hero from '../components/Hero';
import BestsellersSection from '../components/BestsellersSection';
import Categories from '../components/Categories';
import Benefits from '../components/Benefits';
import BonusSection from '../components/BonusSection';
import SaleSection from '../components/SaleSection';
import Brands from '../components/Brands';
import FAQSection from '../components/FAQSection';
import ProductRequestSection from '../components/ProductRequestSection';
import { translations, type Language } from '@/data/translations';
import HomeClient from '../components/HomeClient';
import HomeRetailBanner from '../components/HomeRetailBanner';

const resolveLanguageFromHeader = (acceptLanguage: string | null): Language => {
    const normalized = (acceptLanguage ?? '').toLowerCase();
    if (normalized.includes('ru')) return 'ru';
    if (normalized.includes('lv')) return 'lv';
    return 'en';
};

export async function generateMetadata(): Promise<Metadata> {
    const headersList = await headers();
    const language = resolveLanguageFromHeader(headersList.get('accept-language'));
    const t = translations[language];
    const pageTitle = 'Hairshop-Pro - Professional Hair Instruments and Cosmetics';
    const pageDescription =
        t['meta.homeDescription'] ?? 'Online store of professional cosmetics and equipment';

    return {
        title: pageTitle,
        description: pageDescription,
        alternates: {
            canonical: '/',
        },
        openGraph: {
            title: pageTitle,
            description: pageDescription,
            url: '/',
        },
    };
}

export default async function Home() {
    return (
        <div className="bg-white dark:bg-background">
            <Hero />
            <Benefits />
            <BestsellersSection />
            <Categories />
            <Brands />
            <SaleSection />
            <ProductRequestSection />
            <main className="w-full py-6">
                <HomeRetailBanner />
                <HomeClient />
            </main>
            <BonusSection />
            <FAQSection />
        </div>
    );
}
