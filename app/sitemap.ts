import type { MetadataRoute } from 'next'
import { getMergedProducts } from '@/lib/product-overrides-store'
import { getBlogPosts } from '@/lib/blog-store'
import { getBrandsConfigFromStore } from '@/lib/brands-server-store'
import { getSiteUrl } from '@/lib/site-url'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl()
  const now = new Date()

  const staticPaths = [
    '/',
    '/catalog',
    '/blog',
    '/stores',
    '/contact',
    '/delivery-payment',
    '/request-quote',
    '/terms',
    '/privacy',
    '/cookies',
  ]
  const staticRoutes: MetadataRoute.Sitemap = staticPaths.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: now,
  }))

  // Each dynamic section is isolated so a single store failure can't blank the sitemap.
  let productRoutes: MetadataRoute.Sitemap = []
  try {
    const products = await getMergedProducts()
    productRoutes = products.map((product) => ({
      url: `${siteUrl}/product/${product.id}`,
      lastModified: now,
    }))
  } catch {
    /* skip products on failure */
  }

  let blogRoutes: MetadataRoute.Sitemap = []
  try {
    const posts = await getBlogPosts()
    blogRoutes = posts.map((post) => ({
      url: `${siteUrl}/blog/${post.slug}`,
      lastModified: post.updatedAt ? new Date(post.updatedAt) : now,
    }))
  } catch {
    /* skip blog on failure */
  }

  let brandRoutes: MetadataRoute.Sitemap = []
  try {
    const { brands } = await getBrandsConfigFromStore()
    brandRoutes = brands.map((brand) => ({
      url: `${siteUrl}/brand/${brand.id}`,
      lastModified: now,
    }))
  } catch {
    /* skip brands on failure */
  }

  return [...staticRoutes, ...productRoutes, ...blogRoutes, ...brandRoutes]
}
