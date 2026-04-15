import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/site-url'

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl()

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/account',
          '/auth',
          '/cart',
          '/checkout',
          '/wishlist',
          '/order'
        ]
      }
    ],
    sitemap: `${siteUrl}/sitemap.xml`
  }
}
