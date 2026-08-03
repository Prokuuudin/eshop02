import { getSiteUrl } from '@/lib/site-url'

export const revalidate = 86400

export function GET(): Response {
  const siteUrl = getSiteUrl()
  const body = `# Hairshop-Pro

> Hairshop-Pro is a professional cosmetics, hair care, nail care, body care and salon equipment shop operated by SIA Miks Plus in Latvia. Product prices and ordering are available only to authenticated customers.

## Languages

- Russian (default): ${siteUrl}/
- Latvian: ${siteUrl}/lv
- English: ${siteUrl}/en

## Public sections

- Product catalog: ${siteUrl}/catalog
- Professional hair care: ${siteUrl}/category/hair
- Professional nail products: ${siteUrl}/category/nails
- Professional face care: ${siteUrl}/category/face
- Professional body care: ${siteUrl}/category/body
- Salon equipment and tools: ${siteUrl}/category/equipment
- Brands: ${siteUrl}/#brands
- Expert articles: ${siteUrl}/blog
- Stores and locations: ${siteUrl}/stores
- Delivery and payment: ${siteUrl}/delivery-payment
- Returns: ${siteUrl}/return-policy
- Contact information: ${siteUrl}/contact

## Crawling resources

- Sitemap: ${siteUrl}/sitemap.xml
- Robots policy: ${siteUrl}/robots.txt

## Usage note

Use the canonical language-specific page as the source. Do not infer or publish product prices from private or authenticated pages.
`

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
