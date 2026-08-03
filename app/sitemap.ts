import type { MetadataRoute } from 'next'
import { getMergedProducts } from '@/lib/product-overrides-store'
import { getBlogPosts } from '@/lib/blog-store'
import { getBrandsConfigFromStore } from '@/lib/brands-server-store'
import { getSiteUrl } from '@/lib/site-url'
import { LANGUAGES, localizePath } from '@/lib/i18n-routing'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl()
  const langUrl = (path: string, lang: (typeof LANGUAGES)[number]): string =>
    `${siteUrl}${localizePath(path, lang)}`

  // One entry per language version, each carrying the full hreflang set
  // (Google requires every alternate to list all alternates including itself).
  const entriesFor = (path: string, lastModified?: Date): MetadataRoute.Sitemap =>
    LANGUAGES.map((lang) => ({
      url: langUrl(path, lang),
      ...(lastModified ? { lastModified } : {}),
      alternates: {
        languages: {
          ru: langUrl(path, 'ru'),
          en: langUrl(path, 'en'),
          lv: langUrl(path, 'lv'),
          'x-default': langUrl(path, 'ru'),
        },
      },
    }))

  const staticPaths = [
    '/',
    '/catalog',
    '/blog',
    '/stores',
    '/contact',
    '/delivery',
    '/payment',
    '/request-quote',
    '/return-policy',
    '/terms',
    '/privacy',
    '/cookies',
  ]
  const staticRoutes: MetadataRoute.Sitemap = staticPaths.flatMap((path) => entriesFor(path))
  const categoryRoutes: MetadataRoute.Sitemap = ['hair', 'nails', 'face', 'body', 'equipment']
    .flatMap((category) => entriesFor(`/category/${category}`))

  // Each dynamic section is isolated so a single store failure can't blank the sitemap.
  let productRoutes: MetadataRoute.Sitemap = []
  try {
    const products = await getMergedProducts()
    productRoutes = products.flatMap((product) => entriesFor(`/product/${product.id}`, product.updatedAt))
  } catch {
    /* skip products on failure */
  }

  let blogRoutes: MetadataRoute.Sitemap = []
  try {
    const posts = await getBlogPosts()
    blogRoutes = posts.flatMap((post) =>
      entriesFor(`/blog/${post.slug}`, new Date(post.updatedAt ?? post.createdAt))
    )
  } catch {
    /* skip blog on failure */
  }

  let brandRoutes: MetadataRoute.Sitemap = []
  try {
    const { brands } = await getBrandsConfigFromStore()
    brandRoutes = brands.flatMap((brand) => entriesFor(`/brand/${brand.id}`))
  } catch {
    /* skip brands on failure */
  }

  return [...staticRoutes, ...categoryRoutes, ...productRoutes, ...blogRoutes, ...brandRoutes]
}
