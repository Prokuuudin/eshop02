import { NextResponse, type NextRequest } from 'next/server'
import { LANGUAGES } from '@/lib/i18n-routing'
import type { ShopChannel } from '@/lib/shop-channel'

/**
 * Routes that exist only for the B2B deployment: the admin panel and its API, the B2B
 * integration API (API keys), RFQ, the internal catalog/taxonomy sync endpoints and the
 * first-admin setup. A B2C deployment shares the database, so these must not be served
 * there at all — not merely hidden in the UI.
 *
 * Paths are unprefixed and lower-case; a prefix matches itself and everything below it.
 */
export const B2B_ONLY_ROUTE_PREFIXES = [
  '/admin',
  '/request-quote',
  '/auth/admin-setup',
  '/api/admin',
  '/api/v1',
  '/api/rfq',
  '/api/internal',
  '/api/auth/admin-setup',
] as const

const LANGUAGE_SEGMENTS = new Set<string>(LANGUAGES)

/**
 * Canonical form used only for the B2B-only check: percent-decoded (repeatedly, so double
 * encoding does not hide a segment), backslashes as slashes, empty and dot segments
 * resolved, lower-cased, language prefixes removed. Over-matching is harmless here: a
 * path that only looks like a B2B route after normalisation is not a real page either.
 * Returns null when the path cannot be decoded.
 */
export function normalizeRoutePath(pathname: string): string | null {
  let decoded = pathname
  for (let round = 0; round < 5; round += 1) {
    let next: string
    try {
      next = decodeURIComponent(decoded)
    } catch {
      return null
    }
    if (next === decoded) break
    decoded = next
  }

  const segments: string[] = []
  for (const raw of decoded.replace(/\\/g, '/').split('/')) {
    const segment = raw.trim().toLowerCase()
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  while (segments.length > 0 && LANGUAGE_SEGMENTS.has(segments[0])) segments.shift()
  return `/${segments.join('/')}`
}

/** True when the path is (or normalises to) a B2B-only route. Undecodable paths fail closed. */
export function isB2bOnlyRoute(pathname: string): boolean {
  const normalized = normalizeRoutePath(pathname)
  if (normalized === null) return true
  return B2B_ONLY_ROUTE_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))
}

function rawPathname(request: NextRequest): string {
  try {
    return new URL(request.url).pathname
  } catch {
    return request.nextUrl.pathname
  }
}

/**
 * Proxy gate: in a B2C deployment every B2B-only route answers 404 before any route code
 * runs. B2B deployments are untouched (always null). The channel comes from the caller
 * (getShopChannel(), i.e. the server environment), never from the request.
 */
export function guardShopChannelRoute(request: NextRequest, channel: ShopChannel): NextResponse | null {
  if (channel === 'b2b') return null
  const blocked = isB2bOnlyRoute(request.nextUrl.pathname) || isB2bOnlyRoute(rawPathname(request))
  if (!blocked) return null

  const headers = { 'Cache-Control': 'no-store' }
  return isApiPath(request)
    ? NextResponse.json({ error: 'not_found' }, { status: 404, headers })
    : new NextResponse('Not Found', { status: 404, headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' } })
}

function isApiPath(request: NextRequest): boolean {
  const normalized = normalizeRoutePath(request.nextUrl.pathname)
  return normalized === '/api' || Boolean(normalized?.startsWith('/api/'))
}
