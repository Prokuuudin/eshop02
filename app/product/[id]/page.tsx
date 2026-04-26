import React from 'react'
import Link from 'next/link'
import type { Metadata } from 'next'
import ProductPageContent from '@/components/ProductPageContent'
import { getSiteUrl } from '@/lib/site-url'
import { translations, type Language } from '@/data/translations'
import { getMergedProducts } from '@/lib/product-overrides-store'

type PageProps = {
  params: Promise<{
    id: string
  }>
}

const interpolate = (template: string, params: Record<string, string>): string => {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => params[key] ?? match)
}

export const revalidate = 3600
const DEFAULT_METADATA_LANGUAGE: Language = 'en'

export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  const products = await getMergedProducts()
  return products.map((p) => ({
    id: p.id
  }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const t = translations[DEFAULT_METADATA_LANGUAGE]
  const mergedProducts = await getMergedProducts()
  const product = mergedProducts.find((p) => p.id === id)

  if (!product) {
    return {
      title: `${t['product.notFound'] ?? 'Product not found'} | Eshop`,
      description: t['product.notFoundDescription'] ?? 'Requested product was not found',
      robots: {
        index: false,
        follow: false
      }
    }
  }

  const productPath = `/product/${product.id}`
  const metaTitle = product.metaTitle?.trim() || `${product.title} | Eshop`
  const metaDescription = product.metaDescription?.trim() || `${product.brand} - ${product.title}`
  const openGraphImage = product.ogImage?.trim() || product.image
  const openGraphAlt = product.ogAlt?.trim() || product.title

  return {
    title: metaTitle,
    description: metaDescription,
    openGraph: {
      title: metaTitle,
      description: metaDescription,
      images: [{ url: openGraphImage, alt: openGraphAlt }],
      url: productPath,
      type: 'website'
    },
    alternates: {
      canonical: productPath
    }
  }
}

export default async function ProductPage({ params }: PageProps) {
  const { id } = await params
  const t = translations[DEFAULT_METADATA_LANGUAGE]
  const mergedProducts = await getMergedProducts()
  const product = mergedProducts.find((p) => p.id === id)

  if (!product) {
    return (
      <main className="w-full px-4 py-8 text-gray-900 dark:text-gray-100">
        <p className="text-center text-gray-700 dark:text-gray-300">{t['product.notFound'] ?? 'Product not found'}</p>
        <Link href="/catalog" className="text-indigo-600 inline-block mt-4">
          {t['product.backToCatalog'] ?? 'Back to catalog'}
        </Link>
      </main>
    )
  }

  const siteUrl = getSiteUrl()
  const productUrl = `${siteUrl}/product/${product.id}`
  const schemaReviewCount = product.reviewCount ?? product.ratingCount ?? 127

  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    image: [`${siteUrl}${product.image}`],
    description: `${product.brand} - ${product.title}`,
    sku: product.id,
    brand: {
      '@type': 'Brand',
      name: product.brand
    },
    offers: {
      '@type': 'Offer',
      url: productUrl,
      priceCurrency: 'EUR',
      price: product.price.toFixed(2),
      availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: product.rating,
      reviewCount: schemaReviewCount
    },
    review: [
      {
        '@type': 'Review',
        author: { '@type': 'Person', name: 'Eshop Customer' },
        reviewRating: { '@type': 'Rating', ratingValue: product.rating, bestRating: 5 },
        reviewBody: interpolate(t['product.reviewBodyTemplate'] ?? 'Customers rated the product {title} highly.', { title: product.title })
      }
    ]
  }

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: 'Catalog', item: `${siteUrl}/catalog` },
      { '@type': 'ListItem', position: 3, name: product.title, item: productUrl }
    ]
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <ProductPageContent product={product} allProducts={mergedProducts} />
    </>
  )
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
}
