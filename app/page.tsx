import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Hero from '../components/Hero';
import Categories from '../components/Categories';
import Benefits from '../components/Benefits';
import Promo from '../components/Promo';
import Brands from '../components/Brands';
import FAQSection from '../components/FAQSection';
import { translations, type Language } from '@/data/translations';
import HomeClient from '../components/HomeClient';
import Stores from '../components/Stores';
import HomeRetailBanner from '../components/HomeRetailBanner';

const resolveLanguageFromHeader = (acceptLanguage: string | null): Language => {
  const normalized = (acceptLanguage ?? '').toLowerCase();
  if (normalized.includes('ru')) return 'ru';
  if (normalized.includes('lv')) return 'lv';
  return 'en';
}

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const language = resolveLanguageFromHeader(headersList.get('accept-language'));
  const t = translations[language];
  const pageTitle = 'Eshop - Professional Cosmetics';
  const pageDescription = t['meta.homeDescription'] ?? 'Online store of professional cosmetics and equipment';

  return {
    title: pageTitle,
    description: pageDescription,
    alternates: {
      canonical: '/'
    },
    openGraph: {
      title: pageTitle,
      description: pageDescription,
      url: '/'
    }
  };
}

export default async function Home() {
  const headersList = await headers();
  const acceptLanguage = headersList.get('accept-language');
  const language = resolveLanguageFromHeader(acceptLanguage);
  const t = translations[language];
  const pageTitle = 'Eshop - Professional Cosmetics';
  const pageDescription = t['meta.homeDescription'] ?? 'Online store of professional cosmetics and equipment';

  return (
    <>
      <Hero />
      <main className="w-full py-6">
        <HomeRetailBanner />
        <Categories />
        <HomeClient />
        {/* <Products /> removed from homepage */}
        <Benefits />
        <Promo />
        <Brands />
        <FAQSection />
      </main>
    </>
  );
}
