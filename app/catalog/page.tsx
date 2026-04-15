import React from 'react'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Products from '@/components/Products'
import { getSiteUrl } from '@/lib/site-url'
import { translations, type Language } from '@/data/translations'

export const revalidate = 3600

const resolveLanguageFromHeader = (acceptLanguage: string | null): Language => {
  const normalized = (acceptLanguage ?? '').toLowerCase()
  if (normalized.includes('ru')) return 'ru'
  if (normalized.includes('lv')) return 'lv'
  return 'en'
}

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers()
  const language = resolveLanguageFromHeader(headersList.get('accept-language'))
  const t = translations[language]
  const pageTitle = `${t['nav.catalog'] ?? 'Catalog'} | Eshop`
  const pageDescription = t['meta.catalogDescription'] ?? 'Catalog of professional cosmetics and equipment'

  return {
    title: pageTitle,
    description: pageDescription,
    openGraph: {
      title: pageTitle,
      description: pageDescription,
      url: '/catalog'
    },
    alternates: {
      canonical: '/catalog'
    }
  }
}

type PageProps = {
  searchParams: Promise<{
    cat?: string
    subcat?: string
    brands?: string
    brand?: string
    minPrice?: string
    maxPrice?: string
    search?: string
    page?: string
  }>
}

export default async function CatalogPage({ searchParams }: PageProps) {
  const headersList = await headers()
  const language = resolveLanguageFromHeader(headersList.get('accept-language'))
  const t = translations[language]

  const params = await searchParams;

  const category = params.cat?.trim() || '';
  const subcategory = params.subcat?.trim() || '';
  const brands = (params.brands ?? params.brand ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const rawSearch = params.search?.trim() || '';

  const minPriceValue = params.minPrice ? Number.parseInt(params.minPrice, 10) : NaN;
  const maxPriceValue = params.maxPrice ? Number.parseInt(params.maxPrice, 10) : NaN;

  const minPrice = Number.isFinite(minPriceValue) ? String(minPriceValue) : '';
  const maxPrice = Number.isFinite(maxPriceValue) ? String(maxPriceValue) : '';

  const siteUrl = getSiteUrl();
  const urlParams = new URLSearchParams();
  if (params.search) urlParams.set('search', params.search);
  if (params.subcat) urlParams.set('subcat', params.subcat);
  if (params.cat) urlParams.set('cat', params.cat);
  if (brands.length > 0) urlParams.set('brands', brands.join(','));
  if (params.minPrice) urlParams.set('minPrice', params.minPrice);
  if (params.maxPrice) urlParams.set('maxPrice', params.maxPrice);
  if (params.page && params.page !== '1') urlParams.set('page', params.page);

  const query = urlParams.toString();
  const catalogPath = query ? `/catalog?${query}` : '/catalog';
  const currentCrumbName = t['nav.catalog'] ?? 'Catalog';

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: currentCrumbName, item: `${siteUrl}${catalogPath}` }
    ]
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <main>
        <Products
          initialSearch={rawSearch}
          initialSubcategory={subcategory}
          initialFilters={{
            group: category,
            brands,
            minPrice,
            maxPrice
          }}
        />
      </main>
    </>
  );
}
