import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/site-url'

// Private sections exist at the unprefixed (ru) URL and under /en/, /lv/.
const PRIVATE_PATHS = [
  '/admin',
  '/account',
  '/auth',
  '/cart',
  '/checkout',
  '/wishlist',
  '/order'
]

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl()

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: PRIVATE_PATHS.flatMap((path) => [path, `/en${path}`, `/lv${path}`])
      }
    ],
    sitemap: `${siteUrl}/sitemap.xml`
  }
}
