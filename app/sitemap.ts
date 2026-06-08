import type { MetadataRoute } from 'next'
import { getMergedProducts } from '@/lib/product-overrides-store'
import { getSiteUrl } from '@/lib/site-url'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl()
  const now = new Date()

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/`,
      lastModified: now
    },
    {
      url: `${siteUrl}/catalog`,
      lastModified: now
    },
    {
      url: `${siteUrl}/delivery-payment`,
      lastModified: now
    },
    {
      url: `${siteUrl}/request-quote`,
      lastModified: now
    }
  ]

  const products = await getMergedProducts()
  const productRoutes: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${siteUrl}/product/${product.id}`,
    lastModified: now
  }))

  return [...staticRoutes, ...productRoutes]
}
