import React from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Products from '@/components/Products'
import { getSiteUrl } from '@/lib/site-url'
import { translations } from '@/data/translations'
import { localizePath, resolveLanguage } from '@/lib/i18n-routing'
import { buildPublicPageMetadata } from '@/lib/page-metadata'
import { getInitialCatalogProducts } from '@/lib/initial-catalog-products'
import { serializeJsonLd } from '@/lib/json-ld'

export const revalidate = 3600

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const language = resolveLanguage((await params).lang)
  const query = await searchParams
  const t = translations[language]
  const parsedPage = Number.parseInt(query.page ?? '1', 10)
  const pageNumber = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const invalidPage = query.page !== undefined && String(pageNumber) !== query.page
  const isPaginated = pageNumber > 1
  const hasFilters = Boolean(
    query.cat || query.subcat || query.brands || query.brand
    || query.minPrice || query.maxPrice || query.search || query.onSale
  )
  const pageTitle = `${t['nav.catalog'] ?? 'Catalog'}${isPaginated ? ` — ${pageNumber}` : ''} | Hairshop-Pro`
  const pageDescription = t['meta.catalogDescription'] ?? 'Catalog of professional cosmetics and equipment'
  const canonicalPath = isPaginated ? `/catalog?page=${pageNumber}` : '/catalog'

  return {
    ...buildPublicPageMetadata({ language, path: canonicalPath, title: pageTitle, description: pageDescription }),
    ...((hasFilters || invalidPage) ? { robots: { index: false, follow: true } } : {}),
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
    onSale?: string
    order?: string
    search?: string
    page?: string
  }>
}

export default async function CatalogPage({ params: routeParams, searchParams }: PageProps): Promise<React.ReactElement> {
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
  const onSale = params.onSale === '1';
  const order = ['price-asc', 'price-desc', 'name-asc', 'name-desc'].includes(params.order ?? '')
    ? (params.order as string)
    : '';

  const parsedPage = Number.parseInt(params.page ?? '1', 10);
  const pageNumber = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const initialCatalog = await getInitialCatalogProducts({
    language,
    category: category || undefined,
    subcategory: params.subcat?.trim() || undefined,
    brands,
    search: rawSearch,
    minPrice: Number.isFinite(minPriceValue) ? minPriceValue : undefined,
    maxPrice: Number.isFinite(maxPriceValue) ? maxPriceValue : undefined,
    onSale,
    order: order || undefined,
    page: pageNumber,
  });

  if (pageNumber > initialCatalog.totalPages) notFound();

  const siteUrl = getSiteUrl();
  const urlParams = new URLSearchParams();
  if (params.search) urlParams.set('search', params.search);
  if (params.subcat) urlParams.set('subcat', params.subcat);
  if (params.cat) urlParams.set('cat', params.cat);
  if (brands.length > 0) urlParams.set('brands', brands.join(','));
  if (params.minPrice) urlParams.set('minPrice', params.minPrice);
  if (params.maxPrice) urlParams.set('maxPrice', params.maxPrice);
  if (onSale) urlParams.set('onSale', '1');
  if (order) urlParams.set('order', order);
  if (pageNumber > 1) urlParams.set('page', String(pageNumber));

  const query = urlParams.toString();
  const catalogPath = query ? `/catalog?${query}` : '/catalog';
  const currentCrumbName = t['nav.catalog'] ?? 'Catalog';
  const pageHref = (targetPage: number): string => {
    const targetParams = new URLSearchParams(urlParams)
    if (targetPage > 1) targetParams.set('page', String(targetPage))
    else targetParams.delete('page')
    const targetQuery = targetParams.toString()
    return localizePath(targetQuery ? `/catalog?${targetQuery}` : '/catalog', language)
  }

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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }} />
      <div>
        <Products
          key={catalogPath}
          initialProducts={initialCatalog.products}
          initialSearch={rawSearch}
          initialSubcat={params.subcat?.trim() || ''}
          initialFilters={{
            group: category,
            brands,
            minPrice,
            maxPrice,
            onSale,
            order
          }}
          serverPagination
        />
        {initialCatalog.totalPages > 1 && (
          <nav className="mx-auto flex max-w-7xl items-center justify-center gap-3 px-4 pb-10" aria-label="Pagination">
            {pageNumber > 1 && (
              <Link className="rounded-md border border-border px-4 py-2 hover:bg-muted" href={pageHref(pageNumber - 1)}>
                {language === 'ru' ? 'Назад' : language === 'lv' ? 'Iepriekšējā' : 'Previous'}
              </Link>
            )}
            <span className="text-sm text-muted-foreground">
              {language === 'ru' ? 'Страница' : language === 'lv' ? 'Lapa' : 'Page'} {pageNumber} / {initialCatalog.totalPages}
            </span>
            {pageNumber < initialCatalog.totalPages && (
              <Link className="rounded-md border border-border px-4 py-2 hover:bg-muted" href={pageHref(pageNumber + 1)}>
                {language === 'ru' ? 'Далее' : language === 'lv' ? 'Nākamā' : 'Next'}
              </Link>
            )}
          </nav>
        )}
      </div>
    </>
  );
}
