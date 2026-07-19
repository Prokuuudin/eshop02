import React from 'react'
import type { Metadata } from 'next'
import Products from '@/components/Products'
import { getSiteUrl } from '@/lib/site-url'
import { translations } from '@/data/translations'
import { pageAlternates, localizePath, resolveLanguage } from '@/lib/i18n-routing'

export const revalidate = 3600

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const language = resolveLanguage((await params).lang)
  const t = translations[language]
  const pageTitle = `${t['nav.catalog'] ?? 'Catalog'} | Eshop`
  const pageDescription = t['meta.catalogDescription'] ?? 'Catalog of professional cosmetics and equipment'

  return {
    title: pageTitle,
    description: pageDescription,
    openGraph: {
      title: pageTitle,
      description: pageDescription,
      url: localizePath('/catalog', language)
    },
    alternates: pageAlternates('/catalog', language)
  }
}

type PageProps = {
  params: Promise<{ lang: string }>
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

export default async function CatalogPage({ params: routeParams, searchParams }: PageProps) {
  const language = resolveLanguage((await routeParams).lang)
  const t = translations[language]

  const params = await searchParams;

  const category = params.cat?.trim() || '';
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
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl}${localizePath('/', language)}` },
      { '@type': 'ListItem', position: 2, name: currentCrumbName, item: `${siteUrl}${localizePath(catalogPath, language)}` }
    ]
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <main>
        <Products
          initialSearch={rawSearch}
          initialSubcat={params.subcat?.trim() || ''}
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
