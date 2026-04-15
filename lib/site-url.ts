const LOCAL_DEV_URL = 'http://localhost:3000'
const PROD_FALLBACK_URL = 'https://example.com'

function normalizeUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

export function getSiteUrl(): string {
  const publicSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (publicSiteUrl) {
    return normalizeUrl(publicSiteUrl)
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return normalizeUrl(window.location.origin)
  }

  const vercelUrl = process.env.VERCEL_URL?.trim()
  if (vercelUrl) {
    const withProtocol = vercelUrl.startsWith('http') ? vercelUrl : `https://${vercelUrl}`
    return normalizeUrl(withProtocol)
  }

  if (process.env.NODE_ENV === 'development') {
    return LOCAL_DEV_URL
  }

  return PROD_FALLBACK_URL
}

export function getMetadataBase(): URL {
  return new URL(getSiteUrl())
}
