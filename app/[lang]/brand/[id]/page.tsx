import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSiteUrl } from '@/lib/site-url';
import { translations, type Language } from '@/data/translations';
import { getBrandsConfigFromStore } from '@/lib/brands-server-store';
import { DEFAULT_LANGUAGE, pageAlternates, localizePath, resolveLanguage } from '@/lib/i18n-routing';
import { serializeJsonLd } from '@/lib/json-ld';

type PageProps = { params: Promise<{ lang: string; id: string }> }

const interpolate = (template: string, params: Record<string, string>): string => {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => params[key] ?? match)
}

export const revalidate = 3600

// Prerender only the default language at build time (~220 brands); /en and /lv
// versions are built on demand via ISR — keeps the build from tripling in size.
export async function generateStaticParams(): Promise<Array<{ lang: string; id: string }>> {
  const config = await getBrandsConfigFromStore()
  return config.brands.map((brand) => ({ lang: DEFAULT_LANGUAGE, id: brand.id }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id, lang } = await params;
  const config = await getBrandsConfigFromStore()
  const language = resolveLanguage(lang);
  const t = translations[language];
  const brand = config.brands.find((b) => b.id === id);

  if (!brand) {
    return {
      title: `${t['meta.brandNotFoundTitle'] ?? 'Brand not found'} | Eshop`,
      description: t['meta.brandNotFoundDescription'] ?? 'Requested brand was not found',
      robots: {
        index: false,
        follow: false
      }
    };
  }

  const descriptionTemplate = t['brands.descriptionTemplate'] ?? 'Products of brand {brand}.';
  const description = brand.description?.[language] || brand.description?.en || brand.description?.ru || interpolate(descriptionTemplate, { brand: brand.name });
  const path = `/brand/${brand.id}`;

  return {
    title: `${brand.name} | Eshop`,
    description,
    openGraph: {
      title: `${brand.name} | Eshop`,
      description,
      images: [{ url: brand.logo, alt: brand.name }],
      url: localizePath(path, language),
      type: 'website'
    },
    alternates: pageAlternates(path, language)
  };
}

export default async function BrandPage({ params }: PageProps) {
  const { id, lang } = await params;
  const config = await getBrandsConfigFromStore()
  const language: Language = resolveLanguage(lang);
  const t = translations[language];
  const brand = config.brands.find(b => b.id === id);
  if (!brand) notFound();
  const descriptionTemplate = t['brands.descriptionTemplate'] ?? 'Products of brand {brand}.';
  const description = brand.description?.[language] || brand.description?.en || brand.description?.ru || interpolate(descriptionTemplate, { brand: brand.name });
  const siteUrl = getSiteUrl();
  const brandUrl = `${siteUrl}${localizePath(`/brand/${brand.id}`, language)}`;

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl}${localizePath('/', language)}` },
      { '@type': 'ListItem', position: 2, name: 'Brands', item: `${siteUrl}${localizePath('/', language)}#brands` },
      { '@type': 'ListItem', position: 3, name: brand.name, item: brandUrl }
    ]
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }} />
      <div className="max-w-xl mx-auto py-8 px-4">
        <Link href="/" className="text-primary hover:underline">← {t['meta.backToBrands'] ?? 'Back to brands'}</Link>
        <div className="flex flex-col items-center mt-6">
          <div className="w-32 h-16 relative mb-4">
            <Image src={brand.logo} alt={brand.name} fill className="object-contain" />
          </div>
          <h1 className="text-2xl font-bold mb-2">{brand.name}</h1>
          <p className="text-gray-600 text-center mb-6">
            {description}
          </p>
          <Link
            href={`/catalog?brand=${encodeURIComponent(brand.id)}`}
            className="inline-block px-4 py-2 bg-primary/5 text-primary rounded hover:bg-primary/10 transition"
          >
            {t['brands.viewAllProducts'] ?? 'View all brand products'}
          </Link>
        </div>
      </div>
    </>
  );
}
