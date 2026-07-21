const LOCAL_DEV_URL = 'http://localhost:3000'

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

  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXT_PUBLIC_SITE_URL or VERCEL_URL must be configured in production')
  }

  return LOCAL_DEV_URL
}

export function getMetadataBase(): URL {
  return new URL(getSiteUrl())
}
